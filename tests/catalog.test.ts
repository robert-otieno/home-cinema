import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  copyFile,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import * as schema from "../packages/database/src/index.ts";
import { run, probe, fingerprint } from "../packages/media-core/src/index.ts";

test(
  "catalog removal protects media, handles duplicates and missing files, and survives rescans",
  { timeout: 120000 },
  async (t) => {
    const work = await mkdtemp(join(tmpdir(), "cinema-cleanup-")),
      data = join(work, "data"),
      root = join(work, "media"),
      other = join(work, "other");
    await mkdir(root);
    await mkdir(other);
    const { config } = await import("../apps/server/src/config.ts");
    config.DATA_DIR = data;
    config.TMDB_TOKEN = "";
    const source = join(root, "Duplicate (2026).mp4");
    await run(config.FFMPEG_PATH, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=128x72:r=24",
      "-t",
      "1",
      "-c:v",
      "libx264",
      "-threads",
      "1",
      "-y",
      source,
    ]);
    const technical = await probe(source, config.FFPROBE_PATH),
      info = await stat(source),
      fp = await fingerprint(source);
    const { buildApp } = await import("../apps/server/src/app.ts");
    let app = await buildApp({ logger: false, watch: false });
    const setup = await app.inject({
      method: "POST",
      url: "/api/setup",
      payload: {
        username: "cleanup-test",
        password: "Temporary cleanup test password!",
      },
    });
    assert.equal(setup.statusCode, 200, setup.body);
    let cookie = String(setup.headers["set-cookie"]).split(";")[0];
    const request = (method: string, url: string, payload?: unknown) =>
      app.inject({
        method: method as any,
        url,
        ...(payload !== undefined
          ? {
              payload: JSON.stringify(payload),
              headers: { cookie, "content-type": "application/json" },
            }
          : { headers: { cookie } }),
      });
    const { db, client } = await schema.openDatabase(data);
    const ids = {
      remove: randomUUID(),
      keep: randomUUID(),
      missing: randomUUID(),
      offline: randomUUID(),
      episode: randomUUID(),
    };
    const lib = randomUUID(),
      lib2 = randomUUID(),
      offlineLib = randomUUID(),
      show = randomUUID(),
      session = randomUUID();
    try {
      await db.insert(schema.libraries).values([
        { id: lib, name: "Media", path: root, autoScan: false },
        { id: lib2, name: "Other", path: other, autoScan: false },
        {
          id: offlineLib,
          name: "Offline",
          path: join(work, "offline-drive"),
          autoScan: false,
        },
      ]);
      const profile = (await db.select().from(schema.profiles))[0].id;
      for (const [key, id] of Object.entries(ids)) {
        await db.insert(schema.movies).values({
          id,
          title: key === "remove" || key === "keep" ? "Duplicate" : key,
          mediaType: key === "episode" ? "episode" : "movie",
          addedAt: Date.now(),
        });
        const path =
          key === "remove"
            ? source
            : key === "missing"
              ? join(root, "Deleted.mp4")
              : key === "offline"
                ? join(work, "offline-drive", "Film.mp4")
                : join(other, key + ".mp4");
        if (key === "keep" || key === "episode") await copyFile(source, path);
        const file = randomUUID();
        await db.insert(schema.mediaFiles).values({
          id: file,
          movieId: id,
          libraryId:
            key === "offline"
              ? offlineLib
              : key === "keep" || key === "episode"
                ? lib2
                : lib,
          path,
          fingerprint: fp,
          size: info.size,
          mtime: Math.floor(info.mtimeMs),
          ...technical,
          available: key !== "missing" && key !== "offline",
        });
        if (key === "remove") {
          await db.insert(schema.audioTracks).values({
            fileId: file,
            streamIndex: 1,
            codec: "aac",
            language: "und",
            title: "Audio",
          });
          await db.insert(schema.subtitleTracks).values({
            fileId: file,
            streamIndex: 2,
            codec: "subrip",
            language: "en",
            title: "Subtitles",
          });
        }
        await db.insert(schema.progress).values({
          profileId: profile,
          movieId: id,
          position: 4,
          completed: false,
          updatedAt: Date.now(),
        });
        await db
          .insert(schema.watchlist)
          .values({ profileId: profile, movieId: id });
      }
      await db.insert(schema.series).values({
        id: show,
        identityKey: "cleanup-show",
        title: "Cleanup Show",
        addedAt: Date.now(),
      });
      await db
        .insert(schema.seasons)
        .values({ seriesId: show, number: 1, name: "Season 1" });
      await db.insert(schema.episodes).values({
        mediaId: ids.episode,
        seriesId: show,
        season: 1,
        number: 1,
        episodeEnd: 1,
        title: "Pilot",
        manualOrganization: true,
      });
      await db
        .insert(schema.seriesWatchlist)
        .values({ profileId: profile, seriesId: show });
      await db.insert(schema.genres).values({ name: "Drama" });
      await db
        .insert(schema.movieGenres)
        .values({ movieId: ids.remove, genre: "Drama" });
      const person = randomUUID();
      await db.insert(schema.people).values({ id: person, name: "Test Actor" });
      await db
        .insert(schema.movieCredits)
        .values({ movieId: ids.remove, personId: person, role: "actor" });
      await db.insert(schema.metadataMatches).values({
        movieId: ids.remove,
        provider: "tmdb",
        providerId: 1,
        confidence: 1,
        manual: true,
        payload: {},
        updatedAt: Date.now(),
      });
      await db.insert(schema.movieArtwork).values({
        movieId: ids.remove,
        kind: "poster",
        uri: "/api/artwork/test.jpg",
        provider: "tmdb",
      });
      await db.insert(schema.watchHistory).values({
        id: randomUUID(),
        movieId: ids.remove,
        profileId: profile,
        completedAt: Date.now(),
      });

      await t.test(
        "cleanup requires adult authentication and explicit confirmation",
        async () => {
          for (const [method, url, payload] of [
            ["GET", "/api/catalog/entries", undefined],
            [
              "POST",
              "/api/catalog/remove",
              { ids: [ids.remove], confirm: true },
            ],
            ["POST", "/api/catalog/allow-reimport", { confirm: true }],
          ] as const) {
            assert.equal(
              (await app.inject({ method, url, payload })).statusCode,
              401,
            );
          }
          assert.equal(
            (
              await request("POST", "/api/catalog/remove", {
                ids: [ids.remove],
              })
            ).statusCode,
            400,
          );
          const child = (
            await request("POST", "/api/profiles", {
              name: "Child",
              child: true,
            })
          ).json().id;
          await request("POST", "/api/profiles/" + child + "/select", {});
          assert.equal(
            (await request("GET", "/api/catalog/entries")).statusCode,
            403,
          );
          assert.equal(
            (
              await request("POST", "/api/catalog/remove", {
                ids: [ids.remove],
                confirm: true,
              })
            ).statusCode,
            403,
          );
          assert.equal(
            (
              await request("POST", "/api/catalog/allow-reimport", {
                confirm: true,
              })
            ).statusCode,
            403,
          );
          await request("POST", "/api/profiles/" + profile + "/select", {
            password: "Temporary cleanup test password!",
          });
        },
      );
      await t.test(
        "search distinguishes duplicates and returns show context",
        async () => {
          const duplicates = await request(
            "GET",
            "/api/catalog/entries?missing=false&q=Duplicate",
          );
          assert.equal(duplicates.statusCode, 200, duplicates.body);
          assert.equal(duplicates.json().total, 2);
          assert.ok(
            duplicates
              .json()
              .items.every((item: any) => item.missing === false),
          );
          assert.notEqual(
            duplicates.json().items[0].files[0].path,
            duplicates.json().items[1].files[0].path,
          );
          const shows = (
            await request(
              "GET",
              "/api/catalog/entries?missing=false&q=Cleanup%20Show",
            )
          ).json();
          assert.equal(shows.total, 1);
          assert.equal(shows.items[0].episode.season, 1);
          assert.equal(
            (await request("GET", "/api/catalog/entries")).json().total,
            2,
          );
        },
      );
      await t.test(
        "missing cleanup rejects present files and offline roots atomically",
        async () => {
          assert.equal(
            (
              await request("POST", "/api/catalog/remove", {
                ids: [ids.missing, ids.remove],
                missingOnly: true,
                confirm: true,
              })
            ).statusCode,
            409,
          );
          assert.equal(
            (
              await request("POST", "/api/catalog/remove", {
                ids: [ids.offline],
                missingOnly: true,
                confirm: true,
              })
            ).statusCode,
            409,
          );
          assert.equal(
            (await db.select().from(schema.catalogExclusions)).length,
            0,
          );
          assert.equal((await db.select().from(schema.movies)).length, 5);
        },
      );
      await t.test("active playback blocks removal", async () => {
        await db.insert(schema.playbackSessions).values({
          id: session,
          movieId: ids.remove,
          profileId: profile,
          mode: "hls",
          quality: "720p",
          device: "test",
          status: "playing",
          startedAt: Date.now(),
          updatedAt: Date.now(),
        });
        await db.insert(schema.transcodeJobs).values({
          sessionId: session,
          status: "completed",
          encoder: "libx264",
          quality: "720p",
          startedAt: Date.now(),
        });
        assert.equal(
          (
            await request("POST", "/api/catalog/remove", {
              ids: [ids.remove],
              confirm: true,
            })
          ).statusCode,
          409,
        );
        await db.update(schema.playbackSessions).set({ status: "ended" });
      });
      await t.test(
        "removal cleans dependent database records and preserves the other duplicate and disk",
        async () => {
          const result = await request("POST", "/api/catalog/remove", {
            ids: [ids.remove],
            confirm: true,
          });
          assert.equal(result.statusCode, 200, result.body);
          assert.equal((await stat(source)).size, info.size);
          assert.equal(
            (await request("GET", "/api/movies/" + ids.remove)).statusCode,
            404,
          );
          assert.equal(
            (await request("GET", "/api/movies/" + ids.keep)).statusCode,
            200,
          );
          assert.equal(
            (await db.select().from(schema.progress)).filter(
              (p) => p.movieId === ids.keep,
            ).length,
            1,
          );
          for (const table of [
            schema.audioTracks,
            schema.subtitleTracks,
            schema.transcodeJobs,
            schema.playbackSessions,
            schema.movieGenres,
            schema.movieCredits,
            schema.movieArtwork,
            schema.metadataMatches,
            schema.watchHistory,
          ]) {
            assert.equal((await db.select().from(table as any)).length, 0);
          }
        },
      );
      async function scan() {
        const job = (
          await request("POST", "/api/libraries/" + lib + "/scan")
        ).json().jobId;
        for (let n = 0; n < 200; n++) {
          const jobs = (await request("GET", "/api/scans")).json();
          const row = jobs.find((j: any) => j.id === job);
          if (row && !["queued", "running"].includes(row.status)) return row;
          await new Promise((r) => setTimeout(r, 25));
        }
        throw new Error("Scan did not finish");
      }
      await t.test(
        "deleted files can be cleared and removed entries stay excluded after scanning and restart",
        async () => {
          const result = await request("POST", "/api/catalog/remove", {
            ids: [ids.missing],
            missingOnly: true,
            confirm: true,
          });
          assert.equal(result.statusCode, 200, result.body);
          const job = await scan();
          assert.equal(job.processed, 0);
          assert.deepEqual(job.errors, []);
          await app.close();
          app = await buildApp({ logger: false, watch: false });
          assert.equal(
            (
              await request(
                "GET",
                "/api/catalog/entries?missing=false&q=Duplicate",
              )
            ).json().total,
            1,
          );
          assert.equal(
            (await request("GET", "/api/catalog/entries")).json().excluded,
            2,
          );
        },
      );
      await t.test(
        "removing the last episode clears empty series and retains the source file",
        async () => {
          const result = await request("POST", "/api/catalog/remove", {
            ids: [ids.episode],
            confirm: true,
          });
          assert.equal(result.statusCode, 200, result.body);
          assert.equal((await db.select().from(schema.series)).length, 0);
          assert.equal((await db.select().from(schema.seasons)).length, 0);
          assert.equal(
            (await db.select().from(schema.seriesWatchlist)).length,
            0,
          );
          assert.equal(
            (await stat(join(other, "episode.mp4"))).size,
            info.size,
          );
        },
      );
      await t.test(
        "allowing re-import makes a retained file eligible for scanning again",
        async () => {
          assert.equal(
            (
              await request("POST", "/api/catalog/allow-reimport", {
                confirm: true,
              })
            ).statusCode,
            200,
          );
          assert.equal(
            (await db.select().from(schema.catalogExclusions)).length,
            0,
          );
          const job = await scan();
          assert.equal(job.processed, 1);
          assert.equal(
            (
              await request(
                "GET",
                "/api/catalog/entries?missing=false&q=Duplicate",
              )
            ).json().total,
            1,
          );
        },
      );
    } finally {
      await app.close();
      client.close();
      globalThis.gc?.();
      await rm(work, {
        recursive: true,
        force: true,
        maxRetries: 15,
        retryDelay: 100,
      });
    }
  },
);
