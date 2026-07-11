import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const dataDir = path.join(__dirname, "..", "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, "cashlens.sqlite3"));
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

export function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  db.exec(schema);
}

export function inTransaction(fn: () => void) {
  db.exec("BEGIN");
  try {
    fn();
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function setMeta(key: string, value: string) {
  db.prepare("INSERT INTO sim_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function getMeta(key: string): string | null {
  const row = db.prepare("SELECT value FROM sim_meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

// The demo dataset is anchored to a frozen simulated clock (today 16:00 local)
// so every liquidity projection is reproducible regardless of when judges run it.
export function getSimNow(): Date {
  const v = getMeta("sim_now");
  if (!v) throw new Error("Database not seeded. Run: npm run seed");
  return new Date(v);
}
