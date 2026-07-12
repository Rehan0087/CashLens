import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "..", "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

const dbFile = process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(dataDir, "cashlens.sqlite3");
export const db = new DatabaseSync(dbFile);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

export function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  db.exec(schema);
  upgradeWorkflowEventSchema();
}

/**
 * SQLite does not alter an existing CHECK constraint when CREATE TABLE IF NOT
 * EXISTS is re-run. Rebuild the small audit table once when upgrading a demo
 * database created before alert-creation events were added.
 */
function upgradeWorkflowEventSchema() {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'alert_workflow_events'")
    .get() as { sql?: string } | undefined;
  if (!row?.sql || row.sql.includes("'create'")) return;

  db.exec(`
    DROP INDEX IF EXISTS idx_alert_workflow_events_alert;
    ALTER TABLE alert_workflow_events RENAME TO alert_workflow_events_legacy;
    CREATE TABLE alert_workflow_events (
      id                 TEXT PRIMARY KEY,
      alert_id           TEXT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
      actor_user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
      actor_role         TEXT NOT NULL,
      action             TEXT NOT NULL CHECK (action IN ('create', 'acknowledge', 'escalate', 'resolve', 'feedback')),
      from_status        TEXT NOT NULL,
      to_status          TEXT NOT NULL,
      from_assigned_role TEXT NOT NULL,
      to_assigned_role   TEXT NOT NULL,
      note               TEXT NOT NULL,
      created_at         TEXT NOT NULL
    );
    INSERT INTO alert_workflow_events
      (id, alert_id, actor_user_id, actor_role, action, from_status, to_status,
       from_assigned_role, to_assigned_role, note, created_at)
    SELECT id, alert_id, actor_user_id, actor_role, action, from_status, to_status,
       from_assigned_role, to_assigned_role, note, created_at
    FROM alert_workflow_events_legacy;
    DROP TABLE alert_workflow_events_legacy;
    CREATE INDEX idx_alert_workflow_events_alert
      ON alert_workflow_events(alert_id, created_at);
  `);
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
