import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  copyFile,
  writeFile,
  rm,
  readdir,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID, randomBytes } from "node:crypto";
import {
  parseEpisodeFilename,
  probe,
  fingerprint,
  run,
} from "../packages/media-core/src/index.ts";
import { hashPassword } from "../apps/server/src/security.ts";
test("TV parser handles episode tokens, season folders, specials, ranges and avoids movie years", () => {
  assert.equal(
    parseEpisodeFilename("/tv/The Office (2005)/Season 1/The.Office.S01E01.mkv")
      ?.year,
    2005,
  );
  assert.equal(
    parseEpisodeFilename("/tv/The Office (2005)/Season 2/Office US S02E01.mkv")
      ?.showTitle,
    "The Office",
  );
  assert.deepEqual(
    parseEpisodeFilename(
      "D:\\TV\\The Example (2020)\\Season 01\\The.Example.2020.S01E02.The.Arrival.1080p.mkv",
    ),
    {
      showTitle: "The Example",
      year: 2020,
      season: 1,
      episode: 2,
      episodeEnd: 2,
      title: "The Arrival",
    },
  );
  assert.equal(parseEpisodeFilename("/tv/Example/Example.2x03.mkv")?.season, 2);
  assert.equal(
    parseEpisodeFilename("/tv/Example/Season 2/03 - Third.mkv")?.showTitle,
    "Example",
  );
  assert.equal(
    parseEpisodeFilename("/tv/Example/Specials/E01 Bonus.mp4")?.season,
    0,
  );
  assert.equal(
    parseEpisodeFilename("/tv/Example/Example S01E03E04.mkv")?.episodeEnd,
    4,
  );
  assert.equal(
    parseEpisodeFilename("/tv/Example/Example S01E03-E04.mkv")?.episodeEnd,
    4,
  );
  assert.equal(parseEpisodeFilename("/movies/Interstellar (2014).mkv"), null);
  assert.equal(
    parseEpisodeFilename("/tv/Example/Season 2/Unknown Name.mkv"),
    null,
  );
  assert.equal(parseEpisodeFilename("/tv/Example/Example S01E00.mkv"), null);
});
test(
  "TV upgrade preserves legacy progress and supports actual season/episode streaming",
  { timeout: 120000 },
  async (t) => {
    const work = await mkdtemp(join(tmpdir(), "cinema-tv-")),
      data = join(work, "data"),
      media = join(work, "tv"),
      season1 = join(media, "The Example (2020)", "Season 01");
    await mkdir(season1, { recursive: true });
    const one = join(season1, "The.Example.2020.S01E01.First.mp4"),
      two = join(season1, "The.Example.2020.S01E02.Second.mp4");
    const { config } = await import("../apps/server/src/config.ts");
    config.DATA_DIR = data;
    config.TMDB_TOKEN = "";
    process.env.TMDB_TOKEN = "";
    await run(config.FFMPEG_PATH, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=12",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000",
      "-t",
      "6",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      "-c:a",
      "aac",
      "-y",
      one,
    ]);
    await copyFile(one, two);
    const technical = await probe(one, config.FFPROBE_PATH),
      fp = await fingerprint(one);
    const { stat } = await import("node:fs/promises");
    const {
      openDatabase,
      users,
      profiles,
      libraries,
      movies,
      mediaFiles,
      progress,
      watchlist,
      watchHistory,
      episodes,
    } = await import("../packages/database/src/index.ts");
    const seed = await openDatabase(data);
    const userId = randomUUID(),
      profileId = randomUUID(),
      rootId = randomUUID(),
      firstId = randomUUID(),
      secondId = randomUUID(),
      password = randomBytes(24).toString("hex");
    await seed.db.insert(users).values({
      id: userId,
      username: "tv-test",
      password: await hashPassword(password),
      createdAt: Date.now(),
    });
    await seed.db
      .insert(profiles)
      .values({ id: profileId, userId, name: "Adult", avatar: "lime" });
    await seed.db.insert(libraries).values({
      id: rootId,
      name: "Old TV import",
      path: media,
      autoScan: false,
    });
    for (const [id, path] of [
      [firstId, one],
      [secondId, two],
    ]) {
      await seed.db.insert(movies).values({
        id,
        title: "Incorrect movie match",
        tmdbId: 123,
        addedAt: 1,
      });
      const info = await stat(path);
      await seed.db.insert(mediaFiles).values({
        id: randomUUID(),
        movieId: id,
        libraryId: rootId,
        path,
        fingerprint: fp,
        size: info.size,
        mtime: Math.floor(info.mtimeMs),
        ...technical,
      });
    }
    await seed.db.insert(progress).values({
      profileId,
      movieId: firstId,
      position: 2,
      completed: false,
      updatedAt: 10,
    });
    await seed.db.insert(watchlist).values({ profileId, movieId: firstId });
    await seed.db.insert(watchHistory).values({
      id: randomUUID(),
      profileId,
      movieId: firstId,
      completedAt: 5,
    });
    seed.client.close();
    globalThis.gc?.();
    const { buildApp } = await import("../apps/server/src/app.ts");
    let app = await buildApp({ logger: false, watch: false });
    let cookie = "",
      showId = "";
    const req = (method: string, url: string, body?: unknown) =>
      app.inject({
        method: method as any,
        url,
        headers: {
          cookie,
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(body !== undefined ? { payload: JSON.stringify(body) } : {}),
      });
    async function login() {
      const response = await req("POST", "/api/login", {
        username: "tv-test",
        password,
      });
      assert.equal(response.statusCode, 200, response.body);
      cookie = String(response.headers["set-cookie"]).split(";")[0];
      assert.equal(
        (
          await req("POST", "/api/profiles/" + profileId + "/select", {
            password,
          })
        ).statusCode,
        200,
      );
    }
    async function scan() {
      const start = await req("POST", "/api/libraries/" + rootId + "/scan", {});
      assert.equal(start.statusCode, 200, start.body);
      const id = start.json().jobId;
      for (let i = 0; i < 300; i++) {
        const job = (await req("GET", "/api/scans"))
          .json()
          .find((j: any) => j.id === id);
        if (job && !["running", "queued"].includes(job.status)) {
          assert.equal(job.status, "completed", JSON.stringify(job));
          return;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error("TV scan timeout");
    }
    try {
      await login();
      await t.test(
        "startup repairs already-imported unchanged episodes without changing their IDs",
        async () => {
          const shows = (await req("GET", "/api/series")).json();
          assert.equal(shows.total, 1);
          showId = shows.items[0].id;
          assert.equal(shows.items[0].title, "The Example");
          assert.equal(shows.items[0].watchlisted, true);
          assert.equal((await req("GET", "/api/movies")).json().total, 0);
          const show = (await req("GET", "/api/series/" + showId)).json();
          assert.equal(show.seasons.length, 1);
          assert.deepEqual(
            show.seasons[0].episodes.map((e: any) => e.id),
            [firstId, secondId],
          );
          assert.equal(show.seasons[0].episodes[0].position, 2);
          assert.equal(show.resumeEpisode.id, firstId);
          assert.equal(
            (await req("GET", "/api/movies/" + firstId)).json().tmdbId,
            null,
          );
        },
      );
      await t.test("TV endpoints require login", async () => {
        for (const path of [
          "/api/series",
          "/api/series/" + showId,
          "/api/episodes/" + firstId + "/next",
        ])
          assert.equal((await app.inject({ url: path })).statusCode, 401);
      });
      await t.test(
        "new seasons, combined episodes and identical-byte episodes remain distinct",
        async () => {
          await mkdir(join(media, "The Example (2020)", "Season 02"));
          await mkdir(join(media, "The Example (2020)", "Specials"));
          await copyFile(
            one,
            join(season1, "The.Example.2020.S01E03E04.Combined.mp4"),
          );
          await copyFile(
            one,
            join(
              media,
              "The Example (2020)",
              "Season 02",
              "01 - Second season.mp4",
            ),
          );
          await copyFile(
            one,
            join(media, "The Example (2020)", "Specials", "E01 Bonus.mp4"),
          );
          await scan();
          await scan();
          const show = (await req("GET", "/api/series/" + showId)).json();
          assert.deepEqual(
            show.seasons.map((s: any) => s.number),
            [0, 1, 2],
          );
          assert.equal(show.seasons[1].episodes.length, 3);
          assert.equal(show.seasons[1].episodes[2].episodeEnd, 4);
          assert.equal(show.seasons.flatMap((s: any) => s.episodes).length, 5);
          assert.equal((await req("GET", "/api/movies")).json().total, 0);
          const fresh = (
            await req("POST", "/api/profiles", { name: "Fresh viewer" })
          ).json().id;
          await req("POST", "/api/profiles/" + fresh + "/select", { password });
          const firstRegular = (
            await req("GET", "/api/series/" + showId)
          ).json().resumeEpisode;
          assert.equal(firstRegular.seasonNumber, 1);
          assert.equal(firstRegular.episodeNumber, 1);
          await req("POST", "/api/profiles/" + profileId + "/select", {
            password,
          });
        },
      );
      await t.test(
        "TMDB TV matching caches season and episode metadata for offline browsing",
        async () => {
          const oldFetch = globalThis.fetch,
            oldToken = config.TMDB_TOKEN;
          config.TMDB_TOKEN = "test-placeholder";
          const jpeg = join(work, "still.jpg");
          await run(config.FFMPEG_PATH, [
            "-v",
            "error",
            "-i",
            one,
            "-frames:v",
            "1",
            "-y",
            jpeg,
          ]);
          const { readFile } = await import("node:fs/promises");
          const image = await readFile(jpeg);
          globalThis.fetch = async (input: any) => {
            const url = String(input);
            if (url.includes("/search/tv"))
              return Response.json({
                results: [
                  {
                    id: 999,
                    name: "The Example",
                    original_name: "The Example",
                    first_air_date: "2020-01-01",
                  },
                ],
              });
            if (url.endsWith("/configuration"))
              return Response.json({
                images: {
                  secure_base_url: "https://image.tmdb.org/t/p/",
                  poster_sizes: ["w500"],
                  backdrop_sizes: ["w780", "w1280"],
                },
              });
            if (url.startsWith("https://image.tmdb.org/"))
              return new Response(image, {
                headers: { "content-type": "image/jpeg" },
              });
            if (url.includes("/tv/999/season/")) {
              const number = Number(url.match(/season\/(\d+)/)?.[1]);
              return Response.json({
                name: number === 0 ? "Specials" : "Season " + number,
                poster_path: null,
                episodes: [1, 2, 3].map((n) => ({
                  id: number * 100 + n,
                  episode_number: n,
                  name: n === 1 ? "Pilot" : "Episode title " + n,
                  overview: "Cached episode synopsis",
                  air_date: "2020-01-01",
                  vote_average: 8,
                  still_path: "/tv-test-still.jpg",
                  crew: [],
                })),
              });
            }
            if (url.includes("/tv/999"))
              return Response.json({
                name: "The Example",
                first_air_date: "2020-01-01",
                overview: "Cached TV synopsis",
                poster_path: null,
                backdrop_path: null,
                vote_average: 8,
                genres: [{ name: "Drama" }],
                credits: { cast: [{ name: "Test actor" }] },
                content_ratings: {
                  results: [{ iso_3166_1: "US", rating: "TV-PG" }],
                },
              });
            throw new Error("Unexpected mocked TV provider request");
          };
          try {
            const search = await req(
              "GET",
              "/api/tv/search?q=The%20Example&year=2020",
            );
            assert.equal(search.statusCode, 200, search.body);
            assert.equal(search.json()[0].confidence, 1);
            const match = await req(
              "POST",
              "/api/series/" + showId + "/match",
              { tmdbId: 999 },
            );
            assert.equal(match.statusCode, 200, match.body);
            globalThis.fetch = async () => {
              throw new Error("Offline");
            };
            const show = (await req("GET", "/api/series/" + showId)).json();
            assert.equal(show.certification, "TV-PG");
            assert.equal(
              show.seasons.find((s: any) => s.number === 1).episodes[0].title,
              "Pilot",
            );
            assert.equal(
              (await req("GET", "/api/artwork/backdrop-tv-test-still.jpg"))
                .statusCode,
              200,
            );
          } finally {
            globalThis.fetch = oldFetch;
            config.TMDB_TOKEN = oldToken;
          }
        },
      );
      await t.test(
        "next episode crosses season boundaries and secure playback reuses the actual file",
        async () => {
          const next = (
            await req("GET", "/api/episodes/" + firstId + "/next")
          ).json();
          assert.equal(next.id, secondId);
          const show = (await req("GET", "/api/series/" + showId)).json();
          const combined = show.seasons[1].episodes[2];
          const after = (
            await req("GET", "/api/episodes/" + combined.id + "/next")
          ).json();
          assert.equal(after.seasonNumber, 2);
          assert.equal(
            await req("GET", "/api/episodes/" + after.id + "/next").then((r) =>
              r.json(),
            ),
            null,
          );
          const play = await req("POST", "/api/movies/" + firstId + "/play", {
            quality: "original",
          });
          assert.equal(play.statusCode, 200, play.body);
          const bytes = await app.inject({
            url: play.json().url,
            headers: { cookie, range: "bytes=0-31" },
          });
          assert.equal(bytes.statusCode, 206);
          assert.equal(bytes.rawPayload.length, 32);
          await req("DELETE", "/api/playback/" + play.json().id);
          await req("PUT", "/api/movies/" + secondId + "/progress", {
            position: 3,
          });
          const continued = (await req("GET", "/api/series/continue")).json();
          assert.equal(continued.items.length, 1);
          assert.equal(continued.items[0].id, secondId);
        },
      );
      await t.test(
        "TV roots quarantine unknown names and allow manual organization",
        async () => {
          await copyFile(one, join(season1, "Unclear filename.mp4"));
          assert.equal(
            (
              await req("PATCH", "/api/libraries/" + rootId, {
                contentType: "tv",
              })
            ).statusCode,
            200,
          );
          await scan();
          const review = (await req("GET", "/api/tv/review")).json();
          assert.equal(review.length, 1);
          assert.equal((await req("GET", "/api/movies")).json().total, 0);
          const organized = await req(
            "POST",
            "/api/episodes/" + review[0].id + "/organize",
            { showTitle: "The Example", year: 2020, season: 2, episode: 2 },
          );
          assert.equal(organized.statusCode, 200, organized.body);
          assert.equal((await req("GET", "/api/tv/review")).json().length, 0);
        },
      );
      await t.test(
        "manual episode grouping survives renamed files and automatic rescans",
        async () => {
          const show = (await req("GET", "/api/series/" + showId)).json(),
            episode = show.seasons
              .find((s: any) => s.number === 2)
              .episodes.find((e: any) => e.episodeNumber === 2);
          assert.ok(episode);
          assert.equal(
            (
              await req("POST", "/api/episodes/" + episode.id + "/organize", {
                seriesId: showId,
                showTitle: "Ignored display name",
                season: 2,
                episode: 2,
              })
            ).statusCode,
            200,
          );
          const { rename } = await import("node:fs/promises");
          await rename(
            join(season1, "Unclear filename.mp4"),
            join(season1, "Wrong Show S09E09.mp4"),
          );
          await scan();
          const updated = (await req("GET", "/api/series/" + showId)).json();
          assert.ok(
            updated.seasons
              .find((s: any) => s.number === 2)
              .episodes.some((e: any) => e.id === episode.id && e.available),
          );
          assert.equal((await req("GET", "/api/series")).json().total, 1);
        },
      );
      await t.test(
        "child profiles respect show ratings and cannot use TV administration",
        async () => {
          await req("PATCH", "/api/series/" + showId, {
            title: "The Example",
            certification: "TV-PG",
          });
          const child = (
            await req("POST", "/api/profiles", { name: "Kids", child: true })
          ).json().id;
          await req("POST", "/api/profiles/" + child + "/select", {});
          assert.equal((await req("GET", "/api/series")).json().total, 1);
          assert.equal(
            (await req("GET", "/api/movies/" + firstId)).statusCode,
            200,
          );
          assert.equal((await req("GET", "/api/tv/review")).statusCode, 403);
          await req("POST", "/api/profiles/" + profileId + "/select", {
            password,
          });
          await req("PATCH", "/api/series/" + showId, {
            title: "The Example",
            certification: "TV-MA",
          });
          await req("POST", "/api/profiles/" + child + "/select", {});
          assert.equal((await req("GET", "/api/series")).json().total, 0);
          assert.equal(
            (await req("GET", "/api/movies/" + firstId)).statusCode,
            404,
          );
          assert.equal(
            (await req("GET", "/api/series/" + showId)).statusCode,
            404,
          );
          await req("POST", "/api/profiles/" + profileId + "/select", {
            password,
          });
        },
      );
      await t.test(
        "restart and rescans retain organization, history and profile progress",
        async () => {
          await app.close();
          globalThis.gc?.();
          app = await buildApp({ logger: false, watch: false });
          const show = (await req("GET", "/api/series/" + showId)).json();
          assert.equal(show.seasons.flatMap((s: any) => s.episodes).length, 6);
          assert.equal(
            show.seasons.find((s: any) => s.number === 1).episodes[0].position,
            2,
          );
          await scan();
          assert.equal((await req("GET", "/api/series")).json().total, 1);
        },
      );
    } finally {
      await app.close();
      globalThis.gc?.();
      await rm(work, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
  },
);

test(
  "version-four database upgrade makes a pre-TV backup and preserves viewing records",
  { timeout: 10000 },
  async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const { readFile } = await import("node:fs/promises");
    const root = await mkdtemp(join(tmpdir(), "cinema-tv-upgrade-"));
    await mkdir(join(root, "database"));
    const raw = new DatabaseSync(join(root, "database/cinema.db"));
    raw.exec(
      "PRAGMA foreign_keys=ON;CREATE TABLE migrations(name TEXT PRIMARY KEY,applied_at INTEGER NOT NULL)",
    );
    const names = (await readdir("packages/database/migrations"))
      .filter((n) => n.endsWith(".sql") && n < "0005")
      .sort();
    for (const name of names) {
      raw.exec(
        await readFile(join("packages/database/migrations", name), "utf8"),
      );
      raw.prepare("INSERT INTO migrations VALUES (?,1)").run(name);
    }
    raw.exec(
      "INSERT INTO users VALUES('u','u','test-hash',1);INSERT INTO profiles(id,userId,name,avatar) VALUES('p','u','Adult','lime');INSERT INTO libraries(id,name,path,autoScan) VALUES('l','TV','/tv',0);INSERT INTO movies(id,title,addedAt) VALUES('m','Old movie entry',1);INSERT INTO progress VALUES('p','m',42,0,1);",
    );
    raw
      .prepare(
        "INSERT INTO media_files(id,movieId,libraryId,path,fingerprint,size,mtime,duration,width,height,container) VALUES('f','m','l',?,'fp',1,1,100,640,360,'mp4')",
      )
      .run("/tv/Show/Season 01/Show S01E01.mp4");
    raw.close();
    const { openDatabase } = await import("../packages/database/src/index.ts");
    const { reclassifyExistingEpisodes } =
      await import("../apps/server/src/television.ts");
    const { db, client } = await openDatabase(root);
    try {
      await reclassifyExistingEpisodes(db);
      assert.equal(
        (await client.execute("SELECT mediaType FROM movies WHERE id='m'"))
          .rows[0].mediaType,
        "episode",
      );
      assert.equal(
        (
          await client.execute(
            "SELECT position FROM progress WHERE movieId='m'",
          )
        ).rows[0].position,
        42,
      );
      const backups = await readdir(join(root, "database/backups"));
      assert.equal(backups.length, 1);
      const snapshot = new DatabaseSync(
        join(root, "database/backups", backups[0]),
        { readOnly: true },
      );
      try {
        assert.equal(
          snapshot
            .prepare("SELECT position FROM progress WHERE movieId='m'")
            .get()!.position,
          42,
        );
        assert.equal(
          snapshot
            .prepare(
              "SELECT count(*) AS n FROM migrations WHERE name='0005_television.sql'",
            )
            .get()!.n,
          0,
        );
      } finally {
        snapshot.close();
      }
    } finally {
      client.close();
      globalThis.gc?.();
      await rm(root, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
  },
);
