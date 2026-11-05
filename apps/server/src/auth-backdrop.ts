import {
  mkdir,
  readdir,
  readFile,
  writeFile,
  rename,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import { randomInt } from "node:crypto";
import { config } from "./config.ts";
import { tmdb } from "./metadata.ts";

// Only this small, provider-selected cache is public before sign-in.
// It is separate from private library artwork and contains no media paths.
export function createAuthBackdrop() {
  const directory = join(config.DATA_DIR, "cache", "auth-backdrops");
  let refreshing: Promise<void> | null = null,
    lastAttempt = 0;
  async function cached() {
    try {
      return (await readdir(directory)).filter((n) =>
        /^\d+-[a-zA-Z0-9_-]+\.jpg$/.test(n),
      );
    } catch {
      return [];
    }
  }
  async function refresh() {
    if (refreshing) return refreshing;
    if (Date.now() - lastAttempt < 3600000) return;
    lastAttempt = Date.now();
    refreshing = (async () => {
      if (!config.TMDB_TOKEN) return;
      await mkdir(directory, { recursive: true });
      const [list, images] = await Promise.all([
        tmdb("/movie/popular?language=en-US&page=" + randomInt(1, 6)),
        tmdb("/configuration"),
      ]);
      const candidates = (list.results || []).filter(
        (m: any) =>
          !m.adult && /^\/[a-zA-Z0-9_-]+\.jpg$/.test(m.backdrop_path || ""),
      );
      const sizes = images.images.backdrop_sizes;
      const size = sizes.includes("w1280")
        ? "w1280"
        : sizes.includes("w780")
          ? "w780"
          : null;
      if (!size) return;
      const shuffled = candidates.sort(() => Math.random() - 0.5).slice(0, 4);
      for (const movie of shuffled) {
        const url = new URL(
          images.images.secure_base_url + size + movie.backdrop_path,
        );
        if (url.protocol !== "https:" || url.hostname !== "image.tmdb.org")
          continue;
        const response = await fetch(url, {
          signal: AbortSignal.timeout(15000),
        });
        if (
          !response.ok ||
          !response.headers.get("content-type")?.startsWith("image/jpeg")
        )
          continue;
        const reader = response.body!.getReader(),
          chunks: Uint8Array[] = [];
        let bytes = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.length;
            if (bytes > 4000000)
              throw new Error("Backdrop exceeds cache size limit");
            chunks.push(value);
          }
        } finally {
          await reader.cancel();
        }
        const filename = movie.id + "-" + movie.backdrop_path.slice(1);
        await writeFile(
          join(directory, filename + ".tmp"),
          Buffer.concat(chunks),
        );
        await rename(
          join(directory, filename + ".tmp"),
          join(directory, filename),
        );
      }
      // Keep a bounded pool; the currently opened stream remains valid on Unix,
      // and Windows removal failures are harmless until the next refresh.
      const { unlink } = await import("node:fs/promises");
      const files = await cached();
      const ordered = await Promise.all(
        files.map(async (name) => ({
          name,
          time: (await stat(join(directory, name))).mtimeMs,
        })),
      );
      for (const item of ordered
        .sort((a, b) => b.time - a.time)
        .slice(0)
        .slice(8))
        await unlink(join(directory, item.name)).catch(() => {});
      await writeFile(
        join(directory, "refreshed.json"),
        JSON.stringify({ at: Date.now() }),
      );
    })()
      .catch(() => {})
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }
  return {
    async select() {
      let files = await cached();
      let stale = true;
      try {
        stale =
          Date.now() -
            JSON.parse(
              await readFile(join(directory, "refreshed.json"), "utf8"),
            ).at >
          86400000;
      } catch {}
      if (!files.length) {
        await refresh();
        files = await cached();
      } else if (stale) void refresh();
      return files.length
        ? join(directory, files[randomInt(files.length)])
        : null;
    },
  };
}
