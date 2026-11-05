import { DatabaseSync } from "node:sqlite";
import { resolve, join } from "node:path";
import { mkdir, cp, stat, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
try {
  loadEnvFile(".env");
} catch {}
const destination = process.argv[2];
if (!destination)
  throw new Error("Usage: node scripts/backup.mjs <new-backup-directory>");
const data = resolve(process.env.DATA_DIR || "./data"),
  target = resolve(destination);
if (
  target === data ||
  target.startsWith(data + "/") ||
  target.startsWith(data + "\\")
)
  throw new Error("Backups must be outside DATA_DIR");
try {
  await stat(target);
  throw new Error("Choose a new, empty backup destination");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
await mkdir(join(target, "database"), { recursive: true });
const db = new DatabaseSync(join(data, "database/cinema.db"));
try {
  db.prepare("VACUUM INTO ?").run(join(target, "database/cinema.db"));
} finally {
  db.close();
}
for (const folder of ["artwork", "thumbnails"])
  try {
    await cp(join(data, folder), join(target, folder), {
      recursive: true,
      errorOnExist: true,
    });
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
await writeFile(
  join(target, "backup.json"),
  JSON.stringify(
    {
      format: "home-cinema",
      version: 1,
      createdAt: new Date().toISOString(),
      note: "Media files and .env are not included.",
    },
    null,
    2,
  ),
);
console.log("Backup created: " + target);
