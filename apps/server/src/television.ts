import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  series,
  seasons,
  episodes,
  movies,
  mediaFiles,
  libraries,
  progress,
  watchlist,
  seriesWatchlist,
  watchHistory,
  playbackSessions,
} from "@cinema/database";
import { parseEpisodeFilename, type EpisodeName } from "@cinema/media-core";
import type { Database } from "./context.ts";
export const tvFamilyRatings = [
  "G",
  "PG",
  "TV-Y",
  "TV-Y7",
  "TV-Y7-FV",
  "TV-G",
  "TV-PG",
];
export function seriesKey(name: string, year: number | null) {
  return (
    name
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim() +
    "|" +
    (year || "")
  );
}
export async function organizeEpisode(
  db: Database,
  fileId: string,
  parsed: EpisodeName,
  replace = false,
  targetSeriesId?: string,
) {
  return db.transaction(async (tx) => {
    const file = await tx.query.mediaFiles.findFirst({
      where: eq(mediaFiles.id, fileId),
    });
    if (!file) throw new Error("Source record not found");
    const old = await tx.query.movies.findFirst({
      where: eq(movies.id, file.movieId),
    });
    if (!old) throw new Error("Playable item not found");
    const retained = await tx.query.episodes.findFirst({
      where: eq(episodes.mediaId, old.id),
    });
    if (retained?.manualOrganization && !replace)
      return { mediaId: old.id, seriesId: retained.seriesId };
    const identityKey = seriesKey(parsed.showTitle, parsed.year);
    let show = await tx.query.series.findFirst({
      where: targetSeriesId
        ? eq(series.id, targetSeriesId)
        : eq(series.identityKey, identityKey),
    });
    if (!show) {
      const id = randomUUID();
      await tx.insert(series).values({
        id,
        identityKey,
        title: parsed.showTitle,
        year: parsed.year,
        addedAt: old.addedAt,
      });
      show = (await tx.query.series.findFirst({ where: eq(series.id, id) }))!;
    }
    await tx
      .insert(seasons)
      .values({
        seriesId: show.id,
        number: parsed.season,
        name: parsed.season === 0 ? "Specials" : "Season " + parsed.season,
      })
      .onConflictDoNothing();
    if (replace) await tx.delete(episodes).where(eq(episodes.mediaId, old.id));
    const logical = await tx.query.episodes.findFirst({
      where: and(
        eq(episodes.seriesId, show.id),
        eq(episodes.season, parsed.season),
        eq(episodes.number, parsed.episode),
      ),
    });
    const bound = await tx.query.episodes.findFirst({
      where: eq(episodes.mediaId, old.id),
    });
    const otherFiles = await tx
      .select()
      .from(mediaFiles)
      .where(eq(mediaFiles.movieId, old.id));
    const sharedWithMovie = otherFiles.some(
      (f) => f.id !== file.id && !parseEpisodeFilename(f.path),
    );
    const canKeepId =
      (!bound ||
        (bound.seriesId === show.id &&
          bound.season === parsed.season &&
          bound.number === parsed.episode)) &&
      !sharedWithMovie;
    const target = logical?.mediaId || (canKeepId ? old.id : randomUUID());
    if (target !== old.id) {
      await tx
        .insert(movies)
        .values({
          id: target,
          title: parsed.title,
          year: parsed.year,
          mediaType: "episode",
          addedAt: old.addedAt,
        })
        .onConflictDoNothing();
      for (const row of await tx
        .select()
        .from(progress)
        .where(eq(progress.movieId, old.id))) {
        const existing = await tx.query.progress.findFirst({
          where: and(
            eq(progress.movieId, target),
            eq(progress.profileId, row.profileId),
          ),
        });
        if (!existing || row.updatedAt > existing.updatedAt)
          await tx
            .insert(progress)
            .values({ ...row, movieId: target })
            .onConflictDoUpdate({
              target: [progress.profileId, progress.movieId],
              set: {
                position: row.position,
                completed: row.completed,
                updatedAt: row.updatedAt,
              },
            });
      }
      for (const row of await tx
        .select()
        .from(watchlist)
        .where(eq(watchlist.movieId, old.id)))
        await tx
          .insert(watchlist)
          .values({ ...row, movieId: target })
          .onConflictDoNothing();
      for (const row of await tx
        .select()
        .from(watchHistory)
        .where(eq(watchHistory.movieId, old.id)))
        await tx
          .insert(watchHistory)
          .values({ ...row, id: randomUUID(), movieId: target });
      await tx
        .update(mediaFiles)
        .set({ movieId: target })
        .where(eq(mediaFiles.id, fileId));
      if (otherFiles.length === 1) {
        await tx
          .update(movies)
          .set({ mediaType: "episode" })
          .where(eq(movies.id, old.id));
        await tx
          .update(playbackSessions)
          .set({ movieId: target })
          .where(eq(playbackSessions.movieId, old.id));
      }
    }
    for (const row of await tx
      .select()
      .from(watchlist)
      .where(eq(watchlist.movieId, target)))
      await tx
        .insert(seriesWatchlist)
        .values({ profileId: row.profileId, seriesId: show.id })
        .onConflictDoNothing();
    if (!logical) {
      await tx.insert(episodes).values({
        mediaId: target,
        seriesId: show.id,
        season: parsed.season,
        number: parsed.episode,
        episodeEnd: parsed.episodeEnd,
        title: parsed.title,
        manualOrganization: replace,
        legacyMetadata: old.mediaType !== "episode" ? old : null,
      });
      // Wrong movie-provider matches are retained in legacyMetadata, not displayed as TV.
      await tx
        .update(movies)
        .set({
          mediaType: "episode",
          title: parsed.title,
          tmdbId: null,
          poster: null,
          backdrop: null,
          overview: null,
          genres: [],
          cast: [],
          director: null,
          rating: null,
          certification: null,
          manual: false,
          review: true,
          collection: null,
          trailers: [],
        })
        .where(eq(movies.id, target));
    } else {
      if (replace)
        await tx
          .update(episodes)
          .set({ manualOrganization: true })
          .where(eq(episodes.mediaId, target));
      await tx
        .update(movies)
        .set({ mediaType: "episode" })
        .where(eq(movies.id, target));
    }
    return { mediaId: target, seriesId: show.id };
  });
}
export async function reclassifyExistingEpisodes(
  db: Database,
  libraryId?: string,
) {
  const roots = await db.select().from(libraries);
  const active = new Map(
    roots
      .filter((l) => !l.archived && (!libraryId || l.id === libraryId))
      .map((l) => [l.id, l]),
  );
  const files = await db.select().from(mediaFiles);
  const grouped = new Map(
      (await db.select().from(episodes)).map((e) => [e.mediaId, e]),
    ),
    showKeys = new Map(
      (await db.select().from(series)).map((s) => [s.id, s.identityKey]),
    );
  let organized = 0,
    unresolved = 0;
  for (const file of files) {
    const root = active.get(file.libraryId);
    if (!root || root.contentType === "movies") continue;
    const parsed = parseEpisodeFilename(file.path);
    if (parsed) {
      await organizeEpisode(db, file.id, parsed);
      organized++;
    } else if (root.contentType === "tv") {
      const bound = await db.query.episodes.findFirst({
        where: eq(episodes.mediaId, file.movieId),
      });
      if (!bound) {
        await db
          .update(movies)
          .set({ mediaType: "unclassified", review: true })
          .where(eq(movies.id, file.movieId));
        unresolved++;
      }
    }
  }
  return { organized, unresolved };
}
