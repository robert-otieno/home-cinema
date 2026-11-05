import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, rm, readFile, stat, statfs, readdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import {
  mediaFiles,
  libraries,
  playbackSessions,
  transcodeJobs,
} from "@cinema/database";
import { safePath } from "@cinema/media-core";
import { config } from "./config.ts";
import { HttpError, type Database } from "./context.ts";
import { chooseEncoder, failedEncoders } from "./hardware.ts";
type ProcessItem = {
  process: ChildProcess | null;
  profileId: string;
  directory: string;
  lastSeen: number;
  error: string | null;
};
export function createStreaming(db: Database) {
  const processes = new Map<string, ProcessItem>(),
    owned = new Set<string>();
  let creation = Promise.resolve(),
    closing = false;
  async function source(movieId: string) {
    const files = await db
      .select()
      .from(mediaFiles)
      .where(
        and(eq(mediaFiles.movieId, movieId), eq(mediaFiles.available, true)),
      );
    for (const file of files) {
      const root = await db.query.libraries.findFirst({
        where: eq(libraries.id, file.libraryId),
      });
      if (!root || root.archived) continue;
      try {
        const path = await safePath(root.path, file.path);
        await stat(path);
        return { ...file, path };
      } catch {
        await db
          .update(mediaFiles)
          .set({ available: false })
          .where(eq(mediaFiles.id, file.id));
      }
    }
    throw new HttpError(
      404,
      "The source drive or movie file is unavailable. Reconnect the drive and scan again.",
    );
  }
  async function kill(child: ChildProcess | null) {
    if (child && child.exitCode === null)
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 3000);
        child.once("close", () => {
          clearTimeout(timeout);
          resolve();
        });
        child.kill();
      });
  }
  async function stop(id: string) {
    const item = processes.get(id),
      failed = !!item?.error;
    processes.delete(id);
    if (item) {
      await kill(item.process);
      await rm(item.directory, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      }).catch(() => {});
    }
    const status = failed ? "failed" : "ended";
    await db
      .update(transcodeJobs)
      .set({ status, error: item?.error || null, finishedAt: Date.now() })
      .where(eq(transcodeJobs.sessionId, id));
    await db
      .update(playbackSessions)
      .set({ status, error: item?.error || null, updatedAt: Date.now() })
      .where(eq(playbackSessions.id, id));
    owned.delete(id);
  }
  const sweep = setInterval(() => {
    if (closing) return;
    void (async () => {
      const sessions = await db.select().from(playbackSessions);
      for (const row of sessions)
        if (owned.has(row.id) && Date.now() - row.updatedAt > 90000)
          await stop(row.id);
      const disk = await statfs(config.DATA_DIR);
      let bytes = 0;
      for (const item of processes.values())
        for (const name of await readdir(item.directory).catch(() => []))
          try {
            bytes += (await stat(join(item.directory, name))).size;
          } catch {}
      if (
        disk.bavail * disk.bsize < 1024 ** 3 ||
        bytes > config.TRANSCODE_CACHE_GB * 1024 ** 3
      )
        for (const [id, item] of processes) {
          item.error = "Transcode disk limit reached";
          await stop(id);
        }
    })().catch(() => {});
  }, 30000);
  sweep.unref();
  return {
    source,
    stop,
    async start(
      movieId: string,
      profileId: string,
      quality: string,
      audio: number | undefined,
      device: string,
    ) {
      const previous = creation;
      let release!: () => void;
      creation = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        if (closing) throw new HttpError(503, "Server is shutting down");
        const file = await source(movieId);
        const direct =
          (quality === "original" && audio === undefined) ||
          (quality === "auto" &&
            ["mp4", "m4v", "webm"].includes(file.container) &&
            ["h264", "vp8", "vp9", "av1"].includes(file.videoCodec || "") &&
            (!file.audioCodec ||
              ["aac", "mp3", "opus", "vorbis"].includes(file.audioCodec)) &&
            audio === undefined);
        const mode = direct
          ? "direct"
          : ["auto", "original"].includes(quality) &&
              file.videoCodec === "h264" &&
              (!file.audioCodec || file.audioCodec === "aac")
            ? "remux"
            : "transcode";
        if (
          !direct &&
          [...processes.values()].filter(
            (p) => p.process && p.process.exitCode === null,
          ).length >= config.MAX_TRANSCODES
        )
          throw new HttpError(
            409,
            "The server is already converting a movie. Choose Original or try again after that playback ends.",
          );
        if (
          audio !== undefined &&
          !file.audioTracks.some((t: any) => t.index === audio)
        )
          throw new HttpError(400, "Unknown audio track");
        const id = randomUUID();
        await db.insert(playbackSessions).values({
          id,
          profileId,
          movieId,
          mode,
          quality,
          device: device.slice(0, 200),
          status: "starting",
          startedAt: Date.now(),
          updatedAt: Date.now(),
        });
        owned.add(id);
        if (direct) {
          await db
            .update(playbackSessions)
            .set({ status: "playing" })
            .where(eq(playbackSessions.id, id));
          return { id, mode, url: "/api/playback/" + id + "/file" };
        }
        const disk = await statfs(config.DATA_DIR);
        if (disk.bavail * disk.bsize < 2 * 1024 ** 3) {
          await stop(id);
          throw new HttpError(
            507,
            "At least 2 GB free is required for compatibility conversion.",
          );
        }
        const directory = join(config.DATA_DIR, "transcodes", id);
        await mkdir(directory, { recursive: true });
        let encoder = mode === "remux" ? "copy" : await chooseEncoder();
        const item: ProcessItem = {
          process: null,
          profileId,
          directory,
          lastSeen: Date.now(),
          error: null,
        };
        processes.set(id, item);
        await db.insert(transcodeJobs).values({
          sessionId: id,
          status: "running",
          encoder,
          quality,
          startedAt: Date.now(),
        });
        async function launch(selected: string) {
          const args = ["-hide_banner", "-loglevel", "warning", "-nostdin"];
          if (selected === "h264_vaapi")
            args.push("-vaapi_device", config.VAAPI_DEVICE);
          args.push(
            "-i",
            file.path,
            "-map",
            "0:v:0",
            "-map",
            audio !== undefined ? "0:" + audio : "0:a:0?",
            "-sn",
          );
          if (mode === "remux") args.push("-c:v", "copy", "-c:a", "copy");
          else {
            let scale =
              quality === "720p"
                ? "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2"
                : "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";
            if (selected === "h264_vaapi") scale += ",format=nv12,hwupload";
            else if (selected !== "libx264") scale += ",format=nv12";
            args.push("-vf", scale, "-c:v", selected, "-threads", "2");
            if (selected === "libx264")
              args.push(
                "-preset",
                "veryfast",
                "-pix_fmt",
                "yuv420p",
                "-crf",
                "23",
              );
            if (selected === "h264_qsv")
              args.push("-preset", "veryfast", "-global_quality", "23");
            if (selected === "h264_nvenc")
              args.push("-preset", "p4", "-cq", "23", "-b:v", "0");
            if (selected === "h264_amf")
              args.push("-quality", "speed", "-qp_i", "23", "-qp_p", "23");
            if (selected === "h264_vaapi") args.push("-qp", "23");
            args.push(
              "-force_key_frames",
              "expr:gte(t,n_forced*4)",
              "-c:a",
              "aac",
              "-b:a",
              "160k",
              "-ac",
              "2",
            );
          }
          args.push(
            "-f",
            "hls",
            "-hls_time",
            "4",
            "-hls_list_size",
            "0",
            "-hls_playlist_type",
            "event",
            "-hls_flags",
            "independent_segments",
            "-hls_segment_filename",
            join(directory, "segment%06d.ts"),
            join(directory, "index.m3u8"),
          );
          item.error = null;
          const child = spawn(config.FFMPEG_PATH, args, {
            shell: false,
            windowsHide: true,
            stdio: ["ignore", "ignore", "pipe"],
          });
          item.process = child;
          child.stderr!.resume();
          const failure = (message: string) => {
            if (item.process !== child || !processes.has(id)) return;
            item.error = message;
            if (selected !== "libx264" && selected !== "copy")
              failedEncoders.add(selected);
            void db
              .update(transcodeJobs)
              .set({ status: "failed", error: message, finishedAt: Date.now() })
              .where(eq(transcodeJobs.sessionId, id));
            void db
              .update(playbackSessions)
              .set({ status: "failed", error: message, updatedAt: Date.now() })
              .where(eq(playbackSessions.id, id));
          };
          child.on("error", () =>
            failure("FFmpeg could not start. Check its installation path."),
          );
          child.on("close", (code) => {
            if (item.process !== child || !processes.has(id)) return;
            if (code === 0)
              void db
                .update(transcodeJobs)
                .set({ status: "completed", finishedAt: Date.now() })
                .where(eq(transcodeJobs.sessionId, id));
            else
              failure(
                "FFmpeg conversion failed. Check source codecs and server diagnostics.",
              );
          });
        }
        await launch(encoder);
        let retried = false;
        for (let attempt = 0; attempt < 300; attempt++) {
          if (item.error) {
            if (mode === "transcode" && encoder !== "libx264" && !retried) {
              retried = true;
              await kill(item.process);
              item.process = null;
              await rm(directory, {
                recursive: true,
                force: true,
                maxRetries: 3,
                retryDelay: 100,
              });
              await mkdir(directory, { recursive: true });
              encoder = "libx264";
              await db
                .update(transcodeJobs)
                .set({
                  status: "running",
                  encoder,
                  error: null,
                  finishedAt: null,
                })
                .where(eq(transcodeJobs.sessionId, id));
              await db
                .update(playbackSessions)
                .set({ status: "starting", error: null })
                .where(eq(playbackSessions.id, id));
              await launch(encoder);
              continue;
            }
            const message = item.error;
            await stop(id);
            throw new HttpError(422, message);
          }
          try {
            const playlist = await readFile(
              join(directory, "index.m3u8"),
              "utf8",
            );
            if (playlist.includes("#EXTINF")) {
              await db
                .update(playbackSessions)
                .set({ status: "playing", error: null })
                .where(eq(playbackSessions.id, id));
              return {
                id,
                mode,
                encoder,
                url: "/api/playback/" + id + "/hls/index.m3u8",
              };
            }
          } catch {}
          await new Promise((r) => setTimeout(r, 100));
        }
        item.error = "Conversion did not become ready within 30 seconds";
        await stop(id);
        throw new HttpError(
          504,
          "Conversion did not become ready within 30 seconds. Try Original.",
        );
      } finally {
        release();
      }
    },
    touch(id: string) {
      const item = processes.get(id);
      if (item) item.lastSeen = Date.now();
    },
    item: (id: string) => processes.get(id),
    async close() {
      closing = true;
      clearInterval(sweep);
      await creation;
      for (const id of [...owned]) await stop(id);
    },
  };
}
