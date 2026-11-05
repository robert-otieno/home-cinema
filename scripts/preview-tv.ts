import { mkdir, copyFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../apps/server/src/config.ts";
import { run, probe, fingerprint } from "../packages/media-core/src/index.ts";
import {
  openDatabase,
  libraries,
  movies,
  mediaFiles,
} from "../packages/database/src/index.ts";
import { reclassifyExistingEpisodes } from "../apps/server/src/television.ts";
import { enrichTV } from "../apps/server/src/tv-metadata.ts";
const data = resolve("work/tv-preview-data"),
  root = resolve("work/tv-preview-media");
config.DATA_DIR = data;
await mkdir(join(root, "The Office (2005)", "Season 01"), { recursive: true });
await mkdir(join(root, "The Office (2005)", "Season 02"), { recursive: true });
const sample = join(
  root,
  "The Office (2005)",
  "Season 01",
  "The.Office.2005.S01E01.mp4",
);
await run(config.FFMPEG_PATH, [
  "-v",
  "error",
  "-f",
  "lavfi",
  "-i",
  "testsrc2=size=640x360:rate=24",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:sample_rate=48000",
  "-t",
  "18",
  "-c:v",
  "libx264",
  "-threads",
  "2",
  "-c:a",
  "aac",
  "-movflags",
  "+faststart",
  "-y",
  sample,
]);
const { db, client } = await openDatabase(data);
try {
  let library = await db.query.libraries.findFirst();
  if (!library) {
    await db.insert(libraries).values({
      id: randomUUID(),
      name: "TV preview",
      path: root,
      contentType: "tv",
      autoScan: false,
    });
    library = (await db.query.libraries.findFirst())!;
  }
  const technical = await probe(sample, config.FFPROBE_PATH),
    fp = await fingerprint(sample);
  for (const [season, episode] of [
    [1, 1],
    [1, 2],
    [1, 3],
    [2, 1],
  ]) {
    const path = join(
      root,
      "The Office (2005)",
      "Season " + String(season).padStart(2, "0"),
      "The.Office.2005.S" +
        String(season).padStart(2, "0") +
        "E" +
        String(episode).padStart(2, "0") +
        ".mp4",
    );
    if (path !== sample) await copyFile(sample, path);
    const files = await db.select().from(mediaFiles);
    if (files.some((f) => f.path === path)) continue;
    const id = randomUUID();
    await db.insert(movies).values({
      id,
      title: "Previously imported episode",
      addedAt: Date.now(),
    });
    const info = await stat(path);
    await db.insert(mediaFiles).values({
      id: randomUUID(),
      movieId: id,
      libraryId: library.id,
      path,
      size: info.size,
      mtime: Math.floor(info.mtimeMs),
      fingerprint: fp,
      ...technical,
    });
  }
  await reclassifyExistingEpisodes(db);
  const show = (await db.query.series.findFirst())!;
  await enrichTV(db, show.id);
  const updated = (await db.query.series.findFirst())!,
    local = await db
      .select()
      .from((await import("../packages/database/src/index.ts")).episodes);
  console.log(
    JSON.stringify({
      show: updated.title,
      matched: !!updated.tmdbId,
      posterCached: !!updated.poster,
      localEpisodes: local.length,
      titles: local.map((e) => e.title),
    }),
  );
} finally {
  client.close();
  globalThis.gc?.();
}
