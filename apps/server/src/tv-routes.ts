import type { FastifyInstance } from "fastify";
import { eq, and, asc, desc, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { basename } from "node:path";
import {
  series,
  seasons,
  episodes,
  seriesWatchlist,
  movies,
  mediaFiles,
  profiles,
  progress,
} from "@cinema/database";
import { organizeEpisode, tvFamilyRatings } from "./television.ts";
import { searchTV, matchTV, hydrateTVSeason } from "./tv-metadata.ts";
import { HttpError, type Database } from "./context.ts";
type Context = {
  profile: (req: any) => string;
  admin: (req: any) => Promise<any>;
  visibleMovie: (req: any, id: string) => Promise<any>;
  items: (
    req: any,
    clauses?: SQL[],
    order?: any,
    offset?: number,
    limit?: number,
  ) => Promise<any[]>;
  notify: () => void;
};
export function registerTVRoutes(
  app: FastifyInstance,
  db: Database,
  ctx: Context,
) {
  async function visibleShow(req: any, id: string) {
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.id, ctx.profile(req)),
    });
    const show = await db.query.series.findFirst({ where: eq(series.id, id) });
    if (
      !show ||
      (profile?.child && !tvFamilyRatings.includes(show.certification || ""))
    )
      throw new HttpError(404, "TV show not found");
    return show;
  }
  async function episodeItems(req: any, id: string) {
    const show = await visibleShow(req, id);
    const local = await db
      .select()
      .from(episodes)
      .where(eq(episodes.seriesId, id))
      .orderBy(asc(episodes.season), asc(episodes.number));
    if (!local.length) return [];
    const items = await ctx.items(
      req,
      [
        inArray(
          movies.id,
          local.map((e) => e.mediaId),
        ),
      ],
      asc(movies.addedAt),
      0,
      local.length,
    );
    const byId = new Map(items.map((m) => [m.id, m]));
    return local
      .filter((e) => byId.has(e.mediaId))
      .map((e) => ({
        ...byId.get(e.mediaId),
        seriesId: id,
        showTitle: show.title,
        seasonNumber: e.season,
        episodeNumber: e.number,
        episodeEnd: e.episodeEnd,
        episodeTitle: e.title,
        airDate: e.airDate,
        poster: show.poster || byId.get(e.mediaId).poster,
        backdrop: e.still || show.backdrop || byId.get(e.mediaId).backdrop,
      }));
  }
  app.get("/api/series", async (req) => {
    const q = z
      .object({
        q: z.string().max(200).default(""),
        watchlist: z.enum(["true", "false"]).optional(),
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(60),
      })
      .parse(req.query);
    const profileId = ctx.profile(req),
      profile = await db.query.profiles.findFirst({
        where: eq(profiles.id, profileId),
      });
    const clauses: SQL[] = [
      sql`EXISTS (SELECT 1 FROM episodes WHERE seriesId=${series.id})`,
    ];
    if (profile?.child)
      clauses.push(inArray(series.certification, tvFamilyRatings));
    if (q.q)
      clauses.push(
        sql`instr(lower(${series.title} || ' ' || ${series.cast} || ' ' || ${series.genres}),${q.q.toLowerCase()}) > 0`,
      );
    if (q.watchlist === "true")
      clauses.push(
        sql`${series.id} IN (SELECT seriesId FROM series_watchlist WHERE profileId=${profileId})`,
      );
    const count = await db
      .select({ total: sql<number>`count(*)` })
      .from(series)
      .where(and(...clauses));
    const shows = await db
      .select()
      .from(series)
      .where(and(...clauses))
      .orderBy(asc(series.title))
      .limit(q.limit)
      .offset(q.offset);
    const listed = await db
      .select()
      .from(seriesWatchlist)
      .where(eq(seriesWatchlist.profileId, profileId));
    const items = [];
    for (const show of shows) {
      const local = await episodeItems(req, show.id);
      items.push({
        ...show,
        seasonCount: new Set(local.map((e) => e.seasonNumber)).size,
        episodeCount: local.length,
        availableCount: local.filter((e) => e.available).length,
        completedCount: local.filter((e) => e.completed).length,
        watchlisted: listed.some((w) => w.seriesId === show.id),
        backdrop:
          show.backdrop || local.find((e) => e.backdrop)?.backdrop || null,
      });
    }
    return { items, total: count[0].total };
  });
  app.get("/api/series/continue", async (req) => {
    const profileId = ctx.profile(req);
    const watched = await db
      .select({
        seriesId: episodes.seriesId,
        mediaId: episodes.mediaId,
        updatedAt: progress.updatedAt,
      })
      .from(episodes)
      .innerJoin(
        progress,
        and(
          eq(progress.movieId, episodes.mediaId),
          eq(progress.profileId, profileId),
        ),
      )
      .where(and(eq(progress.completed, false), sql`${progress.position}>0`))
      .orderBy(desc(progress.updatedAt))
      .limit(100);
    const result: any[] = [];
    const used = new Set<string>();
    for (const row of watched) {
      if (used.has(row.seriesId)) continue;
      try {
        const item = (await episodeItems(req, row.seriesId)).find(
          (e) => e.id === row.mediaId && e.available,
        );
        if (item) {
          result.push(item);
          used.add(row.seriesId);
        }
      } catch (error) {
        if (!(error instanceof HttpError && error.statusCode === 404))
          throw error;
      }
      if (result.length >= 20) break;
    }
    return { items: result };
  });
  app.get("/api/series/:id", async (req) => {
    const { id } = req.params as any;
    const show = await visibleShow(req, id),
      items = await episodeItems(req, id);
    const localSeasons = await db
      .select()
      .from(seasons)
      .where(eq(seasons.seriesId, id))
      .orderBy(asc(seasons.number));
    const list = await db.query.seriesWatchlist.findFirst({
      where: and(
        eq(seriesWatchlist.seriesId, id),
        eq(seriesWatchlist.profileId, ctx.profile(req)),
      ),
    });
    const active = items.filter((e) => e.available);
    const regular = active.filter((e) => e.seasonNumber > 0),
      defaults = regular.length ? regular : active;
    const resume =
      [...active]
        .filter((e) => e.position > 0 && !e.completed)
        .sort(
          (a, b) => (b.progressUpdatedAt || 0) - (a.progressUpdatedAt || 0),
        )[0] ||
      defaults.find((e) => !e.completed) ||
      defaults[0] ||
      null;
    return {
      ...show,
      watchlisted: !!list,
      resumeEpisode: resume,
      seasons: localSeasons
        .filter((s) => items.some((e) => e.seasonNumber === s.number))
        .map((s) => ({
          ...s,
          episodes: items.filter((e) => e.seasonNumber === s.number),
        })),
    };
  });
  app.post("/api/series/:id/watchlist", async (req) => {
    const { id } = req.params as any;
    await visibleShow(req, id);
    const profileId = ctx.profile(req);
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    if (enabled)
      await db
        .insert(seriesWatchlist)
        .values({ seriesId: id, profileId })
        .onConflictDoNothing();
    else
      await db
        .delete(seriesWatchlist)
        .where(
          and(
            eq(seriesWatchlist.seriesId, id),
            eq(seriesWatchlist.profileId, profileId),
          ),
        );
    return { ok: true };
  });
  app.get("/api/episodes/:id/next", async (req) => {
    const { id } = req.params as any;
    await ctx.visibleMovie(req, id);
    const current = await db.query.episodes.findFirst({
      where: eq(episodes.mediaId, id),
    });
    if (!current) return null;
    return (
      (await episodeItems(req, current.seriesId)).find(
        (e) =>
          e.available &&
          (e.seasonNumber > current.season ||
            (e.seasonNumber === current.season &&
              e.episodeNumber > current.episodeEnd)),
      ) || null
    );
  });
  app.get("/api/tv/search", async (req) => {
    await ctx.admin(req);
    const q = z
      .object({
        q: z.string().trim().min(1).max(200),
        year: z.coerce.number().int().optional(),
      })
      .parse(req.query);
    return searchTV(q.q, q.year);
  });
  app.post("/api/series/:id/match", async (req) => {
    await ctx.admin(req);
    const { id } = req.params as any;
    await visibleShow(req, id);
    const { tmdbId } = z
      .object({ tmdbId: z.number().int().positive() })
      .parse(req.body);
    await matchTV(db, id, tmdbId, true);
    for (const season of await db
      .select()
      .from(seasons)
      .where(eq(seasons.seriesId, id)))
      await hydrateTVSeason(db, id, season.number);
    ctx.notify();
    return { ok: true };
  });
  app.patch("/api/series/:id", async (req) => {
    await ctx.admin(req);
    const { id } = req.params as any;
    await visibleShow(req, id);
    const b = z
      .object({
        title: z.string().trim().min(1).max(200),
        overview: z.string().max(10000).optional(),
        certification: z
          .enum([
            "G",
            "PG",
            "TV-Y",
            "TV-Y7",
            "TV-Y7-FV",
            "TV-G",
            "TV-PG",
            "TV-14",
            "TV-MA",
            "NR",
          ])
          .nullable()
          .optional(),
      })
      .parse(req.body);
    await db.transaction(async (tx) => {
      await tx
        .update(series)
        .set({ ...b, manual: true, review: false })
        .where(eq(series.id, id));
      if (b.certification !== undefined) {
        const local = await tx
          .select()
          .from(episodes)
          .where(eq(episodes.seriesId, id));
        if (local.length)
          await tx
            .update(movies)
            .set({ certification: b.certification })
            .where(
              inArray(
                movies.id,
                local.map((e) => e.mediaId),
              ),
            );
      }
    });
    ctx.notify();
    return { ok: true };
  });
  app.get("/api/tv/review", async (req) => {
    await ctx.admin(req);
    const files = await db
      .select({ id: movies.id, title: movies.title, path: mediaFiles.path })
      .from(movies)
      .innerJoin(mediaFiles, eq(mediaFiles.movieId, movies.id))
      .where(eq(movies.mediaType, "unclassified"))
      .limit(500);
    return files.map((f) => ({
      id: f.id,
      title: f.title,
      filename: basename(f.path),
    }));
  });
  app.post("/api/episodes/:id/organize", async (req) => {
    await ctx.admin(req);
    const { id } = req.params as any;
    await ctx.visibleMovie(req, id);
    const b = z
      .object({
        seriesId: z.string().uuid().optional(),
        showTitle: z.string().trim().min(1).max(200),
        year: z.number().int().min(1880).max(2200).nullable().default(null),
        season: z.number().int().min(0).max(999),
        episode: z.number().int().min(1).max(9999),
        episodeEnd: z.number().int().min(1).max(9999).optional(),
        title: z.string().max(200).optional(),
      })
      .parse(req.body);
    if (
      b.episodeEnd !== undefined &&
      (b.episodeEnd < b.episode || b.episodeEnd > b.episode + 30)
    )
      throw new HttpError(400, "Invalid combined episode range");
    const files = await db
      .select()
      .from(mediaFiles)
      .where(eq(mediaFiles.movieId, id));
    if (b.seriesId) await visibleShow(req, b.seriesId);
    if (!files.length) throw new HttpError(404, "No source file");

    let result;
    let first = true;
    for (const file of files) {
      result = await organizeEpisode(
        db,
        file.id,
        {
          ...b,
          episodeEnd: b.episodeEnd || b.episode,
          title: b.title || "Episode " + b.episode,
        },
        first,
        b.seriesId,
      );
      first = false;
    }
    ctx.notify();
    return result;
  });
}
