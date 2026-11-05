import { randomUUID } from "node:crypto";
import { mkdir, rm, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { config } from "../apps/server/src/config.ts";
import { openDatabase, movies } from "../packages/database/src/index.ts";
import { searchMetadata, applyMetadata } from "../apps/server/src/metadata.ts";
if (!config.TMDB_TOKEN)
  throw new Error(
    "TMDB_TOKEN is not configured. No credential value is printed.",
  );
const folder = resolve("work/live-metadata-" + randomUUID());
await mkdir(folder, { recursive: true });
const original = config.DATA_DIR;
const { db, client } = await openDatabase(folder);
config.DATA_DIR = folder;
try {
  const results = await searchMetadata("Interstellar", 2014);
  const match = results.find((r: any) => r.confidence >= 0.95);
  if (!match) throw new Error("No confident live match returned");
  const id = randomUUID();
  await db
    .insert(movies)
    .values({ id, title: "Live metadata check", addedAt: Date.now() });
  await applyMetadata(db, id, match.id);
  const movie = await db.query.movies.findFirst();
  if (!movie?.poster || !movie.backdrop)
    throw new Error("Metadata response did not include expected artwork");
  console.log(
    JSON.stringify({
      status: "passed",
      movie: movie.title,
      year: movie.year,
      genres: movie.genres,
      castCount: movie.cast.length,
      posterCached:
        (await stat(join(folder, "artwork", movie.poster.split("/").at(-1)!)))
          .size > 0,
      backdropCached:
        (await stat(join(folder, "artwork", movie.backdrop.split("/").at(-1)!)))
          .size > 0,
      tokenPrinted: false,
    }),
  );
} finally {
  config.DATA_DIR = original;
  client.close();
  await rm(folder, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
