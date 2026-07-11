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

-- Simulation anchor values (e.g. the frozen "now" the whole demo is computed against)
CREATE TABLE IF NOT EXISTS sim_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
