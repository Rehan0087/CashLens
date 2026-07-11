-- Super Agent Liquidity & Risk Intelligence Platform
-- All data is synthetic. No real provider accounts, balances, or customer identities.

CREATE TABLE IF NOT EXISTS providers (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  area          TEXT NOT NULL,
  physical_cash REAL NOT NULL,
  -- ground truth for validation metrics only; never surfaced to end users
  scenario_tag  TEXT NOT NULL DEFAULT 'normal'
);

CREATE TABLE IF NOT EXISTS agent_provider_balances (
  agent_id       TEXT NOT NULL REFERENCES agents(id),
  provider_id    TEXT NOT NULL REFERENCES providers(id),
  e_money_balance REAL NOT NULL,
  last_synced_at TEXT NOT NULL,
  PRIMARY KEY (agent_id, provider_id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id                  TEXT PRIMARY KEY,
  agent_id            TEXT NOT NULL REFERENCES agents(id),
  provider_id         TEXT NOT NULL REFERENCES providers(id),
  type                TEXT NOT NULL CHECK (type IN ('cash_in', 'cash_out')),
  amount              REAL NOT NULL,
  timestamp           TEXT NOT NULL,
  is_synthetic_anomaly INTEGER NOT NULL DEFAULT 0,
  anomaly_kind        TEXT
);

CREATE INDEX IF NOT EXISTS idx_transactions_agent_time ON transactions(agent_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_transactions_provider ON transactions(provider_id);

CREATE TABLE IF NOT EXISTS alerts (
  id            TEXT PRIMARY KEY,
  agent_id      TEXT NOT NULL REFERENCES agents(id),
  provider_id   TEXT REFERENCES providers(id),
  type          TEXT NOT NULL CHECK (type IN ('liquidity_pressure', 'cross_provider_imbalance', 'unusual_transaction', 'data_quality')),
  severity      TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  evidence_json TEXT NOT NULL,
  confidence    REAL NOT NULL,
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'escalated', 'resolved')),
  assigned_role TEXT NOT NULL DEFAULT 'provider_ops',
  created_at    TEXT NOT NULL,
  source_transaction_id TEXT REFERENCES transactions(id)
);

CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_agent ON alerts(agent_id);

CREATE TABLE IF NOT EXISTS case_notes (
  id         TEXT PRIMARY KEY,
  alert_id   TEXT NOT NULL REFERENCES alerts(id),
  role       TEXT NOT NULL,
  note       TEXT NOT NULL,
  timestamp  TEXT NOT NULL
);

-- Demo authentication identities. Passwords are stored as salted scrypt hashes;
-- provider/agent scope is server-side session data, never a client query choice.
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('agent', 'provider_ops', 'risk_analyst', 'financial_service_provider', 'fsp_management')),
  provider_id   TEXT REFERENCES providers(id),
  agent_id      TEXT REFERENCES agents(id),
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

-- Immutable workflow transitions. Actor identity is nullable on deletion so
-- historical audit events remain available if a demo identity is re-seeded.
CREATE TABLE IF NOT EXISTS alert_workflow_events (
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

CREATE INDEX IF NOT EXISTS idx_alert_workflow_events_alert
  ON alert_workflow_events(alert_id, created_at);

-- Human review labels are append-only evidence, not an automated model target.
CREATE TABLE IF NOT EXISTS alert_feedback (
  id                 TEXT PRIMARY KEY,
  alert_id           TEXT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  reviewer_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewer_role      TEXT NOT NULL CHECK (reviewer_role = 'risk_analyst'),
  outcome            TEXT NOT NULL CHECK (outcome IN ('confirmed_concern', 'false_positive', 'contextual_spike', 'insufficient_evidence')),
  note               TEXT NOT NULL,
  rule_version       TEXT NOT NULL DEFAULT 'detector-v1',
  created_at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alert_feedback_alert
  ON alert_feedback(alert_id, created_at);

-- Simulation anchor values (e.g. the frozen "now" the whole demo is computed against)
CREATE TABLE IF NOT EXISTS sim_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
