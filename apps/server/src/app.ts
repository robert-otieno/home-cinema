import { createAuthBackdrop } from "./auth-backdrop.ts";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { createReadStream } from "node:fs";
import { mkdir, stat, realpath, readFile, readdir } from "node:fs/promises";
import { resolve, join, isAbsolute, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { networkInterfaces, cpus, totalmem, freemem, uptime } from "node:os";
import { statfs } from "node:fs/promises";
import { z, ZodError } from "zod";
import { eq, and, asc, desc, sql, inArray, type SQL } from "drizzle-orm";
import chokidar from "chokidar";
import QRCode from "qrcode";
import {
  openDatabase,
  users,
  profiles,
  authSessions,
  libraries,
  movies,
  mediaFiles,
  progress,
  watchlist,
  scanJobs,
  playbackSessions,
  settings,
  watchHistory,
  transcodeJobs,
} from "@cinema/database";
import { safePath, within, byteRange, mime, run } from "@cinema/media-core";
import { config } from "./config.ts";
import {
  hashPassword,
  verifyPassword,
  secret,
  sessionHash,
} from "./security.ts";
import { createScanner } from "./scanner.ts";
import { createStreaming } from "./streaming.ts";
import { searchMetadata, applyMetadata } from "./metadata.ts";
import { hardwareCapabilities, chooseEncoder } from "./hardware.ts";
import { HttpError } from "./context.ts";
import { readSettings, writeSettings, settingsSchema } from "./settings.ts";

declare module "fastify" {
  interface FastifyRequest {
    identity: {
      userId: string;
      profileId: string | null;
      sessionId: string;
    } | null;
  }
}
export async function buildApp(
  options: { logger?: boolean; watch?: boolean } = {},
) {
  const app = Fastify({
    trustProxy: config.TRUST_PROXY === "true" ? "127.0.0.1" : false,
    logger: options.logger ?? true,
    bodyLimit: 65536,
    requestTimeout: 30000,
  });
  const { db, client } = await openDatabase(config.DATA_DIR);
  const dummyHash = await hashPassword(secret());
  let preferences = await readSettings(db);
  const persisted = await db.query.settings.findFirst({
    where: eq(settings.key, "cinema"),
  });
  if (persisted) {
    config.HARDWARE_ACCELERATION = preferences.hardwareAcceleration;
    config.MAX_TRANSCODES = preferences.maxTranscodes;
    config.TRANSCODE_CACHE_GB = preferences.transcodeCacheGb;
  } else
    preferences = {
      ...preferences,
      hardwareAcceleration: config.HARDWARE_ACCELERATION,
      maxTranscodes: config.MAX_TRANSCODES,
      transcodeCacheGb: config.TRANSCODE_CACHE_GB,
    };
  let cpuPrevious = cpus(),
    cpuPercent = 0;
  const cpuMonitor = setInterval(() => {
    const current = cpus();
    let idle = 0,
      total = 0;
    for (let i = 0; i < current.length; i++) {
      const old = cpuPrevious[i]?.times;
      if (!old) continue;
      for (const key of ["user", "nice", "sys", "idle", "irq"] as const) {
        const delta = current[i].times[key] - old[key];
        total += delta;
        if (key === "idle") idle += delta;
      }
    }
    cpuPercent = total ? Math.round((1 - idle / total) * 100) : 0;
    cpuPrevious = current;
  }, 2000);
  cpuMonitor.unref();
  for (const folder of ["artwork", "transcodes", "cache", "thumbnails"])
    await mkdir(join(config.DATA_DIR, folder), { recursive: true });
  await db
    .update(scanJobs)
    .set({ status: "interrupted", finishedAt: Date.now() })
    .where(inArray(scanJobs.status, ["queued", "running"]));
  await db
    .update(transcodeJobs)
    .set({ status: "interrupted", finishedAt: Date.now() })
    .where(eq(transcodeJobs.status, "running"));
  await db
    .update(playbackSessions)
    .set({ status: "ended" })
    .where(inArray(playbackSessions.status, ["playing", "starting"]));
  // Only generated UUID directories are eligible for startup cleanup.
  for (const entry of await readdir(join(config.DATA_DIR, "transcodes"), {
    withFileTypes: true,
  }))
    if (entry.isDirectory() && /^[0-9a-f-]{36}$/.test(entry.name)) {
      const { rm } = await import("node:fs/promises");
      await rm(join(config.DATA_DIR, "transcodes", entry.name), {
        recursive: true,
        force: true,
      });
    }
  await app.register(cookie);
  await app.register(rateLimit, {
    max: 500,
    timeWindow: "1 minute",
    global: true,
  });
  app.decorateRequest("identity", null);
  app.setErrorHandler((error: any, req, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: "Invalid input",
        details: error.issues.map((i) => i.path.join(".") + ": " + i.message),
      });
    const status = error.statusCode || 500;
    if (status >= 500) req.log.error({ err: error }, "Request failed");
    reply.code(status).send({
      error:
        status >= 500
          ? "The server could not complete this request. Check server logs."
          : error.message,
    });
  });
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "same-origin")
      .header("X-Frame-Options", "DENY");
    if (req.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.origin;
      if (
        (origin && origin !== req.protocol + "://" + req.headers.host) ||
        req.headers["sec-fetch-site"] === "cross-site"
      )
        throw new HttpError(403, "Cross-origin requests are not allowed");
    }
    if (
      !req.url.startsWith("/api/") ||
      [
        "/api/health",
        "/api/setup",
        "/api/login",
        "/api/auth/backdrop",
      ].includes(req.url.split("?")[0])
    )
      return;
    const token = req.cookies.cinema;
    if (!token) throw new HttpError(401, "Please sign in");
    const session = await db.query.authSessions.findFirst({
      where: eq(authSessions.id, sessionHash(token)),
    });
    if (!session || session.expiresAt < Date.now())
      throw new HttpError(401, "Your session has expired. Please sign in.");
    req.identity = {
      userId: session.userId,
      profileId: session.profileId,
      sessionId: session.id,
    };
  });
  const authBackdrop = createAuthBackdrop();
  app.get("/api/auth/backdrop", async (_req, reply) => {
    const path = await authBackdrop.select();
    if (!path) return reply.code(204).send();
    return reply
      .type("image/jpeg")
      .header("Cache-Control", "no-store")
      .send(createReadStream(path));
  });
  const requireProfile = (req: any) => {
    if (!req.identity?.profileId)
      throw new HttpError(409, "Choose a profile first");
    return req.identity.profileId as string;
  };
  async function administrator(req: any) {
    const profileId = requireProfile(req);
    const p = await db.query.profiles.findFirst({
      where: eq(profiles.id, profileId),
    });
    if (!p || p.child)
      throw new HttpError(403, "An adult household profile is required");
    return p;
  }
  async function visibleMovie(req: any, id: string) {
    const profileId = requireProfile(req);
    const p = await db.query.profiles.findFirst({
      where: eq(profiles.id, profileId),
    });
    const movie = await db.query.movies.findFirst({ where: eq(movies.id, id) });
    if (
      !movie ||
      (p?.child && !["G", "PG"].includes(movie.certification || ""))
    )
      throw new HttpError(404, "Movie not found");
    return movie;
  }
  const loginBody = z.object({
    username: z.string().trim().min(2).max(80),
    password: z.string().min(12).max(256),
  });
  const setCookie = (reply: any, token: string) =>
    reply.setCookie("cinema", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: config.SECURE_COOKIES === "true",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  async function newSession(
    userId: string,
    reply: any,
    profileId: string | null = null,
  ) {
    const token = secret();
    await db.insert(authSessions).values({
      id: sessionHash(token),
      userId,
      profileId,
      expiresAt: Date.now() + 30 * 86400000,
    });
    setCookie(reply, token);
  }
  app.get("/api/health", async () => ({
    status: "ok",
    setupRequired: !(await db.query.users.findFirst()),
  }));
  app.post(
    "/api/setup",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = loginBody.parse(req.body);
      const password = await hashPassword(body.password);
      const userId = randomUUID(),
        profileId = randomUUID();
      await db.transaction(async (tx) => {
        if (await tx.query.users.findFirst())
          throw new HttpError(409, "Initial setup is already complete");
        await tx.insert(users).values({
          id: userId,
          username: body.username,
          password,
          createdAt: Date.now(),
        });
        await tx
          .insert(profiles)
          .values({ id: profileId, userId, name: "My cinema", avatar: "lime" });
      });
      await newSession(userId, reply, profileId);
      return { ok: true };
    },
  );
  app.post(
    "/api/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = loginBody.parse(req.body),
        user = await db.query.users.findFirst({
          where: eq(users.username, body.username),
        });
      const valid = await verifyPassword(
        body.password,
        user?.password || dummyHash,
      );
      if (!user || !valid)
        throw new HttpError(401, "Username or password is incorrect");
      await newSession(user.id, reply);
      return { ok: true };
    },
  );
  app.post("/api/logout", async (req, reply) => {
    await db
      .delete(authSessions)
      .where(eq(authSessions.id, req.identity!.sessionId));
    reply.clearCookie("cinema", { path: "/" });
    return { ok: true };
  });
  app.get("/api/me", async (req) => {
    const user = await db.query.users.findFirst({
      where: eq(users.id, req.identity!.userId),
    });
    const all = await db
      .select()
      .from(profiles)
      .where(and(eq(profiles.userId, user!.id), eq(profiles.archived, false)));
    return {
      user: { id: user!.id, username: user!.username },
      profileId: req.identity!.profileId,
      profiles: all.map(({ pin, ...p }) => ({ ...p, locked: !!pin })),
    };
  });
  app.post("/api/profiles", async (req) => {
    await administrator(req);
    const b = z
      .object({
        name: z.string().trim().min(1).max(40),
        avatar: z.enum(["lime", "blue", "rose", "amber"]).default("blue"),
        child: z.boolean().default(false),
        pin: z
          .string()
          .regex(/^\d{4,8}$/)
          .optional(),
      })
      .parse(req.body);
    const id = randomUUID();
    await db.insert(profiles).values({
      id,
      userId: req.identity!.userId,
      ...b,
      pin: b.pin ? await hashPassword(b.pin) : null,
    });
    return { id };
  });
  app.patch("/api/profiles/:id", async (req) => {
    await administrator(req);
    const { id } = req.params as any;
    const profile = await db.query.profiles.findFirst({
      where: and(
        eq(profiles.id, id),
        eq(profiles.userId, req.identity!.userId),
        eq(profiles.archived, false),
      ),
    });
    if (!profile) throw new HttpError(404, "Profile not found");
    const b = z
      .object({
        name: z.string().trim().min(1).max(40).optional(),
        avatar: z.enum(["lime", "blue", "rose", "amber"]).optional(),
        child: z.boolean().optional(),
        pin: z
          .string()
          .regex(/^\d{4,8}$/)
          .nullable()
          .optional(),
      })
      .parse(req.body);
    if (b.child === true && id === req.identity!.profileId)
      throw new HttpError(
        409,
        "Switch to another adult profile before changing this profile to a family profile",
      );
    await db
      .update(profiles)
      .set({
        ...b,
        pin:
          b.pin === undefined
            ? undefined
            : b.pin === null
              ? null
              : await hashPassword(b.pin),
      })
      .where(eq(profiles.id, id));
    return { ok: true };
  });
  app.delete("/api/profiles/:id", async (req) => {
    await administrator(req);
    const { id } = req.params as any;
    if (id === req.identity!.profileId)
      throw new HttpError(
        409,
        "Switch to another adult profile before archiving this profile",
      );
    const p = await db.query.profiles.findFirst({
      where: and(
        eq(profiles.id, id),
        eq(profiles.userId, req.identity!.userId),
        eq(profiles.archived, false),
      ),
    });
    if (!p) throw new HttpError(404, "Profile not found");
    await db.transaction(async (tx) => {
      await tx
        .update(profiles)
        .set({ archived: true })
        .where(eq(profiles.id, id));
      await tx
        .update(authSessions)
        .set({ profileId: null })
        .where(eq(authSessions.profileId, id));
    });
    return { ok: true };
  });
  app.post(
    "/api/account/password",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
      await administrator(req);
      const b = z
        .object({
          currentPassword: z.string().max(256),
          newPassword: z.string().min(12).max(256),
        })
        .parse(req.body);
      const user = await db.query.users.findFirst({
        where: eq(users.id, req.identity!.userId),
      });
      if (!(await verifyPassword(b.currentPassword, user!.password)))
        throw new HttpError(403, "Current password is incorrect");
      await db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({ password: await hashPassword(b.newPassword) })
          .where(eq(users.id, user!.id));
        await tx.delete(authSessions).where(eq(authSessions.userId, user!.id));
      });
      reply.clearCookie("cinema", { path: "/" });
      return { ok: true };
    },
  );
  app.post(
    "/api/profiles/:id/select",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const { id } = req.params as any;
      const b = z
        .object({
          pin: z.string().max(8).optional(),
          password: z.string().max(256).optional(),
        })
        .parse(req.body || {});
      const p = await db.query.profiles.findFirst({
        where: and(
          eq(profiles.id, id),
          eq(profiles.userId, req.identity!.userId),
          eq(profiles.archived, false),
        ),
      });
      if (!p) throw new HttpError(404, "Profile not found");
      if (p.pin && !(await verifyPassword(b.pin || "", p.pin)))
        throw new HttpError(403, "Incorrect profile PIN");
      if (!p.pin && !p.child) {
        const user = await db.query.users.findFirst({
          where: eq(users.id, req.identity!.userId),
        });
        if (!(await verifyPassword(b.password || "", user!.password)))
          throw new HttpError(
            403,
            "Enter the household password to open this adult profile",
          );
      }
      await db
        .update(authSessions)
        .set({ profileId: id })
        .where(eq(authSessions.id, req.identity!.sessionId));
      return { ok: true };
    },
  );
  const subscribers = new Set<any>();
  function notify() {
    for (const res of subscribers) res.write('data: {"type":"library"}\n\n');
  }
  const scanner = createScanner(db, notify, app.log),
    streaming = createStreaming(db);
  const watchers = new Map<string, ReturnType<typeof chokidar.watch>>(),
    timers = new Map<string, ReturnType<typeof setTimeout>>();
  async function watchLibrary(library: typeof libraries.$inferSelect) {
    if (options.watch === false || !library.autoScan || library.archived)
      return;
    const watcher = chokidar.watch(library.path, {
      ignoreInitial: true,
      followSymlinks: false,
      depth: 20,
      awaitWriteFinish: { stabilityThreshold: 2500, pollInterval: 500 },
    });
    watcher.on("all", () => {
      clearTimeout(timers.get(library.id));
      timers.set(
        library.id,
        setTimeout(
          () =>
            void scanner
              .enqueue(library.id)
              .catch((e) => app.log.warn({ err: e }, "Automatic scan failed")),
          3000,
        ),
      );
    });
    watcher.on("error", (err) =>
      app.log.warn({ err }, "Library watcher error"),
    );
    watchers.set(library.id, watcher);
  }
  for (const l of await db.select().from(libraries)) {
    await watchLibrary(l);
    if (options.watch !== false && l.autoScan && !l.archived)
      await scanner.enqueue(l.id);
  }
  const periodicScan =
    options.watch === false
      ? null
      : setInterval(() => {
          void (async () => {
            for (const l of await db
              .select()
              .from(libraries)
              .where(
                and(
                  eq(libraries.autoScan, true),
                  eq(libraries.archived, false),
                ),
              ))
              await scanner.enqueue(l.id);
          })().catch((e) => app.log.warn({ err: e }, "Periodic scan failed"));
        }, 600000);
  periodicScan?.unref();
  app.get("/api/events", async (req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    reply.raw.write(": connected\n\n");
    subscribers.add(reply.raw);
    const heartbeat = setInterval(
      () => reply.raw.write(": heartbeat\n\n"),
      20000,
    );
    req.raw.on("close", () => {
      subscribers.delete(reply.raw);
      clearInterval(heartbeat);
    });
  });
  app.get("/api/libraries", async (req) => {
    await administrator(req);
    return db.select().from(libraries).where(eq(libraries.archived, false));
  });
  app.post("/api/libraries", async (req) => {
    await administrator(req);
    const b = z
      .object({
        name: z.string().trim().min(1).max(80),
        path: z.string().min(2).max(4096),
        autoScan: z.boolean().default(true),
      })
      .parse(req.body);
    if (!isAbsolute(b.path))
      throw new HttpError(
        400,
        "Choose an absolute local or mounted network directory",
      );
    let path: string;
    try {
      path = await realpath(b.path);
      if (!(await stat(path)).isDirectory()) throw 0;
    } catch {
      throw new HttpError(
        400,
        "That directory is not accessible to the server",
      );
    }
    const existing = await db
      .select()
      .from(libraries)
      .where(eq(libraries.archived, false));
    if (existing.some((l) => within(l.path, path) || within(path, l.path)))
      throw new HttpError(409, "This directory overlaps an existing library");
    if (
      within(path, config.DATA_DIR) ||
      within(config.DATA_DIR, path) ||
      within(path, resolve("."))
    )
      throw new HttpError(
        400,
        "Use a dedicated media directory separate from the application and its data",
      );
    const archived = await db.query.libraries.findFirst({
      where: and(eq(libraries.path, path), eq(libraries.archived, true)),
    });
    const id = archived?.id || randomUUID();
    const item = { id, ...b, path, archived: false };
    if (archived)
      await db
        .update(libraries)
        .set({ ...item, error: null })
        .where(eq(libraries.id, id));
    else await db.insert(libraries).values(item);
    await watchLibrary({ ...item, lastScan: null, error: null });
    await scanner.enqueue(id);
    return { id };
  });
  app.patch("/api/libraries/:id", async (req) => {
    await administrator(req);
    const { id } = req.params as any;
    const current = await db.query.libraries.findFirst({
      where: and(eq(libraries.id, id), eq(libraries.archived, false)),
    });
    if (!current) throw new HttpError(404, "Library not found");
    const b = z
      .object({
        name: z.string().trim().min(1).max(80).optional(),
        autoScan: z.boolean().optional(),
      })
      .parse(req.body);
    await watchers.get(id)?.close();
    watchers.delete(id);
    clearTimeout(timers.get(id));
    await db.update(libraries).set(b).where(eq(libraries.id, id));
    await watchLibrary({ ...current, ...b });
    return { ok: true };
  });
  app.delete("/api/libraries/:id", async (req) => {
    await administrator(req);
    const { id } = req.params as any;
    if (scanner.busy(id))
      throw new HttpError(409, "Wait for this library scan to finish");
    clearTimeout(timers.get(id));
    await watchers.get(id)?.close();
    watchers.delete(id);
    await db.transaction(async (tx) => {
      await tx
        .update(mediaFiles)
        .set({ available: false })
        .where(eq(mediaFiles.libraryId, id));
      await tx.delete(scanJobs).where(eq(scanJobs.libraryId, id));
      /* Retain root so missing entries never become arbitrary paths. */ await tx
        .update(libraries)
        .set({
          autoScan: false,
          archived: true,
          error: "Removed from scanning",
        })
        .where(eq(libraries.id, id));
    });
    return { ok: true };
  });
  app.post("/api/libraries/:id/scan", async (req) => {
    await administrator(req);
    const { id } = req.params as any;
    if (
      !(await db.query.libraries.findFirst({
        where: and(eq(libraries.id, id), eq(libraries.archived, false)),
      }))
    )
      throw new HttpError(404, "Library not found");
    return { jobId: await scanner.enqueue(id) };
  });
  app.get("/api/scans", async (req) => {
    await administrator(req);
    return db
      .select()
      .from(scanJobs)
      .orderBy(desc(scanJobs.startedAt))
      .limit(30);
  });
  async function libraryMovies(
    req: any,
    clauses: SQL[] = [],
    order: any = desc(movies.addedAt),
    offset = 0,
    limit = 200,
  ) {
    const profileId = requireProfile(req),
      p = await db.query.profiles.findFirst({
        where: eq(profiles.id, profileId),
      });
    const restrictions = [...clauses];
    if (p?.child) restrictions.push(inArray(movies.certification, ["G", "PG"]));
    const all = await db
      .select()
      .from(movies)
      .where(and(...restrictions))
      .orderBy(order)
      .limit(limit)
      .offset(offset);
    if (!all.length) return [];
    const ids = all.map((m) => m.id);
    const files = await db
        .select()
        .from(mediaFiles)
        .where(inArray(mediaFiles.movieId, ids)),
      watched = await db
        .select()
        .from(progress)
        .where(
          and(
            eq(progress.profileId, profileId),
            inArray(progress.movieId, ids),
          ),
        ),
      listed = await db
        .select()
        .from(watchlist)
        .where(
          and(
            eq(watchlist.profileId, profileId),
            inArray(watchlist.movieId, ids),
          ),
        );
    return all
      .filter((m) => !p?.child || ["G", "PG"].includes(m.certification || ""))
      .map((m) => {
        const file =
          files.find((f) => f.movieId === m.id && f.available) ||
          files.find((f) => f.movieId === m.id);
        const prog = watched.find((w) => w.movieId === m.id);
        const { path, fingerprint, ...technical } = file || ({} as any);
        return {
          ...technical,
          ...m,
          available: files.some((f) => f.movieId === m.id && f.available),
          position: prog?.position || 0,
          completed: prog?.completed || false,
          watchlisted: listed.some((w) => w.movieId === m.id),
        };
      });
  }
  app.get("/api/movies", async (req) => {
    const q = z
      .object({
        q: z.string().max(200).default(""),
        genre: z.string().max(80).optional(),
        year: z.coerce.number().int().optional(),
        minRating: z.coerce.number().min(0).max(10).optional(),
        resolution: z.enum(["720", "1080", "2160"]).optional(),
        sort: z.enum(["recent", "title", "rating", "year"]).default("recent"),
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(200).default(100),
        watchlist: z.enum(["true", "false"]).optional(),
      })
      .parse(req.query);
    const profileId = requireProfile(req),
      profile = await db.query.profiles.findFirst({
        where: eq(profiles.id, profileId),
      });
    const filters: SQL[] = [];
    if (q.q)
      filters.push(
        sql`instr(lower(coalesce(${movies.title},'') || ' ' || coalesce(${movies.director},'') || ' ' || ${movies.cast} || ' ' || ${movies.genres} || ' ' || coalesce(${movies.year},'')),${q.q.toLowerCase()}) > 0`,
      );
    if (q.genre)
      filters.push(
        sql`${movies.id} IN (SELECT movieId FROM movie_genres WHERE genre=${q.genre})`,
      );
    if (q.year) filters.push(eq(movies.year, q.year));
    if (q.minRating) filters.push(sql`${movies.rating} >= ${q.minRating}`);
    if (q.resolution)
      filters.push(
        sql`${movies.id} IN (SELECT movieId FROM media_files WHERE height >= ${Number(q.resolution)} AND available=1)`,
      );
    if (q.watchlist === "true")
      filters.push(
        sql`${movies.id} IN (SELECT movieId FROM watchlist WHERE profileId=${profileId})`,
      );
    if (profile?.child)
      filters.push(inArray(movies.certification, ["G", "PG"]));
    const order =
      q.sort === "title"
        ? asc(movies.title)
        : q.sort === "rating"
          ? desc(movies.rating)
          : q.sort === "year"
            ? desc(movies.year)
            : desc(movies.addedAt);
    const count = await db
      .select({ count: sql<number>`count(*)` })
      .from(movies)
      .where(and(...filters));
    return {
      items: await libraryMovies(req, filters, order, q.offset, q.limit),
      total: count[0].count,
    };
  });
  app.get("/api/movies/:id", async (req) => {
    const { id } = req.params as any;
    await visibleMovie(req, id);
    return (await libraryMovies(req, [eq(movies.id, id)]))[0];
  });
  app.post("/api/movies/:id/watchlist", async (req) => {
    const { id } = req.params as any;
    await visibleMovie(req, id);
    const profileId = requireProfile(req),
      b = z.object({ enabled: z.boolean() }).parse(req.body);
    if (b.enabled)
      await db
        .insert(watchlist)
        .values({ profileId, movieId: id })
        .onConflictDoNothing();
    else
      await db
        .delete(watchlist)
        .where(
          and(eq(watchlist.profileId, profileId), eq(watchlist.movieId, id)),
        );
    return { ok: true };
  });
  app.put("/api/movies/:id/progress", async (req) => {
    const { id } = req.params as any;
    await visibleMovie(req, id);
    const profileId = requireProfile(req),
      b = z.object({ position: z.number().finite().min(0) }).parse(req.body);
    const file = await streaming.source(id);
    const position = Math.min(b.position, file.duration || b.position),
      completed = file.duration > 0 && position / file.duration >= 0.95;
    const previous = await db.query.progress.findFirst({
      where: and(eq(progress.profileId, profileId), eq(progress.movieId, id)),
    });
    if (completed && !previous?.completed)
      await db.insert(watchHistory).values({
        id: randomUUID(),
        profileId,
        movieId: id,
        completedAt: Date.now(),
      });
    await db
      .insert(progress)
      .values({
        profileId,
        movieId: id,
        position,
        completed,
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: [progress.profileId, progress.movieId],
        set: { position, completed, updatedAt: Date.now() },
      });
    return { ok: true, completed };
  });
  app.patch("/api/movies/:id", async (req) => {
    await administrator(req);
    const { id } = req.params as any;
    await visibleMovie(req, id);
    const b = z
      .object({
        title: z.string().trim().min(1).max(200),
        year: z.number().int().min(1880).max(2200).nullable(),
        overview: z.string().max(10000).optional(),
        certification: z
          .enum(["G", "PG", "PG-13", "R", "NC-17", "NR"])
          .nullable()
          .optional(),
      })
      .parse(req.body);
    await db
      .update(movies)
      .set({ ...b, manual: true, review: false })
      .where(eq(movies.id, id));
    notify();
    return { ok: true };
  });
  app.get("/api/metadata/search", async (req) => {
    await administrator(req);
    const b = z
      .object({
        q: z.string().min(1).max(200),
        year: z.coerce.number().int().optional(),
      })
      .parse(req.query);
    return searchMetadata(b.q, b.year);
  });
  app.post("/api/movies/:id/match", async (req) => {
    await administrator(req);
    const { id } = req.params as any;
    await visibleMovie(req, id);
    const b = z.object({ tmdbId: z.number().int().positive() }).parse(req.body);
    await applyMetadata(db, id, b.tmdbId, true);
    notify();
    return { ok: true };
  });
  app.get("/api/thumbnails/:id", async (req, reply) => {
    const { id } = req.params as any;
    if (!/^[0-9a-f-]{36}$/.test(id))
      throw new HttpError(404, "Thumbnail not found");
    await visibleMovie(req, id);
    const path = join(config.DATA_DIR, "thumbnails", id + ".jpg");
    try {
      await stat(path);
    } catch {
      throw new HttpError(404, "Thumbnail not found");
    }
    return reply
      .type("image/jpeg")
      .header("Cache-Control", "private, max-age=86400")
      .send(createReadStream(path));
  });
  app.get("/api/artwork/:name", async (req, reply) => {
    requireProfile(req);
    const { name } = req.params as any;
    if (!/^(poster|backdrop)-[a-zA-Z0-9._-]+$/.test(name))
      throw new HttpError(404, "Artwork not found");
    const path = join(config.DATA_DIR, "artwork", name);
    try {
      await stat(path);
    } catch {
      throw new HttpError(404, "Artwork not found");
    }
    return reply
      .type(extname(name) === ".png" ? "image/png" : "image/jpeg")
      .header("Cache-Control", "private, max-age=86400")
      .send(createReadStream(path));
  });
  app.post("/api/movies/:id/play", async (req) => {
    const { id } = req.params as any;
    await visibleMovie(req, id);
    const b = z
      .object({
        quality: z.enum(["auto", "original", "1080p", "720p"]).default("auto"),
        audio: z.number().int().min(0).optional(),
      })
      .parse(req.body || {});
    return streaming.start(
      id,
      requireProfile(req),
      b.quality,
      b.audio,
      req.headers["user-agent"] || "Unknown browser",
    );
  });
  async function ownedSession(req: any) {
    const { id } = req.params;
    const item = await db.query.playbackSessions.findFirst({
      where: and(
        eq(playbackSessions.id, id),
        eq(playbackSessions.profileId, requireProfile(req)),
      ),
    });
    if (!item || ["ended", "failed"].includes(item.status))
      throw new HttpError(404, "Playback session has ended");
    await visibleMovie(req, item.movieId);
    return item;
  }
  app.post("/api/playback/:id/heartbeat", async (req) => {
    await ownedSession(req);
    streaming.touch((req.params as any).id);
    await db
      .update(playbackSessions)
      .set({ updatedAt: Date.now() })
      .where(eq(playbackSessions.id, (req.params as any).id));
    return { ok: true };
  });
  app.delete("/api/playback/:id", async (req) => {
    await ownedSession(req);
    await streaming.stop((req.params as any).id);
    return { ok: true };
  });
  app.get("/api/playback/:id/file", async (req, reply) => {
    const session = await ownedSession(req),
      file = await streaming.source(session.movieId);
    const info = await stat(file.path);
    let range;
    try {
      range = byteRange(req.headers.range, info.size);
    } catch {
      return reply
        .code(416)
        .header("Content-Range", "bytes */" + info.size)
        .send();
    }
    reply
      .header("Accept-Ranges", "bytes")
      .type(mime(file.container))
      .header("Content-Disposition", "inline");
    if (range)
      return reply
        .code(206)
        .header(
          "Content-Range",
          "bytes " + range.start + "-" + range.end + "/" + info.size,
        )
        .header("Content-Length", range.end - range.start + 1)
        .send(
          createReadStream(file.path, { start: range.start, end: range.end }),
        );
    return reply
      .header("Content-Length", info.size)
      .send(createReadStream(file.path));
  });
  app.get("/api/playback/:id/hls/:name", async (req, reply) => {
    const session = await ownedSession(req),
      { id, name } = req.params as any;
    if (!/^(index\.m3u8|segment\d{6}\.ts)$/.test(name))
      throw new HttpError(404, "Segment not found");
    const item = streaming.item(id);
    if (!item) throw new HttpError(410, "Conversion session expired");
    streaming.touch(id);
    const path = join(item.directory, name);
    try {
      await stat(path);
    } catch {
      throw new HttpError(404, "Segment is not ready");
    }
    return reply
      .type(
        name.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t",
      )
      .send(createReadStream(path));
  });
  app.get("/api/movies/:id/subtitles", async (req) => {
    const { id } = req.params as any;
    await visibleMovie(req, id);
    const file = await streaming.source(id);
    const directory = resolve(file.path, ".."),
      stem = file.path.slice(0, -extname(file.path).length);
    const external = (await readdir(directory))
      .filter((n) => {
        const p = join(directory, n);
        return (
          p.startsWith(stem + ".") &&
          [".srt", ".vtt"].includes(extname(n).toLowerCase())
        );
      })
      .map((n) => ({
        key: Buffer.from(n).toString("base64url"),
        title: n,
        kind: "external",
      }));
    return [
      ...external,
      ...file.subtitles
        .filter((t: any) =>
          ["subrip", "webvtt", "ass", "ssa", "mov_text"].includes(t.codec),
        )
        .map((t: any) => ({
          key: "embedded-" + t.index,
          title: t.title + " (" + t.language + ")",
          kind: "embedded",
        })),
    ];
  });
  app.get("/api/movies/:id/subtitles/:key", async (req, reply) => {
    const { id, key } = req.params as any;
    await visibleMovie(req, id);
    const file = await streaming.source(id);
    let args: string[];
    if (/^embedded-\d+$/.test(key)) {
      const index = Number(key.slice(9));
      if (
        !file.subtitles.some(
          (s: any) =>
            s.index === index &&
            ["subrip", "webvtt", "ass", "ssa", "mov_text"].includes(s.codec),
        )
      )
        throw new HttpError(404, "Subtitle not supported");
      args = [
        "-v",
        "error",
        "-nostdin",
        "-i",
        file.path,
        "-map",
        "0:" + index,
        "-f",
        "webvtt",
        "pipe:1",
      ];
    } else {
      const name = Buffer.from(key, "base64url").toString();
      if (
        name !== name.split(/[\\/]/).at(-1) ||
        ![".srt", ".vtt"].includes(extname(name))
      )
        throw new HttpError(400, "Invalid subtitle");
      const directory = resolve(file.path, "..");
      const path = await safePath(directory, join(directory, name));
      if (
        !path.startsWith(file.path.slice(0, -extname(file.path).length) + ".")
      )
        throw new HttpError(403, "Subtitle does not belong to this movie");
      if ((await stat(path)).size > 4000000)
        throw new HttpError(413, "Subtitle is too large");
      args = ["-v", "error", "-nostdin", "-i", path, "-f", "webvtt", "pipe:1"];
    }
    return reply
      .type("text/vtt; charset=utf-8")
      .send(await run(config.FFMPEG_PATH, args));
  });
  app.get("/api/preferences", async (req) => {
    requireProfile(req);
    return {
      serverName: preferences.serverName,
      defaultQuality: preferences.defaultQuality,
    };
  });
  app.get("/api/settings", async (req) => {
    await administrator(req);
    return preferences;
  });
  app.put("/api/settings", async (req) => {
    await administrator(req);
    const value = settingsSchema.parse(req.body);
    await writeSettings(db, value);
    preferences = value;
    config.HARDWARE_ACCELERATION = value.hardwareAcceleration;
    config.MAX_TRANSCODES = value.maxTranscodes;
    config.TRANSCODE_CACHE_GB = value.transcodeCacheGb;
    return value;
  });
  app.post("/api/cache/prune", async (req) => {
    await administrator(req);
    const all = await db.select().from(movies);
    const keep = new Set(
      all
        .flatMap((m) => [m.poster, m.backdrop])
        .filter(Boolean)
        .map((p) => p!.split("/").at(-1)),
    );
    let removed = 0;
    const { unlink } = await import("node:fs/promises");
    for (const item of await readdir(join(config.DATA_DIR, "artwork"), {
      withFileTypes: true,
    })) {
      if (
        item.isFile() &&
        /^(poster|backdrop)-[a-zA-Z0-9._-]+$/.test(item.name) &&
        !keep.has(item.name)
      ) {
        await unlink(join(config.DATA_DIR, "artwork", item.name));
        removed++;
      }
    }
    return { removed };
  });
  app.post("/api/movies/:id/refresh", async (req) => {
    await administrator(req);
    const { id } = req.params as any;
    const movie = await visibleMovie(req, id);
    if (!movie.tmdbId)
      throw new HttpError(409, "Match this film with TMDB first");
    if (movie.manual)
      throw new HttpError(
        409,
        "This film has manual corrections. Choose a TMDB match explicitly to replace them.",
      );
    await applyMetadata(db, id, movie.tmdbId, false);
    notify();
    return { ok: true };
  });
  app.get("/api/system", async (req) => {
    await administrator(req);
    let ffmpeg = false,
      ffprobe = false,
      encoders: string[] = [];
    try {
      const out = await run(config.FFMPEG_PATH, ["-hide_banner", "-encoders"]);
      ffmpeg = true;
      encoders = [
        "h264_qsv",
        "h264_nvenc",
        "h264_amf",
        "h264_vaapi",
        "libx264",
      ].filter((e) => out.includes(e));
    } catch {}
    try {
      await run(config.FFPROBE_PATH, ["-version"]);
      ffprobe = true;
    } catch {}
    const disk = await statfs(config.DATA_DIR);
    const files = await db.select().from(mediaFiles);
    return {
      serverName: preferences.serverName,
      cpuPercent,
      cpu: cpus()[0]?.model,
      memory: { total: totalmem(), free: freemem() },
      disk: { free: disk.bavail * disk.bsize, total: disk.blocks * disk.bsize },
      uptime: process.uptime(),
      systemUptime: uptime(),
      ffmpeg,
      ffprobe,
      encoders,
      hardwareEncodingEnabled: (await chooseEncoder()) !== "libx264",
      supportedHardware: (await hardwareCapabilities()).supported,
      selectedEncoder: await chooseEncoder(),
      metadataConfigured: !!config.TMDB_TOKEN,
      movieCount: (await db.select().from(movies)).length,
      mediaBytes: files.reduce((a, f) => a + f.size, 0),
      missingFiles: files.filter((f) => !f.available).length,
      sessions: await db
        .select()
        .from(playbackSessions)
        .where(
          inArray(playbackSessions.status, ["playing", "starting", "failed"]),
        )
        .orderBy(desc(playbackSessions.startedAt))
        .limit(30),
    };
  });
  app.get("/api/connection", async (req) => {
    await administrator(req);
    const addresses = Object.values(networkInterfaces())
      .flat()
      .filter((a: any) => a && a.family === "IPv4" && !a.internal)
      .map((a: any) => "http://" + a.address + ":" + config.PORT);
    return {
      addresses,
      qr: addresses[0] ? await QRCode.toDataURL(addresses[0]) : null,
    };
  });
  app.get("/api/backup", async (req, reply) => {
    await administrator(req);
    const tables = {
      users,
      profiles,
      libraries,
      movies,
      mediaFiles,
      progress,
      watchlist,
      settings,
    };
    const content: Record<string, unknown> = {
      version: 1,
      createdAt: Date.now(),
    };
    for (const [name, table] of Object.entries(tables))
      content[name] = await db.select().from(table);
    return reply
      .type("application/json")
      .header(
        "Content-Disposition",
        'attachment; filename="home-cinema-backup.json"',
      )
      .send(content);
  });
  const webRoot = resolve("apps/web/dist");
  try {
    await stat(join(webRoot, "index.html"));
    app.get("/", async (_req, reply) =>
      reply.type("text/html").send(await readFile(join(webRoot, "index.html"))),
    );
    await app.register(fastifyStatic, {
      root: webRoot,
      prefix: "/",
      index: false,
    });
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith("/api/") || extname(req.url.split("?")[0]))
        return reply.code(404).send({ error: "Not found" });
      return reply
        .type("text/html")
        .send(await readFile(join(webRoot, "index.html")));
    });
  } catch {
    app.get("/", async () => ({
      message: "Build the web client with pnpm build, or use pnpm dev.",
    }));
  }
  app.addHook("onClose", async () => {
    clearInterval(cpuMonitor);
    if (periodicScan) clearInterval(periodicScan);
    for (const res of subscribers) res.end();
    for (const t of timers.values()) clearTimeout(t);
    await Promise.all([...watchers.values()].map((w) => w.close()));
    await scanner.close();
    await streaming.close();
    client.close();
  });
  return app;
}
