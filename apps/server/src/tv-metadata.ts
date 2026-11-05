import { eq, and, inArray } from "drizzle-orm";
import { series, seasons, episodes, movies } from "@cinema/database";
import { tmdb, artwork } from "./metadata.ts";
import { seriesKey } from "./television.ts";
import { config } from "./config.ts";
import type { Database } from "./context.ts";
export async function searchTV(title: string, year?: number | null) {
  const result = await tmdb(
    "/search/tv?query=" +
      encodeURIComponent(title) +
      (year ? "&first_air_date_year=" + year : ""),
  );
  const key = (name: string) => seriesKey(name, null);
  return result.results
    .map((r: any) => ({
      ...r,
      confidence:
        (key(title) === key(r.name) || key(title) === key(r.original_name || "")
          ? 0.8
          : 0.2) +
        (year
          ? Number(r.first_air_date?.slice(0, 4)) === year
            ? 0.2
            : 0
          : 0.1),
    }))
    .sort((a: any, b: any) => b.confidence - a.confidence);
}
export async function matchTV(
  db: Database,
  id: string,
  providerId: number,
  manual: boolean,
) {
  const old = await db.query.series.findFirst({ where: eq(series.id, id) });
  if (!old) throw new Error("Show not found");
  const detail = await tmdb(
    "/tv/" + providerId + "?append_to_response=credits,content_ratings",
  );
  const [poster, backdrop] = await Promise.all([
    artwork(detail.poster_path, "poster"),
    artwork(detail.backdrop_path, "backdrop"),
  ]);
  const certification =
    detail.content_ratings?.results.find((r: any) => r.iso_3166_1 === "US")
      ?.rating || null;
  await db
    .update(series)
    .set({
      title: detail.name,
      year: Number(detail.first_air_date?.slice(0, 4)) || old.year,
      overview: detail.overview,
      poster: poster || old.poster,
      backdrop: backdrop || old.backdrop,
      genres: detail.genres.map((g: any) => g.name),
      cast: detail.credits?.cast?.slice(0, 20).map((c: any) => c.name) || [],
      rating: detail.vote_average,
      certification,
      tmdbId: providerId,
      manual,
      review: false,
    })
    .where(eq(series.id, id));
}
export async function hydrateTVSeason(
  db: Database,
  id: string,
  number: number,
) {
  const show = await db.query.series.findFirst({ where: eq(series.id, id) });
  if (!show?.tmdbId) return;
  const local = await db
    .select()
    .from(episodes)
    .where(and(eq(episodes.seriesId, id), eq(episodes.season, number)));
  if (!local.length) return;
  const detail = await tmdb("/tv/" + show.tmdbId + "/season/" + number);
  const poster = await artwork(detail.poster_path, "poster");
  await db
    .update(seasons)
    .set({
      name: detail.name || "Season " + number,
      overview: detail.overview,
      airDate: detail.air_date,
      poster,
    })
    .where(and(eq(seasons.seriesId, id), eq(seasons.number, number)));
  for (const entry of local) {
    const data = detail.episodes?.find(
      (e: any) => e.episode_number === entry.number,
    );
    if (!data) continue;
    let still = entry.still;
    try {
      still =
        (await artwork(data.still_path || null, "backdrop", "w780")) || still;
    } catch {}
    const item = await db.query.movies.findFirst({
      where: eq(movies.id, entry.mediaId),
    });
    if (!item) continue;
    const title =
      entry.episodeEnd > entry.number
        ? data.name + " / Episodes " + entry.number + "–" + entry.episodeEnd
        : data.name;
    await db.transaction(async (tx) => {
      await tx
        .update(episodes)
        .set({
          title,
          overview: data.overview,
          airDate: data.air_date,
          tmdbId: data.id,
          metadataUpdatedAt: Date.now(),
          still,
        })
        .where(eq(episodes.mediaId, entry.mediaId));
      if (!item.manual)
        await tx
          .update(movies)
          .set({
            title,
            year: Number(data.air_date?.slice(0, 4)) || show.year,
            overview: data.overview,
            poster: show.poster,
            backdrop: still || show.backdrop || item.backdrop,
            genres: show.genres,
            cast: show.cast,
            rating: data.vote_average || show.rating,
            certification: show.certification,
            review: false,
            director:
              data.crew?.find((c: any) => c.job === "Director")?.name || null,
          })
          .where(eq(movies.id, entry.mediaId));
    });
  }
}
export async function enrichTV(db: Database, id: string) {
  if (!config.TMDB_TOKEN) return;
  let show = await db.query.series.findFirst({ where: eq(series.id, id) });
  if (!show) return;
  if (!show.tmdbId && !show.manual) {
    const candidates = await searchTV(show.title, show.year);
    if (
      candidates[0]?.confidence >= 0.9 &&
      (!candidates[1] ||
        candidates[0].confidence - candidates[1].confidence >= 0.05)
    )
      await matchTV(db, id, candidates[0].id, false);
    show = await db.query.series.findFirst({ where: eq(series.id, id) });
  }
  if (!show?.tmdbId) return;
  const local = await db
    .select()
    .from(episodes)
    .where(eq(episodes.seriesId, id));
  for (const number of new Set(
    local.filter((e) => !e.metadataUpdatedAt).map((e) => e.season),
  ))
    await hydrateTVSeason(db, id, number);
}
