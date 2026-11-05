import { DatabaseSync } from "node:sqlite";
import { resolve, join, relative, isAbsolute } from "node:path";
import { readFile, stat, cp, rename } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { createConnection } from "node:net";
try {
  loadEnvFile(".env");
} catch {}
const input = process.argv[2];
if (!input || process.argv[3] !== "--confirm")
  throw new Error(
    "Stop the server, then run: node scripts/restore.mjs <backup-directory> --confirm",
  );
const source = resolve(input),
  target = resolve(process.env.DATA_DIR || "./data");
const root = resolve("."),
  rel = relative(root, target);
if (
  !rel ||
  isAbsolute(rel) ||
  rel === ".." ||
  rel.startsWith("..\\") ||
  rel.startsWith("../")
)
  throw new Error(
    "Restore requires DATA_DIR to be a dedicated directory inside the project. Restore external data manually.",
  );
const relation = relative(target, source),
  reverse = relative(source, target);
if (
  !relation ||
  (!isAbsolute(relation) && !relation.startsWith("..")) ||
  (!isAbsolute(reverse) && !reverse.startsWith(".."))
)
  throw new Error("Backup and data directories must be separate");
const listening = await new Promise((resolve) => {
  const socket = createConnection({
    host: "127.0.0.1",
    port: Number(process.env.PORT || 8094),
  });
  socket.once("connect", () => {
    socket.destroy();
    resolve(true);
  });
  socket.once("error", () => resolve(false));
  socket.setTimeout(1000, () => {
    socket.destroy();
    resolve(false);
  });
});
if (listening)
  throw new Error(
    "The server port is active. Stop the server before restoring.",
  );
const manifest = JSON.parse(
  await readFile(join(source, "backup.json"), "utf8"),
);
if (manifest.format !== "home-cinema" || manifest.version !== 1)
  throw new Error("Unsupported backup format");
const db = new DatabaseSync(join(source, "database/cinema.db"), {
  readOnly: true,
});
try {
  const check = db.prepare("PRAGMA integrity_check").get();
  if (Object.values(check)[0] !== "ok")
    throw new Error("Backup database integrity check failed");
} finally {
  db.close();
}
try {
  await stat(target);
  const preserved = target + ".before-restore-" + Date.now();
  await rename(target, preserved);
  console.log("Previous data preserved at " + preserved);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
await cp(source, target, { recursive: true, errorOnExist: true, force: false });
console.log(
  "Restore complete. Start the server, reconnect media drives, then scan.",
);
