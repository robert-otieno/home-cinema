import { opendir, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, parse } from "node:path";
import { homedir, platform } from "node:os";
import { HttpError } from "./context.ts";
export async function listServerFolders(input?: string) {
  if (!input) {
    const candidates =
      platform() === "win32"
        ? Array.from(
            { length: 26 },
            (_, i) => String.fromCharCode(65 + i) + ":\\",
          )
        : ["/", "/mnt", "/media", "/Volumes"];
    candidates.push(homedir());
    const roots = (
      await Promise.all(
        candidates.map(async (path) => {
          try {
            return (await stat(path)).isDirectory()
              ? { name: path === homedir() ? "Home folder" : path, path }
              : null;
          } catch {
            return null;
          }
        }),
      )
    ).filter((r): r is { name: string; path: string } => !!r);
    return {
      path: null,
      parent: null,
      folders: roots.filter(
        (r, i) => roots.findIndex((other) => other.path === r.path) === i,
      ),
      truncated: false,
    };
  }
  if (!isAbsolute(input) || input.includes("\0"))
    throw new HttpError(
      400,
      "Enter an absolute folder path on the media server.",
    );
  let path: string;
  try {
    path = await realpath(input);
    if (!(await stat(path)).isDirectory()) throw new Error();
  } catch {
    throw new HttpError(
      400,
      "This folder is unavailable or the media server does not have permission to open it.",
    );
  }
  const folders: { name: string; path: string }[] = [];
  let truncated = false,
    seen = 0;
  try {
    const directory = await opendir(path);
    for await (const entry of directory) {
      if (++seen > 10000 || folders.length >= 1000) {
        truncated = true;
        break;
      }
      if (
        !entry.isDirectory() ||
        entry.isSymbolicLink() ||
        entry.name.startsWith(".") ||
        entry.name.startsWith("$")
      )
        continue;
      folders.push({
        name: entry.name,
        path:
          path.replace(/[\\/]$/, "") +
          (platform() === "win32" ? "\\" : "/") +
          entry.name,
      });
    }
  } catch {
    throw new HttpError(
      403,
      "The media server does not have permission to list this folder.",
    );
  }
  folders.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
  const clean = (p: string) => p.replace(/[\\/]+$/, "").toLowerCase();
  return {
    path,
    parent: clean(path) === clean(parse(path).root) ? null : dirname(path),
    folders,
    truncated,
  };
}
