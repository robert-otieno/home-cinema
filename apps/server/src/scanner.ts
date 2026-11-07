import { organizeEpisode, reclassifyExistingEpisodes } from "./television.ts";
import { enrichTV } from "./tv-metadata.ts";
import { readdir, stat, realpath, mkdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import {
  libraries,
  catalogExclusions,
  movies,
  mediaFiles,
  scanJobs,
  audioTracks,
  subtitleTracks,
  episodes,
} from "@cinema/database";
import {
  probe,
  parseFilename,
  parseEpisodeFilename,
  fingerprint,
  mediaExtensions,
  safePath,
  within,
  run,
} from "@cinema/media-core";
import type { Database } from "./context.ts";
import { config } from "./config.ts";
import { searchMetadata, applyMetadata } from "./metadata.ts";
export function createScanner(
  db: Database,
  notify: () => void,
  log: { warn: (...args: any[]) => void },
) {
  let queue = Promise.resolve(),
    closed = false;
  const pending = new Map<string, string>();
  async function scan(id: string, jobId: string) {
    const library = await db.query.libraries.findFirst({
      where: eq(libraries.id, id),
    });
    if (!library) return;
    const contentType = library.contentType;
    let count = 0;
    const errors: string[] = [];
    const seen = new Set<string>();
    const tvShows = new Set<string>();
    let traversed = true;
    try {
      await db
        .update(scanJobs)
        .set({ status: "running" })
        .where(eq(scanJobs.id, jobId));
      notify();
      await reclassifyExistingEpisodes(db, id);
      const root = await realpath(library.path);
      const excluded = new Set(
        (
          await db
            .select({ path: catalogExclusions.path })
            .from(catalogExclusions)
            .where(eq(catalogExclusions.libraryId, id))
        ).map((f) => f.path),
      );
      async function walk(dir: string): Promise<void> {
        let entries;
        try {
          entries = await readdir(dir, { withFileTypes: true });
        } catch {
          errors.push("Cannot read a library subdirectory");
          traversed = false;
          return;
        }
        for (const entry of entries) {
          if (closed) throw new Error("Scan interrupted by server shutdown");
          if (entry.isSymbolicLink()) continue;
          const path = join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(path);
            continue;
          }
          if (
            !entry.isFile() ||
            !mediaExtensions.has(extname(path).toLowerCase())
          )
            continue;
          let canonical: string;
          try {
            canonical = await safePath(root, path);
          } catch {
            errors.push("Skipped a path outside library root");
            continue;
          }
          if (excluded.has(canonical)) continue;
          seen.add(canonical);
          try {
            const info = await stat(canonical);
            let existing = await db.query.mediaFiles.findFirst({
              where: eq(mediaFiles.path, canonical),
            });
            const episodeName =
              contentType === "movies" ? null : parseEpisodeFilename(canonical);
            if (existing && episodeName) {
              const organized = await organizeEpisode(
                db,
                existing.id,
                episodeName,
              );
              tvShows.add(organized.seriesId);
              existing = await db.query.mediaFiles.findFirst({
                where: eq(mediaFiles.id, existing.id),
              });
            }
            if (
              existing &&
              existing.size === info.size &&
              existing.mtime === Math.floor(info.mtimeMs)
            ) {
              await db
                .update(mediaFiles)
                .set({ available: true })
                .where(eq(mediaFiles.id, existing.id));
              count++;
              continue;
            }
            const fp = await fingerprint(canonical);
            if (!existing) {
              const candidates = await db
                .select()
                .from(mediaFiles)
                .where(eq(mediaFiles.fingerprint, fp));
              for (const candidate of candidates) {
                try {
                  await stat(candidate.path);
                } catch {
                  if (!episodeName) {
                    const candidateItem = await db.query.movies.findFirst({
                      where: eq(movies.id, candidate.movieId),
                    });
                    if (candidateItem?.mediaType !== "movie") continue;
                  }
                  const manualEpisode = await db.query.episodes.findFirst({
                    where: eq(episodes.mediaId, candidate.movieId),
                  });
                  const candidateEpisode = parseEpisodeFilename(candidate.path);
                  if (
                    episodeName &&
                    !manualEpisode?.manualOrganization &&
                    (!candidateEpisode ||
                      candidateEpisode.showTitle.toLowerCase() !==
                        episodeName.showTitle.toLowerCase() ||
                      candidateEpisode.season !== episodeName.season ||
                      candidateEpisode.episode !== episodeName.episode)
                  )
                    continue;
                  existing = candidate;
                  break;
                }
              }
            }
            const technical = await probe(canonical, config.FFPROBE_PATH);
            const parsed = parseFilename(canonical);
            let movieId = existing?.movieId;
            if (!movieId && !episodeName) {
              const duplicate = await db
                .select({ movieId: mediaFiles.movieId })
                .from(mediaFiles)
                .innerJoin(
                  movies,
                  and(
                    eq(movies.id, mediaFiles.movieId),
                    eq(movies.mediaType, "movie"),
                  ),
                )
                .where(eq(mediaFiles.fingerprint, fp))
                .limit(1);
              movieId = duplicate[0]?.movieId || randomUUID();
            }
            let selectedId = movieId || randomUUID();
            await db.transaction(async (tx) => {
              await tx
                .insert(movies)
                .values({
                  id: selectedId,
                  title: parsed.title,
                  year: parsed.year,
                  addedAt: Date.now(),
                })
                .onConflictDoNothing();
              const values = {
                movieId: selectedId,
                libraryId: id,
                path: canonical,
                fingerprint: fp,
                size: info.size,
                mtime: Math.floor(info.mtimeMs),
                ...technical,
                available: true,
              };
              if (existing)
                await tx
                  .update(mediaFiles)
                  .set(values)
                  .where(eq(mediaFiles.id, existing.id));
              else
                await tx
                  .insert(mediaFiles)
                  .values({ id: randomUUID(), ...values });
              const stored = await tx.query.mediaFiles.findFirst({
                where: eq(mediaFiles.path, canonical),
              });
              if (stored) {
                await tx
                  .delete(audioTracks)
                  .where(eq(audioTracks.fileId, stored.id));
                await tx
                  .delete(subtitleTracks)
                  .where(eq(subtitleTracks.fileId, stored.id));
                for (const track of technical.audioTracks)
                  await tx.insert(audioTracks).values({
                    fileId: stored.id,
                    streamIndex: track.index,
                    codec: track.codec,
                    language: track.language,
                    title: track.title,
                  });
                for (const track of technical.subtitles)
                  await tx.insert(subtitleTracks).values({
                    fileId: stored.id,
                    streamIndex: track.index,
                    codec: track.codec,
                    language: track.language,
                    title: track.title,
                  });
              }
            });
            const storedFile = await db.query.mediaFiles.findFirst({
              where: eq(mediaFiles.path, canonical),
            });
            if (episodeName && storedFile) {
              const organized = await organizeEpisode(
                db,
                storedFile.id,
                episodeName,
              );
              selectedId = organized.mediaId;
              tvShows.add(organized.seriesId);
            } else if (contentType === "tv")
              await db
                .update(movies)
                .set({ mediaType: "unclassified", review: true })
                .where(eq(movies.id, selectedId));
            const movie = await db.query.movies.findFirst({
              where: eq(movies.id, selectedId),
            });
            if (
              !episodeName &&
              contentType !== "tv" &&
              config.TMDB_TOKEN &&
              !movie?.manual &&
              !movie?.tmdbId
            ) {
              try {
                const results = await searchMetadata(parsed.title, parsed.year);
                if (
                  results[0]?.confidence >= 0.95 &&
                  (!results[1] ||
                    results[0].confidence - results[1].confidence >= 0.1)
                )
                  await applyMetadata(db, selectedId, results[0].id);
              } catch {
                errors.push("Metadata unavailable for " + parsed.title);
              }
            }
            const refreshed = await db.query.movies.findFirst({
              where: eq(movies.id, selectedId),
            });
            if (!refreshed?.backdrop) {
              try {
                const folder = join(config.DATA_DIR, "thumbnails");
                await mkdir(folder, { recursive: true });
                await run(config.FFMPEG_PATH, [
                  "-v",
                  "error",
                  "-nostdin",
                  "-ss",
                  String(Math.min(60, technical.duration * 0.1)),
                  "-i",
                  canonical,
                  "-frames:v",
                  "1",
                  "-vf",
                  "scale=1280:-2",
                  "-q:v",
                  "4",
                  "-y",
                  join(folder, selectedId + ".jpg"),
                ]);
                await db
                  .update(movies)
                  .set({ backdrop: "/api/thumbnails/" + selectedId })
                  .where(eq(movies.id, selectedId));
              } catch {
                log.warn("Local thumbnail generation failed");
              }
            }
            count++;
          } catch (error) {
            errors.push(entry.name + ": " + (error as Error).message);
            log.warn({ err: error }, "Media scan item failed");
          }
          await db
            .update(scanJobs)
            .set({ processed: count, errors: errors.slice(-50) })
            .where(eq(scanJobs.id, jobId));
          notify();
        }
      }
      await walk(root);
      for (const showId of tvShows)
        try {
          await enrichTV(db, showId);
        } catch {
          errors.push(
            "TV metadata temporarily unavailable; local episodes are organized.",
          );
        }
      if (traversed) {
        const files = await db
          .select()
          .from(mediaFiles)
          .where(eq(mediaFiles.libraryId, id));
        for (const file of files)
          if (!seen.has(file.path))
            await db
              .update(mediaFiles)
              .set({ available: false })
              .where(eq(mediaFiles.id, file.id));
      }
      await db
        .update(libraries)
        .set({
          lastScan: Date.now(),
          error: errors.length ? errors.length + " scan warnings" : null,
        })
        .where(eq(libraries.id, id));
      await db
        .update(scanJobs)
        .set({
          status: errors.length ? "completed_with_errors" : "completed",
          processed: count,
          errors: errors.slice(-50),
          finishedAt: Date.now(),
        })
        .where(eq(scanJobs.id, jobId));
    } catch (error) {
      await db
        .update(libraries)
        .set({ error: (error as Error).message })
        .where(eq(libraries.id, id));
      await db
        .update(scanJobs)
        .set({
          status: "failed",
          errors: [(error as Error).message],
          finishedAt: Date.now(),
        })
        .where(eq(scanJobs.id, jobId));
    } finally {
      pending.delete(id);
      notify();
    }
  }
  return {
    async enqueue(id: string) {
      if (closed) throw new Error("Server is shutting down");
      if (pending.has(id)) return pending.get(id)!;
      const jobId = randomUUID();
      pending.set(id, jobId);
      await db.insert(scanJobs).values({
        id: jobId,
        libraryId: id,
        status: "queued",
        startedAt: Date.now(),
      });
      queue = queue
        .then(() => scan(id, jobId))
        .catch((e) => log.warn({ err: e }, "Scan queue failure"));
      return jobId;
    },
    exclusive<T>(operation: () => Promise<T>): Promise<T> {
      if (closed) return Promise.reject(new Error("Server is shutting down"));
      const result = queue.then(operation);
      queue = result.then(
        () => {},
        () => {},
      );
      return result;
    },
    busy: (id: string) => pending.has(id),
    async close() {
      closed = true;
      await queue;
    },
  };
}
