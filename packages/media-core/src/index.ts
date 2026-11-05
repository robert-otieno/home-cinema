import { spawn } from "node:child_process";
import { realpath, stat, open } from "node:fs/promises";
import { relative, isAbsolute, extname, basename } from "node:path";
import { createHash } from "node:crypto";
export function parseFilename(path: string) {
  const name = basename(path, extname(path)).replace(/[._]/g, " ");
  const match = name.match(/\b((?:19|20)\d{2})\b/);
  const title = (
    match
      ? name.slice(0, match.index)
      : name.replace(
          /\b(2160p|1080p|720p|480p|bluray|web[- ]?dl|webrip|x26[45]|h26[45]|dvdrip)\b.*$/i,
          "",
        )
  )
    .replace(/[()[\]]/g, "")
    .trim();
  return { title: title || name, year: match ? Number(match[1]) : null };
}
export function within(root: string, path: string) {
  const rel = relative(root, path);
  return (
    rel === "" ||
    (!isAbsolute(rel) &&
      rel !== ".." &&
      !rel.startsWith("..\\") &&
      !rel.startsWith("../"))
  );
}
export async function safePath(root: string, path: string) {
  const [r, p] = await Promise.all([realpath(root), realpath(path)]);
  if (!within(r, p))
    throw new Error("Path is outside the configured media root");
  return p;
}
export function byteRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size === 0)
    throw new Error("Invalid range");
  let start: number, end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0)
      throw new Error("Invalid range");
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  )
    throw new Error("Invalid range");
  return { start, end: Math.min(end, size - 1) };
}
export async function fingerprint(path: string) {
  const info = await stat(path),
    file = await open(path, "r");
  const hash = createHash("sha256");
  hash.update(String(info.size));
  try {
    for (const offset of new Set([
      0,
      Math.max(0, Math.floor(info.size / 2) - 32768),
      Math.max(0, info.size - 65536),
    ])) {
      const buffer = Buffer.alloc(Math.min(65536, info.size));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, offset);
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await file.close();
  }
  return hash.digest("hex");
}
export async function run(
  binary: string,
  args: string[],
  timeout = 30000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(binary, args, { shell: false, windowsHide: true });
    let out = "",
      err = "",
      settled = false;
    const fail = (e: Error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(e);
      }
    };
    const timer = setTimeout(() => {
      p.kill();
      fail(new Error("Media process timed out"));
    }, timeout);
    p.on("error", fail);
    p.stdout.on("data", (d) => {
      out += d;
      if (out.length > 8000000) {
        p.kill();
        fail(new Error("Media process output too large"));
      }
    });
    p.stderr.on("data", (d) => {
      err = (err + d).slice(-4000);
    });
    p.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      code === 0
        ? resolve(out)
        : reject(new Error("Media process failed: " + err));
    });
  });
}
export async function probe(path: string, binary = "ffprobe") {
  const data = JSON.parse(
    await run(binary, [
      "-v",
      "error",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      path,
    ]),
  );
  const video = data.streams.find(
      (s: any) => s.codec_type === "video" && !s.disposition?.attached_pic,
    ),
    audio = data.streams.filter((s: any) => s.codec_type === "audio");
  if (!video) throw new Error("No video stream found");
  const track = (s: any) => ({
    index: s.index,
    codec: s.codec_name || "unknown",
    language: s.tags?.language || "und",
    title: s.tags?.title || s.tags?.language || s.codec_name,
  });
  return {
    duration: Number(data.format.duration) || 0,
    width: video.width || 0,
    height: video.height || 0,
    videoCodec: video.codec_name || null,
    audioCodec: audio[0]?.codec_name || null,
    container: extname(path).slice(1).toLowerCase(),
    audioTracks: audio.map(track),
    subtitles: data.streams
      .filter((s: any) => s.codec_type === "subtitle")
      .map(track),
  };
}
export const mediaExtensions = new Set([
  ".mp4",
  ".mkv",
  ".mov",
  ".avi",
  ".m4v",
  ".webm",
]);
export function mime(container: string) {
  return (
    (
      {
        mp4: "video/mp4",
        m4v: "video/mp4",
        webm: "video/webm",
        mov: "video/quicktime",
        mkv: "video/x-matroska",
        avi: "video/x-msvideo",
      } as Record<string, string>
    )[container] || "application/octet-stream"
  );
}
export type EpisodeName = {
  showTitle: string;
  year: number | null;
  season: number;
  episode: number;
  episodeEnd: number;
  title: string;
};
export function parseEpisodeFilename(input: string): EpisodeName | null {
  const parts = input.replace(/\\/g, "/").split("/").filter(Boolean);
  const filename = parts.at(-1) || "";
  const stem = filename.replace(/\.[^.]+$/, "").replace(/[._]/g, " ");
  const parent = parts.at(-2) || "",
    grandparent = parts.at(-3) || "";
  const seasonFolder = /^(?:season|series|s)[ ._-]*(\d{1,3})$/i.exec(parent);
  const specials = /^specials$/i.test(parent);
  const token =
    /\bS(\d{1,3})[ ._-]*E(\d{1,4})(?:(?:[ ._-]*E|[ ._]*-[ ._-]*E?)(\d{1,4}))?\b/i.exec(
      stem,
    ) || /\b(\d{1,3})x(\d{1,4})(?:[ ._-]*x(\d{1,4}))?\b/i.exec(stem);
  let season: number,
    episode: number,
    end: number,
    prefix = "",
    tail = "";
  if (token) {
    season = Number(token[1]);
    episode = Number(token[2]);
    end = Number(token[3] || token[2]);
    prefix = stem.slice(0, token.index).trim();
    tail = stem.slice(token.index + token[0].length);
  } else if (seasonFolder || specials) {
    const numbered =
      /^(?:E(?:pisode)?[ ._-]*)?(\d{1,3})(?:[ ._-]+|$)(.*)$/i.exec(stem);
    if (!numbered) return null;
    season = specials ? 0 : Number(seasonFolder![1]);
    episode = Number(numbered[1]);
    end = episode;
    tail = numbered[2];
  } else return null;
  if (
    season > 999 ||
    episode < 1 ||
    episode > 9999 ||
    end < episode ||
    end > episode + 30
  )
    return null;
  const folder = seasonFolder || specials ? grandparent : parent;
  let show =
    (seasonFolder || specials) &&
    folder &&
    !/^(?:tv|tv shows|shows|series|movies)$/i.test(folder)
      ? folder
      : prefix || folder;
  if (!show || /^(?:tv|tv shows|shows|series|movies|season \d+)$/i.test(show))
    return null;
  show = show.replace(/[._]/g, " ").replace(/^[\s-]+|[\s-]+$/g, "");
  const yearMatch = show.replace(/[()[\]\s]/g, "").match(/^\d{4}$/)
    ? null
    : /\b((?:19|20)\d{2})\b/.exec(show);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  if (yearMatch) show = show.slice(0, yearMatch.index);
  show = show.replace(/[()[\]]/g, "").trim();
  if (!show) return null;
  const title = tail
    .replace(/^[\s-]+/, "")
    .replace(
      /\b(?:2160p|1080p|720p|480p|WEB[- ]?DL|WEBRIP|BLURAY|HEVC|H[ .]?26[45]|X26[45])\b.*$/i,
      "",
    )
    .replace(/[\s-]+$/, "")
    .trim();
  return {
    showTitle: show,
    year,
    season,
    episode,
    episodeEnd: end,
    title: title || "Episode " + episode + (end !== episode ? "–" + end : ""),
  };
}
