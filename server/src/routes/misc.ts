import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { db, dataDir, getSimNow } from "../db/index.js";
import { assembleOverview } from "../engine/overview.js";
import { computeAgentLiquidity, maskLiquidityForRole } from "../engine/liquidityScorer.js";
import { computeMetrics, type MetricsReport } from "../engine/metrics.js";
import { computeScenarios } from "../engine/scenarios.js";
import { roleOf, providerIdOf } from "./helpers.js";
import { inspectProviderInputs, observabilitySnapshot } from "../observability.js";

export const miscRouter = Router();

miscRouter.get("/health", (_req, res) => {
  try {
    res.json({ ok: true, simNow: getSimNow().toISOString(), providerInputs: inspectProviderInputs() });
  } catch {
    res.status(503).json({ ok: false, error: "Dataset is not seeded. Run npm run seed before serving requests." });
  }
});

// Readiness adds data-integrity/freshness detail to the liveness endpoint.
// Missing feeds are a hard not-ready signal (a provider snapshot is absent);
// stale or inconsistent feeds are degraded-but-ready — the system stays up,
// flags them, reduces confidence, and marks affected figures unconfirmed.
miscRouter.get("/ready", (_req, res) => {
  try {
    const providerInputs = inspectProviderInputs();
    const ready = providerInputs.missingFeeds === 0;
    res.status(ready ? 200 : 503).json({ ready, degraded: providerInputs.state === "degraded", providerInputs });
  } catch {
    res.status(503).json({ ready: false, error: "Dataset is not seeded." });
  }
});

// Contains only operational counters and feed health; no balances or case data.
miscRouter.get("/observability", (_req, res) => {
  try {
    res.json(observabilitySnapshot());
  } catch {
    res.status(503).json({ error: "Observability is unavailable until the dataset is seeded." });
  }
});

miscRouter.get("/meta", (_req, res) => {
  const providers = db.prepare("SELECT id, name FROM providers ORDER BY id").all();
  const agents = db.prepare("SELECT id, name, area FROM agents ORDER BY id").all();
  res.json({ simNow: getSimNow().toISOString(), providers, agents });
});

// Management aggregates — the only alert-related surface fsp_management gets.
miscRouter.get("/overview", (_req, res) => {
  res.json(assembleOverview());
});

// Guided demonstration scenarios A–D, with live deep-link targets. Read-only.
miscRouter.get("/scenarios", (_req, res) => {
  try {
    res.json(computeScenarios());
  } catch {
    res.status(503).json({ error: "Scenarios are unavailable until the dataset is seeded." });
  }
});

// Validation metrics; computed once and cached (the sweep + timing runs take ~1s).
let cachedMetrics: MetricsReport | null = null;
miscRouter.get("/metrics", (_req, res) => {
  if (!cachedMetrics) {
    const fromDisk = path.join(dataDir, "metrics.json");
    if (fs.existsSync(fromDisk)) {
      cachedMetrics = JSON.parse(fs.readFileSync(fromDisk, "utf-8")) as MetricsReport;
    } else {
      cachedMetrics = computeMetrics();
    }
  }
  res.json(cachedMetrics);
});

// What-if: recompute liquidity with a demand multiplier — read-only decision support.
miscRouter.get("/whatif/:agentId", (req, res) => {
  const role = roleOf(req);
  const providerId = providerIdOf(req);
  if (role === "fsp_management" || role === "financial_service_provider") {
    return res.status(403).json({ error: "This role sees aggregates only — individual what-if scenarios are unavailable." });
  }
  const requestedMultiplier = Number(req.query.multiplier ?? 1);
  if (!Number.isFinite(requestedMultiplier)) {
    return res.status(400).json({ error: "multiplier must be a finite number" });
  }
  const multiplier = Math.min(4, Math.max(0.5, requestedMultiplier));
  const [base] = computeAgentLiquidity(req.params.agentId, 1);
  const [scenario] = computeAgentLiquidity(req.params.agentId, multiplier);
  if (!base || !scenario) return res.status(404).json({ error: "Agent not found" });
  res.json({
    multiplier,
    base: maskLiquidityForRole(base, role, providerId),
    scenario: maskLiquidityForRole(scenario, role, providerId),
  });
});
