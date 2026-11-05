import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.ts";
import type { Database } from "./context.ts";
import {
  movies,
  genres,
  movieGenres,
  people,
  movieCredits,
  metadataMatches,
  movieArtwork,
} from "@cinema/database";
import { eq } from "drizzle-orm";
const cache = new Map<string, { expires: number; value: any }>();
let cooldown = 0;
export async function tmdb(path: string): Promise<any> {
  if (!config.TMDB_TOKEN)
    throw new Error("Set TMDB_TOKEN in .env and restart to enable metadata.");
  const saved = cache.get(path);
  if (saved && saved.expires > Date.now()) return saved.value;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (cooldown > Date.now())
      await new Promise((r) =>
        setTimeout(r, Math.min(cooldown - Date.now(), 10000)),
      );
    const response = await fetch("https://api.themoviedb.org/3" + path, {
      headers: { Authorization: "Bearer " + config.TMDB_TOKEN },
      signal: AbortSignal.timeout(12000),
    });
    if (response.status === 429) {
      cooldown =
        Date.now() +
        Math.min(10, Number(response.headers.get("retry-after")) || 2) * 1000;
      continue;
    }
    if (response.status >= 500) {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      continue;
    }
    if (!response.ok)
      throw new Error("Metadata provider returned " + response.status);
    const value = await response.json();
    if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
    cache.set(path, { value, expires: Date.now() + 3600000 });
    return value;
  }
  throw new Error("Metadata provider is temporarily unavailable");
}
export function confidence(title: string, year: number | null, result: any) {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]/g, "");
  const exact =
    normalize(title) === normalize(result.title) ||
    normalize(title) === normalize(result.original_title || "");
  const candidateYear = Number(result.release_date?.slice(0, 4));
  return (
    (exact ? 0.8 : 0.25) +
    (year && candidateYear === year ? 0.2 : !year ? 0.1 : 0)
  );
}
export async function searchMetadata(title: string, year?: number | null) {
  const data = await tmdb(
    "/search/movie?query=" +
      encodeURIComponent(title) +
      (year ? "&year=" + year : ""),
  );
  return data.results.map((r: any) => ({
    ...r,
    confidence: confidence(title, year || null, r),
  }));
}
export async function artwork(
  path: string | null,
  kind: "poster" | "backdrop",
  preferredSize?: string,
) {
  if (!path) return null;
  const cfg = await tmdb("/configuration");
  const size = preferredSize || (kind === "poster" ? "w500" : "w1280");
  const sizes =
    kind === "poster" ? cfg.images.poster_sizes : cfg.images.backdrop_sizes;
  const chosen = sizes.includes(size)
    ? size
    : sizes.filter((s: string) => s !== "original").at(-1);
  if (!chosen || !/^\/[a-zA-Z0-9._-]+$/.test(path)) return null;
  const url = new URL(cfg.images.secure_base_url + chosen + path);
  if (url.hostname !== "image.tmdb.org")
    throw new Error("Unexpected artwork host");
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error("Artwork download failed");
  if (!response.headers.get("content-type")?.startsWith("image/"))
    throw new Error("Invalid artwork type");
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 12000000)
        throw new Error("Artwork exceeds cache file limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  await mkdir(join(config.DATA_DIR, "artwork"), { recursive: true });
  const filename = kind + "-" + path.slice(1);
  await writeFile(
    join(config.DATA_DIR, "artwork", filename),
    Buffer.concat(chunks),
  );
  return "/api/artwork/" + filename;
}
export async function applyMetadata(
  db: Database,
  movieId: string,
  tmdbId: number,
  manual = false,
) {
  const detail = await tmdb(
    "/movie/" + tmdbId + "?append_to_response=credits,release_dates,videos",
  );
  const certification =
    detail.release_dates?.results
      .find((r: any) => r.iso_3166_1 === "US")
      ?.release_dates.find((r: any) => r.certification)?.certification || null;
  const [poster, backdrop] = await Promise.all([
    artwork(detail.poster_path, "poster"),
    artwork(detail.backdrop_path, "backdrop"),
  ]);
  await db.transaction(async (tx) => {
    await tx
      .update(movies)
      .set({
        tmdbId,
        title: detail.title,
        year: Number(detail.release_date?.slice(0, 4)) || null,
        overview: detail.overview,
        rating: detail.vote_average,
        genres: detail.genres.map((g: any) => g.name),
        cast: detail.credits.cast.slice(0, 20).map((c: any) => c.name),
        director:
          detail.credits.crew.find((c: any) => c.job === "Director")?.name ||
          null,
        poster,
        backdrop,
        collection: detail.belongs_to_collection?.name || null,
        certification,
        originalTitle: detail.original_title,
        releaseDate: detail.release_date,
        language: detail.original_language,
        countries: detail.production_countries?.map((c: any) => c.name) || [],
        trailers: (detail.videos?.results || [])
          .filter(
            (v: any) =>
              v.site === "YouTube" &&
              v.type === "Trailer" &&
              /^[a-zA-Z0-9_-]{6,20}$/.test(v.key),
          )
          .slice(0, 3)
          .map((v: any) => ({
            name: v.name,
            url: "https://www.youtube.com/watch?v=" + v.key,
          })),
        review: false,
        manual,
      })
      .where(eq(movies.id, movieId));
    await tx.delete(movieGenres).where(eq(movieGenres.movieId, movieId));
    for (const g of detail.genres) {
      await tx.insert(genres).values({ name: g.name }).onConflictDoNothing();
      await tx
        .insert(movieGenres)
        .values({ movieId, genre: g.name })
        .onConflictDoNothing();
    }
    await tx.delete(movieCredits).where(eq(movieCredits.movieId, movieId));
    const credits = [
      ...detail.credits.cast
        .slice(0, 40)
        .map((c: any, i: number) => ({ ...c, role: "Cast", ordering: i })),
      ...detail.credits.crew
        .filter((c: any) =>
          ["Director", "Writer", "Screenplay", "Producer"].includes(c.job),
        )
        .map((c: any) => ({ ...c, role: c.job, ordering: 0 })),
    ];
    for (const c of credits) {
      const personId = "tmdb-" + c.id;
      await tx
        .insert(people)
        .values({ id: personId, name: c.name, providerId: c.id })
        .onConflictDoUpdate({ target: people.id, set: { name: c.name } });
      await tx
        .insert(movieCredits)
        .values({
          movieId,
          personId,
          role: c.role,
          character: c.character || "",
          ordering: c.ordering,
        })
        .onConflictDoNothing();
    }
    await tx
      .insert(metadataMatches)
      .values({
        movieId,
        provider: "tmdb",
        providerId: tmdbId,
        confidence: 1,
        manual,
        payload: detail,
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: [metadataMatches.movieId, metadataMatches.provider],
        set: {
          providerId: tmdbId,
          confidence: 1,
          manual,
          payload: detail,
          updatedAt: Date.now(),
        },
      });
    for (const [kind, uri] of [
      ["poster", poster],
      ["backdrop", backdrop],
    ])
      if (uri)
        await tx
          .insert(movieArtwork)
          .values({ movieId, kind: kind!, uri, provider: "tmdb" })
          .onConflictDoUpdate({
            target: [movieArtwork.movieId, movieArtwork.kind],
            set: { uri },
          });
  });
}
export interface MetadataProvider {
  id: string;
  search: (title: string, year?: number | null) => Promise<any[]>;
  apply: (
    db: Database,
    movieId: string,
    providerId: number,
    manual?: boolean,
  ) => Promise<void>;
}
export const tmdbProvider: MetadataProvider = {
  id: "tmdb",
  search: searchMetadata,
  apply: applyMetadata,
};
