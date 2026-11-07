import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rename,
  copyFile,
  rm,
  readFile,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import {
  parseFilename,
  within,
  byteRange,
  run,
  safePath,
} from "../packages/media-core/src/index.ts";
import { hashPassword, verifyPassword } from "../apps/server/src/security.ts";
test("filename parsing extracts title and year", () => {
  assert.deepEqual(parseFilename("Interstellar.2014.1080p.BluRay.mkv"), {
    title: "Interstellar",
    year: 2014,
  });
  assert.equal(parseFilename("A Movie WEB-DL 1080p.mp4").title, "A Movie");
});
test("ranges handle bounded, open and suffix requests", () => {
  assert.deepEqual(byteRange("bytes=0-9", 100), { start: 0, end: 9 });
  assert.deepEqual(byteRange("bytes=90-", 100), { start: 90, end: 99 });
  assert.deepEqual(byteRange("bytes=-200", 100), { start: 0, end: 99 });
  assert.equal(byteRange(undefined, 100), null);
});
test("invalid ranges are rejected", () => {
  for (const range of [
    "bytes=100-",
    "bytes=-0",
    "bytes=50-40",
    "bytes=0-1,4-5",
    "bytes=-",
    "units=1-2",
    "bytes=9999999999999999999999-",
  ])
    assert.throws(() => byteRange(range, 100));
  assert.throws(() => byteRange("bytes=0-", 0));
});
test("path containment rejects traversal and siblings", () => {
  const root = resolve("work/root");
  assert.ok(within(root, join(root, "film.mp4")));
  assert.ok(!within(root, resolve(root, "../root-other/film.mp4")));
  assert.ok(!within(root, resolve(root, "..")));
});
test("password hashing uses independent salts and verifies safely", async () => {
  const a = await hashPassword("a long test password"),
    b = await hashPassword("a long test password");
  assert.notEqual(a, b);
  assert.ok(await verifyPassword("a long test password", a));
  assert.ok(!(await verifyPassword("wrong", a)));
  assert.ok(!(await verifyPassword("wrong", "invalid")));
});
test(
  "real server lifecycle and media integration",
  { timeout: 120000 },
  async (t) => {
    const work = await mkdtemp(join(tmpdir(), "home-cinema-test-"));
    const data = join(work, "data"),
      media = join(work, "movies");
    await mkdir(media);
    process.env.DATA_DIR = data;
    process.env.TMDB_TOKEN = "";
    const { config } = await import("../apps/server/src/config.ts");
    config.DATA_DIR = data;
    config.TMDB_TOKEN = "";
    const { buildApp } = await import("../apps/server/src/app.ts");
    const app = await buildApp({ logger: false, watch: false });
    let cookie = "";
    let movieId = "",
      playbackId = "",
      libraryId = "";
    let closed = false;
    let password = randomBytes(24).toString("hex");
    const request = (
      method: string,
      url: string,
      payload?: unknown,
      headers: Record<string, string> = {},
    ) =>
      app.inject({
        method: method as any,
        url,
        ...(payload !== undefined
          ? {
              payload: JSON.stringify(payload),
              headers: {
                cookie,
                "content-type": "application/json",
                ...headers,
              },
            }
          : { headers: { cookie, ...headers } }),
      });
    async function scan() {
      const result = await request(
        "POST",
        "/api/libraries/" + libraryId + "/scan",
        {},
      );
      assert.equal(result.statusCode, 200, result.body);
      const jobId = result.json().jobId;
      for (let i = 0; i < 150; i++) {
        const jobs = (await request("GET", "/api/scans")).json();
        const job = jobs.find((j: any) => j.id === jobId);
        if (job && !["queued", "running"].includes(job.status)) {
          assert.equal(job.status, "completed", JSON.stringify(job));
          return;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error("Scan timed out");
    }
    try {
      await t.test(
        "production home and SPA routes return the browser client",
        async () => {
          const response = await request("GET", "/");
          assert.equal(response.statusCode, 200, response.body);
          assert.ok(response.body.includes('<div id="root">'));
          assert.equal((await request("GET", "/browse")).statusCode, 200);
        },
      );
      await t.test("unauthenticated library access is denied", async () => {
        assert.equal(
          (await app.inject({ url: "/api/filesystem/folders" })).statusCode,
          401,
        );
        assert.equal(
          (await request("GET", "/api/auth/backdrop")).statusCode,
          204,
        );
        assert.equal((await request("GET", "/api/movies")).statusCode, 401);
      });
      await t.test(
        "initial setup creates one household and protects against replay",
        async () => {
          const result = await request("POST", "/api/setup", {
            username: "tester",
            password,
          });
          assert.equal(result.statusCode, 200, result.body);
          cookie = String(result.headers["set-cookie"]).split(";")[0];
          assert.ok(String(result.headers["set-cookie"]).includes("HttpOnly"));
          assert.equal(
            (
              await request("POST", "/api/setup", {
                username: "other",
                password,
              })
            ).statusCode,
            409,
          );
        },
      );
      await t.test("origin checks prevent cross site changes", async () => {
        assert.equal(
          (
            await request(
              "POST",
              "/api/profiles",
              { name: "Bad" },
              { origin: "https://evil.example" },
            )
          ).statusCode,
          403,
        );
      });
      await t.test(
        "login rejects incorrect credentials and creates a fresh session",
        async () => {
          assert.equal(
            (
              await request("POST", "/api/login", {
                username: "tester",
                password: "incorrect but long password",
              })
            ).statusCode,
            401,
          );
          const result = await request("POST", "/api/login", {
            username: "tester",
            password,
          });
          assert.equal(result.statusCode, 200, result.body);
          const fresh = String(result.headers["set-cookie"]).split(";")[0];
          assert.notEqual(fresh, cookie);
          assert.equal(
            (
              await app.inject({ url: "/api/me", headers: { cookie: fresh } })
            ).json().profileId,
            null,
          );
        },
      );
      const clip = join(media, "Cinema Test (2026).mp4");
      await t.test(
        "generate a legal local H264/AAC video fixture",
        async () => {
          await run(
            config.FFMPEG_PATH,
            [
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
              "12",
              "-c:v",
              "libx264",
              "-threads",
              "2",
              "-pix_fmt",
              "yuv420p",
              "-c:a",
              "aac",
              "-movflags",
              "+faststart",
              clip,
            ],
            60000,
          );
          assert.ok((await stat(clip)).size > 1000);
        },
      );
      await t.test(
        "canonical path validation rejects files outside a root",
        async () => {
          const outside = join(work, "outside.txt");
          await writeFile(outside, "outside");
          await assert.rejects(() => safePath(media, outside));
        },
      );
      await t.test("folder scan creates a real probed movie", async () => {
        const result = await request("POST", "/api/libraries", {
          name: "Test Movies",
          path: media,
          autoScan: false,
        });
        assert.equal(result.statusCode, 200, result.body);
        libraryId = result.json().id;
        await scan();
        const resultMovies = (await request("GET", "/api/movies")).json();
        assert.equal(resultMovies.total, 1);
        const movie = resultMovies.items[0];
        movieId = movie.id;
        assert.equal(movie.title, "Cinema Test");
        assert.equal(movie.year, 2026);
        assert.equal(movie.videoCodec, "h264");
        assert.ok(movie.duration >= 11);
        assert.ok(movie.available);
        assert.ok(!("path" in movie));
      });
      await t.test(
        "rescans and duplicate copies preserve a single movie",
        async () => {
          await copyFile(clip, join(media, "Cinema Test Copy.mp4"));
          await scan();
          assert.equal((await request("GET", "/api/movies")).json().total, 1);
        },
      );
      await t.test(
        "direct stream returns correct range bytes and authorization",
        async () => {
          const result = await request(
            "POST",
            "/api/movies/" + movieId + "/play",
            { quality: "original" },
          );
          assert.equal(result.statusCode, 200, result.body);
          playbackId = result.json().id;
          const response = await request(
            "GET",
            "/api/playback/" + playbackId + "/file",
            undefined,
            { range: "bytes=0-31" },
          );
          assert.equal(response.statusCode, 206, response.body);
          assert.equal(response.rawPayload.length, 32);
          assert.deepEqual(
            response.rawPayload,
            (await readFile(clip)).subarray(0, 32),
          );
          assert.equal(
            (
              await request(
                "GET",
                "/api/playback/" + playbackId + "/file",
                undefined,
                { range: "bytes=9999999999-" },
              )
            ).statusCode,
            416,
          );
          assert.equal(
            (await app.inject({ url: "/api/playback/" + playbackId + "/file" }))
              .statusCode,
            401,
          );
        },
      );
      await t.test("watchlists and progress persist in SQLite", async () => {
        assert.equal(
          (
            await request("PUT", "/api/movies/" + movieId + "/progress", {
              position: 4,
            })
          ).statusCode,
          200,
        );
        await request("POST", "/api/movies/" + movieId + "/watchlist", {
          enabled: true,
        });
        const movie = (await request("GET", "/api/movies/" + movieId)).json();
        assert.equal(movie.position, 4);
        assert.ok(movie.watchlisted);
      });
      await t.test(
        "manual movie matching clears review, caches artwork and retains progress and watchlist",
        async () => {
          const originalFetch = globalThis.fetch,
            originalToken = config.TMDB_TOKEN;
          config.TMDB_TOKEN = "test-placeholder";
          globalThis.fetch = async (input: any) => {
            const url = String(input);
            if (url.includes("/search/movie")) {
              assert.ok(url.includes("year=2026"));
              return Response.json({
                results: [
                  {
                    id: 997766,
                    title: "Cinema Test Matched",
                    release_date: "2026-01-01",
                    overview: "Correct release",
                  },
                ],
              });
            }
            if (url.endsWith("/configuration"))
              return Response.json({
                images: {
                  secure_base_url: "https://image.tmdb.org/t/p/",
                  poster_sizes: ["w500"],
                  backdrop_sizes: ["w1280"],
                },
              });
            if (url.startsWith("https://image.tmdb.org/"))
              return new Response(
                Buffer.from(
                  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4n8AAAAASUVORK5CYII=",
                  "base64",
                ),
                { headers: { "content-type": "image/png" } },
              );
            if (url.includes("/movie/997766"))
              return Response.json({
                id: 997766,
                title: "Cinema Test Matched",
                original_title: "Cinema Test Matched",
                release_date: "2026-01-01",
                original_language: "en",
                overview: "The right film.",
                vote_average: 7,
                genres: [],
                credits: { cast: [], crew: [] },
                poster_path: "/review-match.png",
                backdrop_path: "/review-backdrop.png",
                release_dates: { results: [] },
              });
            throw new Error("Unexpected metadata request");
          };
          try {
            const search = await request(
              "GET",
              "/api/metadata/search?q=Cinema&year=2026",
            );
            assert.equal(search.statusCode, 200, search.body);
            const result = await request(
              "POST",
              "/api/movies/" + movieId + "/match",
              { tmdbId: search.json()[0].id },
            );
            assert.equal(result.statusCode, 200, result.body);
            const matched = (
              await request("GET", "/api/movies/" + movieId)
            ).json();
            assert.equal(matched.id, movieId);
            assert.equal(matched.review, false);
            assert.equal(matched.title, "Cinema Test Matched");
            assert.equal(matched.position, 4);
            assert.equal(matched.watchlisted, true);
            assert.ok(matched.poster);
            assert.equal(
              (await request("GET", matched.poster)).statusCode,
              200,
            );
          } finally {
            globalThis.fetch = originalFetch;
            config.TMDB_TOKEN = originalToken;
          }
        },
      );
      await t.test(
        "HLS conversion serves authorized playlists and segments and cleans up",
        async () => {
          const result = await request(
            "POST",
            "/api/movies/" + movieId + "/play",
            { quality: "720p" },
          );
          assert.equal(result.statusCode, 200, result.body);
          const { id, url } = result.json();
          const playlist = await request("GET", url);
          assert.equal(playlist.statusCode, 200, playlist.body);
          assert.ok(playlist.body.includes("#EXTM3U"));
          const name = playlist.body
            .split("\n")
            .find((line: string) => line.startsWith("segment"));
          assert.ok(name);
          const segment = await request(
            "GET",
            "/api/playback/" + id + "/hls/" + name,
          );
          assert.equal(segment.statusCode, 200);
          assert.ok(segment.rawPayload.length > 100);
          assert.equal((await app.inject({ url })).statusCode, 401);
          await request("DELETE", "/api/playback/" + id);
          await assert.rejects(() => stat(join(data, "transcodes", id)));
        },
      );
      await t.test(
        "failed FFmpeg startup reports an error and releases the slot",
        async () => {
          const old = config.FFMPEG_PATH;
          config.FFMPEG_PATH = join(work, "does-not-exist");
          try {
            const response = await request(
              "POST",
              "/api/movies/" + movieId + "/play",
              { quality: "720p" },
            );
            assert.equal(response.statusCode, 422, response.body);
          } finally {
            config.FFMPEG_PATH = old;
          }
          const result = await request(
            "POST",
            "/api/movies/" + movieId + "/play",
            { quality: "720p" },
          );
          assert.equal(result.statusCode, 200, result.body);
          await request("DELETE", "/api/playback/" + result.json().id);
        },
      );
      await t.test("settings validate limits and survive restart", async () => {
        assert.equal(
          (
            await request("PUT", "/api/settings", {
              serverName: "Test cinema",
              defaultQuality: "auto",
              maxTranscodes: 99,
              transcodeCacheGb: 8,
            })
          ).statusCode,
          400,
        );
        assert.equal(
          (
            await request("PUT", "/api/settings", {
              serverName: "Test cinema",
              defaultQuality: "auto",
              maxTranscodes: 1,
              transcodeCacheGb: 8,
            })
          ).statusCode,
          200,
        );
        assert.equal(
          (await request("GET", "/api/preferences")).json().serverName,
          "Test cinema",
        );
      });
      await t.test(
        "database filters and pagination preserve counts",
        async () => {
          assert.equal(
            (
              await request("GET", "/api/movies?q=Cinema&year=2026&limit=1")
            ).json().total,
            1,
          );
          const response = (
            await request("GET", "/api/movies?offset=1&limit=1")
          ).json();
          assert.equal(response.total, 1);
          assert.equal(response.items.length, 0);
          assert.equal(
            (await request("GET", "/api/movies?q=unknown")).json().total,
            0,
          );
        },
      );
      await t.test("external SRT converts to WebVTT", async () => {
        await writeFile(
          join(media, "Cinema Test (2026).en.srt"),
          "1\n00:00:01,000 --> 00:00:03,000\nWelcome home.\n",
        );
        const choices = (
          await request("GET", "/api/movies/" + movieId + "/subtitles")
        ).json();
        assert.equal(choices.length, 1);
        const response = await request(
          "GET",
          "/api/movies/" + movieId + "/subtitles/" + choices[0].key,
        );
        assert.equal(response.statusCode, 200, response.body);
        assert.ok(response.body.includes("WEBVTT"));
        assert.ok(response.body.includes("Welcome home."));
      });
      await t.test(
        "MKV remux and embedded subtitles use actual streams",
        async () => {
          const mkv = join(media, "Remux Sample (2026).mkv");
          await run(config.FFMPEG_PATH, [
            "-v",
            "error",
            "-i",
            clip,
            "-i",
            join(media, "Cinema Test (2026).en.srt"),
            "-map",
            "0",
            "-map",
            "1",
            "-c",
            "copy",
            mkv,
          ]);
          await scan();
          const items = (await request("GET", "/api/movies")).json().items;
          const other = items.find((m: any) => m.title === "Remux Sample");
          assert.ok(other);
          const result = await request(
            "POST",
            "/api/movies/" + other.id + "/play",
            { quality: "auto" },
          );
          assert.equal(result.statusCode, 200, result.body);
          assert.equal(result.json().mode, "remux");
          assert.equal(
            (await request("GET", result.json().url)).statusCode,
            200,
          );
          await request("DELETE", "/api/playback/" + result.json().id);
          const subs = (
            await request("GET", "/api/movies/" + other.id + "/subtitles")
          ).json();
          assert.ok(subs.some((s: any) => s.kind === "embedded"));
          const sub = await request(
            "GET",
            "/api/movies/" +
              other.id +
              "/subtitles/" +
              subs.find((s: any) => s.kind === "embedded").key,
          );
          assert.ok(sub.body.includes("Welcome home."));
          assert.equal(
            (
              await request("POST", "/api/movies/" + movieId + "/play", {
                quality: "original",
                audio: 99,
              })
            ).statusCode,
            400,
          );
        },
      );
      await t.test(
        "renames preserve corrections and viewing history",
        async () => {
          await request("PATCH", "/api/movies/" + movieId, {
            title: "My corrected film",
            year: 2026,
          });
          await rm(join(media, "Cinema Test Copy.mp4"));
          await rename(clip, join(media, "Renamed film.mp4"));
          await scan();
          const movie = (await request("GET", "/api/movies/" + movieId)).json();
          assert.equal(movie.title, "My corrected film");
          assert.equal(movie.position, 4);
          assert.ok(movie.available);
        },
      );
      await t.test(
        "household profiles isolate history and protect adult access",
        async () => {
          const created = await request("POST", "/api/profiles", {
            name: "Second adult",
            avatar: "blue",
          });
          assert.equal(created.statusCode, 200, created.body);
          const profileId = created.json().id;
          assert.equal(
            (
              await request(
                "POST",
                "/api/profiles/" + profileId + "/select",
                {},
              )
            ).statusCode,
            403,
          );
          assert.equal(
            (
              await request("POST", "/api/profiles/" + profileId + "/select", {
                password,
              })
            ).statusCode,
            200,
          );
          const movie = (await request("GET", "/api/movies/" + movieId)).json();
          assert.equal(movie.position, 0);
          assert.equal(movie.watchlisted, false);
          assert.equal(
            (await request("GET", "/api/playback/" + playbackId + "/file"))
              .statusCode,
            404,
          );
        },
      );
      await t.test(
        "child profile hides unrated movies and denies administration",
        async () => {
          const created = await request("POST", "/api/profiles", {
            name: "Kids",
            child: true,
          });
          await request(
            "POST",
            "/api/profiles/" + created.json().id + "/select",
            {},
          );
          assert.equal((await request("GET", "/api/movies")).json().total, 0);
          assert.equal((await request("GET", "/api/system")).statusCode, 403);
          assert.equal(
            (await request("GET", "/api/filesystem/folders")).statusCode,
            403,
          );
          const me = (await request("GET", "/api/me")).json();
          await request(
            "POST",
            "/api/profiles/" +
              me.profiles.find((p: any) => p.name === "My cinema").id +
              "/select",
            { password },
          );
        },
      );
      await t.test(
        "profile edits, PIN checks and archival are functional",
        async () => {
          const result = await request("POST", "/api/profiles", {
            name: "Temporary",
            pin: "246810",
          });
          const id = result.json().id;
          assert.equal(
            (
              await request("PATCH", "/api/profiles/" + id, {
                name: "Updated profile",
                avatar: "rose",
              })
            ).statusCode,
            200,
          );
          assert.equal(
            (
              await request("POST", "/api/profiles/" + id + "/select", {
                pin: "000000",
              })
            ).statusCode,
            403,
          );
          assert.equal(
            (
              await request("POST", "/api/profiles/" + id + "/select", {
                pin: "246810",
              })
            ).statusCode,
            200,
          );
          const session = (await request("GET", "/api/me")).json();
          await request(
            "POST",
            "/api/profiles/" +
              session.profiles.find((p: any) => p.name === "My cinema").id +
              "/select",
            { password },
          );
          assert.equal(
            (await request("DELETE", "/api/profiles/" + id)).statusCode,
            200,
          );
          assert.ok(
            !(await request("GET", "/api/me"))
              .json()
              .profiles.some((p: any) => p.id === id),
          );
          assert.equal(
            (
              await request("POST", "/api/profiles/" + id + "/select", {
                pin: "246810",
              })
            ).statusCode,
            404,
          );
        },
      );
      await t.test("password change revokes every device session", async () => {
        const other = await request("POST", "/api/login", {
          username: "tester",
          password,
        });
        const otherCookie = String(other.headers["set-cookie"]).split(";")[0];
        const changed = randomBytes(24).toString("hex");
        assert.equal(
          (
            await request("POST", "/api/account/password", {
              currentPassword: "wrong password",
              newPassword: changed,
            })
          ).statusCode,
          403,
        );
        assert.equal(
          (
            await request("POST", "/api/account/password", {
              currentPassword: password,
              newPassword: changed,
            })
          ).statusCode,
          200,
        );
        assert.equal((await request("GET", "/api/me")).statusCode, 401);
        assert.equal(
          (
            await app.inject({
              url: "/api/me",
              headers: { cookie: otherCookie },
            })
          ).statusCode,
          401,
        );
        assert.equal(
          (
            await request("POST", "/api/login", {
              username: "tester",
              password,
            })
          ).statusCode,
          401,
        );
        password = changed;
        const login = await request("POST", "/api/login", {
          username: "tester",
          password,
        });
        assert.equal(login.statusCode, 200, login.body);
        cookie = String(login.headers["set-cookie"]).split(";")[0];
        const session = (await request("GET", "/api/me")).json();
        await request(
          "POST",
          "/api/profiles/" +
            session.profiles.find((p: any) => p.name === "My cinema").id +
            "/select",
          { password },
        );
      });
      await t.test(
        "missing files become unavailable and playback fails clearly",
        async () => {
          await rm(join(media, "Renamed film.mp4"));
          await scan();
          assert.equal(
            (await request("GET", "/api/movies/" + movieId)).json().available,
            false,
          );
          assert.equal(
            (
              await request("POST", "/api/movies/" + movieId + "/play", {
                quality: "original",
              })
            ).statusCode,
            404,
          );
        },
      );
      await t.test(
        "disconnect and reconnect retain metadata and library identity",
        async () => {
          assert.equal(
            (await request("DELETE", "/api/libraries/" + libraryId)).statusCode,
            200,
          );
          assert.equal(
            (await request("GET", "/api/libraries")).json().length,
            0,
          );
          const response = await request("POST", "/api/libraries", {
            name: "Reconnected",
            path: media,
            autoScan: false,
          });
          assert.equal(response.statusCode, 200, response.body);
          assert.equal(response.json().id, libraryId);
          await scan();
        },
      );
      await t.test(
        "restart applies migrations once and retains progress",
        async () => {
          await app.close();
          closed = true;
          const restarted = await buildApp({ logger: false, watch: false });
          try {
            const response = await restarted.inject({
              url: "/api/movies/" + movieId,
              headers: { cookie },
            });
            assert.equal(response.statusCode, 200, response.body);
            assert.equal(response.json().position, 4);
            assert.equal(response.json().title, "My corrected film");
            assert.equal(
              (
                await restarted.inject({
                  url: "/api/settings",
                  headers: { cookie },
                })
              ).json().serverName,
              "Test cinema",
            );
          } finally {
            await restarted.close();
          }
        },
      );
    } finally {
      if (!closed) await app.close();
      globalThis.gc?.();
      await rm(work, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 200,
      });
    }
  },
);

test("metadata confidence rejects ambiguous titles and wrong years", async () => {
  const { confidence } = await import("../apps/server/src/metadata.ts");
  assert.equal(
    confidence("Interstellar", 2014, {
      title: "Interstellar",
      release_date: "2014-11-07",
    }),
    1,
  );
  assert.ok(
    confidence("Interstellar", 2014, {
      title: "Another film",
      release_date: "2014-11-07",
    }) < 0.95,
  );
  assert.ok(
    confidence("The Thing", 1982, {
      title: "The Thing",
      release_date: "2011-10-12",
    }) < 0.95,
  );
});
test(
  "backup and restore verify a real SQLite snapshot and preserve old data",
  { timeout: 30000 },
  async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const exec = promisify(execFile);
    const work = await mkdtemp(resolve("work/backup-test-"));
    const source = join(work, "source"),
      backup = join(work, "backup"),
      target = join(work, "restored");
    await mkdir(join(source, "database"), { recursive: true });
    await mkdir(join(source, "artwork"));
    await writeFile(join(source, "artwork", "poster-test.jpg"), "fixture");
    const db = new DatabaseSync(join(source, "database/cinema.db"));
    db.exec(
      "CREATE TABLE state(value TEXT); INSERT INTO state VALUES('preserved');",
    );
    db.close();
    const env = { ...process.env, DATA_DIR: source, PORT: "1" };
    try {
      await exec(process.execPath, ["scripts/backup.mjs", backup], { env });
      await mkdir(target);
      await writeFile(join(target, "old-state.txt"), "keep me");
      await exec(
        process.execPath,
        ["scripts/restore.mjs", backup, "--confirm"],
        { env: { ...env, DATA_DIR: target } },
      );
      const restored = new DatabaseSync(join(target, "database/cinema.db"), {
        readOnly: true,
      });
      try {
        assert.equal(
          restored.prepare("SELECT value FROM state").get()!.value,
          "preserved",
        );
      } finally {
        restored.close();
      }
      assert.equal(
        await readFile(join(target, "artwork/poster-test.jpg"), "utf8"),
        "fixture",
      );
      const { readdir } = await import("node:fs/promises");
      const saved = (await readdir(work)).find((n) =>
        n.startsWith("restored.before-restore-"),
      );
      assert.ok(saved);
      assert.equal(
        await readFile(join(work, saved, "old-state.txt"), "utf8"),
        "keep me",
      );
    } finally {
      await rm(work, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    }
  },
);

test(
  "metadata integration caches artwork and commits normalized provider records",
  { timeout: 30000 },
  async () => {
    const work = await mkdtemp(join(tmpdir(), "cinema-metadata-"));
    const { config } = await import("../apps/server/src/config.ts");
    const oldDir = config.DATA_DIR,
      oldToken = config.TMDB_TOKEN,
      oldFetch = globalThis.fetch;
    const { openDatabase, movies, genres, people, metadataMatches } =
      await import("../packages/database/src/index.ts");
    const { applyMetadata, searchMetadata } =
      await import("../apps/server/src/metadata.ts");
    const id = "metadata-test";
    const { db, client } = await openDatabase(work);
    config.DATA_DIR = work;
    config.TMDB_TOKEN = "test-only-placeholder";
    globalThis.fetch = async (input: any) => {
      const url = String(input);
      if (url.includes("/search/movie"))
        return Response.json({
          results: [
            {
              id: 12345678,
              title: "Metadata Fixture",
              release_date: "2026-01-01",
            },
          ],
        });
      if (url.endsWith("/configuration"))
        return Response.json({
          images: {
            secure_base_url: "https://image.tmdb.org/t/p/",
            poster_sizes: ["w500"],
            backdrop_sizes: ["w1280"],
          },
        });
      if (url.startsWith("https://image.tmdb.org/"))
        return new Response(
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4n8AAAAASUVORK5CYII=",
            "base64",
          ),
          { headers: { "content-type": "image/png" } },
        );
      if (url.includes("/movie/12345678"))
        return Response.json({
          id: 12345678,
          title: "Metadata Fixture",
          original_title: "Original Fixture",
          release_date: "2026-01-01",
          original_language: "en",
          overview: "A local test fixture.",
          vote_average: 8,
          genres: [{ id: 1, name: "Drama" }],
          poster_path: "/unit.png",
          backdrop_path: "/backdrop.png",
          production_countries: [{ name: "Test country" }],
          credits: {
            cast: [{ id: 1, name: "Test actor", character: "Lead" }],
            crew: [{ id: 2, name: "Test director", job: "Director" }],
          },
          release_dates: {
            results: [
              { iso_3166_1: "US", release_dates: [{ certification: "PG" }] },
            ],
          },
          videos: {
            results: [
              {
                site: "YouTube",
                key: "abcdefghijk",
                type: "Trailer",
                name: "Official trailer",
              },
            ],
          },
        });
      throw new Error("Unexpected provider URL");
    };
    try {
      await db
        .insert(movies)
        .values({ id, title: "Unmatched", addedAt: Date.now() });
      const results = await searchMetadata("Metadata Fixture", 2026);
      assert.equal(results[0].confidence, 1);
      await applyMetadata(db, id, 12345678, true);
      const movie = await db.query.movies.findFirst();
      assert.equal(movie?.title, "Metadata Fixture");
      assert.equal(movie?.certification, "PG");
      assert.equal(movie?.manual, true);
      assert.equal(movie?.trailers.length, 1);
      assert.equal((await db.select().from(genres)).length, 1);
      assert.equal((await db.select().from(people)).length, 2);
      assert.equal((await db.select().from(metadataMatches)).length, 1);
      assert.ok((await stat(join(work, "artwork/poster-unit.png"))).size > 0);
    } finally {
      globalThis.fetch = oldFetch;
      config.DATA_DIR = oldDir;
      config.TMDB_TOKEN = oldToken;
      client.close();
      globalThis.gc?.();
      await rm(work, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 200,
      });
    }
  },
);

test(
  "local transactions roll back, serialize concurrent readers, and release file handles",
  { timeout: 10000 },
  async () => {
    const folder = await mkdtemp(join(tmpdir(), "cinema-transaction-"));
    const { openDatabase, settings, profiles } =
      await import("../packages/database/src/index.ts");
    const { db, client } = await openDatabase(folder);
    try {
      await assert.rejects(() =>
        db.transaction(async (tx) => {
          await tx
            .insert(settings)
            .values({ key: "rollback", value: "never committed" });
          throw new Error("abort");
        }),
      );
      assert.equal((await db.select().from(settings)).length, 0);
      const writing = db.transaction(async (tx) => {
        await tx.insert(settings).values({ key: "one", value: "1" });
        await new Promise((r) => setTimeout(r, 30));
        await tx.insert(settings).values({ key: "two", value: "2" });
      });
      const reading = db.select().from(settings);
      const [, rows] = await Promise.all([writing, reading]);
      assert.equal(rows.length, 2);
      await assert.rejects(() =>
        db.insert(profiles).values({
          id: "bad-profile",
          userId: "missing-user",
          name: "Invalid",
          avatar: "lime",
        }),
      );
    } finally {
      client.close();
      globalThis.gc?.();
      await rm(folder, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
  },
);

test("server folder browsing lists directories only and validates paths", async () => {
  const { listServerFolders } =
    await import("../apps/server/src/folder-browser.ts");
  const { symlink } = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "cinema-folder-picker-"));
  try {
    await mkdir(join(root, "Season 2"));
    await mkdir(join(root, "Season 10"));
    await mkdir(join(root, ".hidden"));
    await writeFile(
      join(root, "private-file.txt"),
      "This must not be listed as a selectable folder",
    );
    await symlink(
      join(root, "Season 2"),
      join(root, "linked-folder"),
      "junction",
    ).catch(() => {});
    const listing = await listServerFolders(root);
    assert.deepEqual(
      listing.folders.map((f) => f.name),
      ["Season 2", "Season 10"],
    );
    assert.equal(
      listing.path,
      await (await import("node:fs/promises")).realpath(root),
    );
    assert.ok(listing.parent);
    const selected = await listServerFolders(join(root, "Season 2"));
    assert.equal(selected.folders.length, 0);
    await assert.rejects(() => listServerFolders("relative/path"));
    await assert.rejects(() =>
      listServerFolders(join(root, "private-file.txt")),
    );
    await assert.rejects(() => listServerFolders(join(root, "missing")));
    const locations = await listServerFolders();
    assert.ok(locations.folders.length > 0);
    assert.equal(locations.path, null);
  } finally {
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});
