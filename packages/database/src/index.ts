import { createClient, type Client, type Transaction } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import * as schema from "./schema.ts";
export * from "./schema.ts";

// One local connection with a whole-transaction gate. The libSQL 0.15 local
// transaction helper transfers connections to GC-owned objects; on Windows that
// can retain file handles after commit. Explicit BEGIN/COMMIT avoids that leak.
// Gating ordinary operations too prevents writes interleaving inside a scan.
function localClient(url: string): Client {
  const native = createClient({ url });
  let tail = Promise.resolve();
  async function acquire() {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    return release;
  }
  async function exclusive<T>(fn: () => Promise<T>) {
    const release = await acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
  async function transaction(mode: string = "write"): Promise<Transaction> {
    const release = await acquire();
    let ended = false;
    try {
      await native.execute(
        mode === "read" ? "BEGIN DEFERRED" : "BEGIN IMMEDIATE",
      );
    } catch (error) {
      release();
      throw error;
    }
    const check = () => {
      if (ended) throw new Error("Transaction is closed");
    };
    async function finish(sql: string) {
      check();
      try {
        await native.execute(sql);
      } catch (error) {
        if (sql === "COMMIT") await native.execute("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        ended = true;
        release();
      }
    }
    const tx: Transaction = {
      execute: async (stmt: any, args?: any) => {
        check();
        return native.execute(stmt, args);
      },
      batch: async (stmts: any[]) => {
        check();
        const results = [];
        for (const stmt of stmts) results.push(await native.execute(stmt));
        return results;
      },
      executeMultiple: async () => {
        throw new Error("Use individual statements inside a local transaction");
      },
      commit: () => finish("COMMIT"),
      rollback: () => finish("ROLLBACK"),
      close() {
        if (!ended) {
          ended = true;
          void native
            .execute("ROLLBACK")
            .finally(release)
            .catch(() => {});
        }
      },
      get closed() {
        return ended;
      },
    };
    return tx;
  }
  const gated = new Set([
    "execute",
    "batch",
    "migrate",
    "executeMultiple",
    "sync",
    "reconnect",
  ]);
  return new Proxy(native, {
    get(target, key) {
      if (key === "transaction") return transaction;
      const value = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      if (gated.has(String(key)))
        return (...args: any[]) => exclusive(() => value.apply(target, args));
      return value.bind(target);
    },
  });
}
export async function openDatabase(dataDir: string) {
  await mkdir(join(dataDir, "database"), { recursive: true });
  const client = localClient(
    pathToFileURL(resolve(dataDir, "database/cinema.db")).href,
  );
  await client.execute("PRAGMA foreign_keys=ON");
  await client.execute("PRAGMA journal_mode=WAL");
  await client.execute(
    "CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  const dir = resolve("packages/database/migrations");
  for (const name of (await readdir(dir))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    if (
      (
        await client.execute({
          sql: "SELECT name FROM migrations WHERE name=?",
          args: [name],
        })
      ).rows.length
    )
      continue;
    if (name === "0005_television.sql") {
      const backups = join(dataDir, "database", "backups");
      await mkdir(backups, { recursive: true });
      await client.execute({
        sql: "VACUUM INTO ?",
        args: [resolve(backups, "before-tv-" + Date.now() + ".db")],
      });
    }
    const source = await readFile(join(dir, name), "utf8");
    const statements = source
      .split("-- statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    await client.batch(
      [
        ...statements.map((sql) => ({ sql, args: [] })),
        {
          sql: "INSERT INTO migrations VALUES (?,?)",
          args: [name, Date.now()],
        },
      ],
      "write",
    );
  }
  return { db: drizzle(client, { schema }), client };
}
