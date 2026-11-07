import type { FastifyInstance } from "fastify";
import { eq, and, inArray, sql, asc } from "drizzle-orm";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { z } from "zod";
import {
  movies,
  mediaFiles,
  libraries,
  catalogExclusions,
  audioTracks,
  subtitleTracks,
  progress,
  watchlist,
  watchHistory,
  playbackSessions,
  transcodeJobs,
  movieGenres,
  movieCredits,
  metadataMatches,
  movieArtwork,
  episodes,
  series,
  seasons,
  seriesWatchlist,
} from "@cinema/database";
import { HttpError, type Database } from "./context.ts";
type Context = {
  admin: (req: any) => Promise<unknown>;
  exclusive: <T>(operation: () => Promise<T>) => Promise<T>;
  notify: () => void;
};
export function registerCatalogRoutes(
  app: FastifyInstance,
  db: Database,
  ctx: Context,
) {
  app.get("/api/catalog/entries", async (req) => {
    await ctx.admin(req);
    const q = z
      .object({
        q: z.string().trim().max(200).default(""),
        missing: z.enum(["true", "false"]).default("true"),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    const missing = sql<boolean>`NOT EXISTS (SELECT 1 FROM media_files WHERE media_files.movieId = movies.id AND available = 1)`;
    const condition = and(
      q.missing === "true" ? missing : undefined,
      q.q
        ? sql`(instr(lower(${movies.title}), lower(${q.q})) > 0 OR EXISTS (SELECT 1 FROM episodes e JOIN series s ON s.id=e.seriesId WHERE e.mediaId=${movies.id} AND instr(lower(s.title),lower(${q.q}))>0))`
        : undefined,
    );
    const rows = await db
      .select({
        id: movies.id,
        title: movies.title,
        year: movies.year,
        mediaType: movies.mediaType,
        missing,
      })
      .from(movies)
      .where(condition)
      .orderBy(asc(movies.title), asc(movies.id))
      .limit(50)
      .offset(q.offset);
    const ids = rows.map((r) => r.id);
    const files = ids.length
      ? await db
          .select()
          .from(mediaFiles)
          .where(inArray(mediaFiles.movieId, ids))
      : [];
    const linked = ids.length
      ? await db
          .select({
            mediaId: episodes.mediaId,
            show: series.title,
            season: episodes.season,
            episode: episodes.number,
          })
          .from(episodes)
          .innerJoin(series, eq(series.id, episodes.seriesId))
          .where(inArray(episodes.mediaId, ids))
      : [];
    const total = (
      await db
        .select({ value: sql<number>`count(*)` })
        .from(movies)
        .where(condition)
    )[0].value;
    const excluded = (
      await db.select({ value: sql<number>`count(*)` }).from(catalogExclusions)
    )[0].value;
    return {
      total,
      excluded,
      items: rows.map((r) => ({
        ...r,
        missing: !!r.missing,
        episode: linked.find((e) => e.mediaId === r.id) || null,
        files: files
          .filter((f) => f.movieId === r.id)
          .map((f) => ({
            name: basename(f.path),
            path: f.path,
            available: f.available,
          })),
      })),
    };
  });
  app.post("/api/catalog/remove", async (req) => {
    await ctx.admin(req);
    const b = z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(50),
        missingOnly: z.boolean().default(false),
        confirm: z.literal(true),
      })
      .parse(req.body);
    const ids = [...new Set(b.ids)];
    return ctx.exclusive(async () => {
      await db.transaction(async (tx) => {
        const items = await tx
          .select()
          .from(movies)
          .where(inArray(movies.id, ids));
        if (items.length !== ids.length)
          throw new HttpError(
            409,
            "The library changed. Refresh the list before removing entries.",
          );
        const files = await tx
          .select()
          .from(mediaFiles)
          .where(inArray(mediaFiles.movieId, ids));
        const playing = await tx
          .select()
          .from(playbackSessions)
          .where(
            and(
              inArray(playbackSessions.movieId, ids),
              inArray(playbackSessions.status, ["starting", "playing"]),
            ),
          );
        if (playing.length)
          throw new HttpError(
            409,
            "Stop playback of these entries before removing them.",
          );
        if (b.missingOnly) {
          const roots = await tx.select().from(libraries);
          for (const file of files) {
            const root = roots.find((r) => r.id === file.libraryId);
            if (!root || root.archived)
              throw new HttpError(
                409,
                "Reconnect the folder and scan it before clearing missing entries.",
              );
            try {
              if (!(await stat(root.path)).isDirectory()) throw new Error();
            } catch {
              throw new HttpError(
                409,
                "A media folder is offline or unavailable. Reconnect it before clearing missing entries.",
              );
            }
            try {
              await stat(file.path);
              throw new HttpError(
                409,
                "A file is present again. Scan the folder before clearing missing entries.",
              );
            } catch (e) {
              if (e instanceof HttpError) throw e;
              if (
                !["ENOENT", "ENOTDIR"].includes(
                  (e as NodeJS.ErrnoException).code || "",
                )
              )
                throw new HttpError(
                  409,
                  "A file could not be checked. Verify folder permissions before clearing missing entries.",
                );
            }
          }
        }
        for (const file of files)
          await tx
            .insert(catalogExclusions)
            .values({
              libraryId: file.libraryId,
              path: file.path,
              title: items.find((i) => i.id === file.movieId)!.title,
              removedAt: Date.now(),
            })
            .onConflictDoNothing();
        const fileIds = files.map((f) => f.id);
        if (fileIds.length) {
          await tx
            .delete(audioTracks)
            .where(inArray(audioTracks.fileId, fileIds));
          await tx
            .delete(subtitleTracks)
            .where(inArray(subtitleTracks.fileId, fileIds));
        }
        const sessions = await tx
          .select({ id: playbackSessions.id })
          .from(playbackSessions)
          .where(inArray(playbackSessions.movieId, ids));
        if (sessions.length)
          await tx.delete(transcodeJobs).where(
            inArray(
              transcodeJobs.sessionId,
              sessions.map((s) => s.id),
            ),
          );
        await tx
          .delete(playbackSessions)
          .where(inArray(playbackSessions.movieId, ids));
        await tx.delete(progress).where(inArray(progress.movieId, ids));
        await tx.delete(watchlist).where(inArray(watchlist.movieId, ids));
        await tx.delete(watchHistory).where(inArray(watchHistory.movieId, ids));
        await tx.delete(movieGenres).where(inArray(movieGenres.movieId, ids));
        await tx.delete(movieCredits).where(inArray(movieCredits.movieId, ids));
        await tx
          .delete(metadataMatches)
          .where(inArray(metadataMatches.movieId, ids));
        await tx.delete(movieArtwork).where(inArray(movieArtwork.movieId, ids));
        const affected = await tx
          .select({ id: episodes.seriesId })
          .from(episodes)
          .where(inArray(episodes.mediaId, ids));
        await tx.delete(episodes).where(inArray(episodes.mediaId, ids));
        await tx.delete(mediaFiles).where(inArray(mediaFiles.movieId, ids));
        await tx.delete(movies).where(inArray(movies.id, ids));
        for (const id of new Set(affected.map((a) => a.id))) {
          const remaining = await tx
            .select({ id: episodes.mediaId })
            .from(episodes)
            .where(eq(episodes.seriesId, id))
            .limit(1);
          if (!remaining.length) {
            await tx
              .delete(seriesWatchlist)
              .where(eq(seriesWatchlist.seriesId, id));
            await tx.delete(seasons).where(eq(seasons.seriesId, id));
            await tx.delete(series).where(eq(series.id, id));
          }
        }
      });
      ctx.notify();
      return { removed: ids.length };
    });
  });
  app.post("/api/catalog/allow-reimport", async (req) => {
    await ctx.admin(req);
    z.object({ confirm: z.literal(true) }).parse(req.body);
    return ctx.exclusive(async () => {
      await db.delete(catalogExclusions);
      ctx.notify();
      return { ok: true };
    });
  });
}
