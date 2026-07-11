# Architecture Diagram

CashLens is a local decision-support prototype with a React client and an Express API backed by Node's built-in SQLite module.

```text
client/
  React + Vite + TypeScript
  role-scoped views
  drawer bar, case panel, pressure dials
  EN / BN / Banglish UI strings

server/
  Express API
  node:sqlite database
  synthetic data seed
  liquidity scorer
  anomaly detectors
  workflow and masking rules

server/data/
  generated SQLite database
  generated validation metrics
```

## Runtime Flow

1. `server/src/db/seed.ts` creates deterministic synthetic agents, balances, transactions, and labeled anomaly examples.
2. `server/src/engine/runDetection.ts` evaluates liquidity pressure, data quality, cross-provider imbalance, and unusual transaction signals.
3. `server/src/routes/*` exposes role-scoped REST endpoints.
4. `client/src/api/client.ts` calls the API from role-specific pages.
5. Server-side masking prevents provider ops and management roles from seeing data outside their authority.

## Production Serving

The server can serve the built React app when `client/dist` exists. `npm run build` in `server/` also copies `src/db/schema.sql` into `dist/db/schema.sql` so the compiled server can migrate a fresh database.
