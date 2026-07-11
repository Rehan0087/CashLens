import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { db, getSimNow } from "./db/index.js";
import { STALE_MINUTES } from "./engine/liquidityScorer.js";

interface RequestSample {
  count: number;
  errors: number;
  latencies: number[];
}

const requestSamples = new Map<string, RequestSample>();
const MAX_LATENCIES_PER_ROUTE = 200;

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
}

/** Structured per-request logs plus bounded in-memory latency counters. */
export function observeApiRequest(req: Request, res: Response, next: NextFunction) {
  const traceId = req.get("x-request-id") || randomUUID();
  const started = performance.now();
  res.setHeader("x-trace-id", traceId);
  res.on("finish", () => {
    const durationMs = performance.now() - started;
    const route = `${req.baseUrl}${req.path}`;
    const key = `${req.method} ${route}`;
    const sample = requestSamples.get(key) ?? { count: 0, errors: 0, latencies: [] };
    sample.count += 1;
    if (res.statusCode >= 400) sample.errors += 1;
    sample.latencies.push(durationMs);
    if (sample.latencies.length > MAX_LATENCIES_PER_ROUTE) sample.latencies.shift();
    requestSamples.set(key, sample);
    console.info(
      JSON.stringify({
        event: "api_request",
        traceId,
        method: req.method,
        route,
        status: res.statusCode,
        durationMs: Number(durationMs.toFixed(1)),
      })
    );
  });
  next();
}

export interface ProviderInputHealth {
  state: "healthy" | "degraded";
  expectedFeeds: number;
  receivedFeeds: number;
  missingFeeds: number;
  staleFeeds: number;
  inconsistentFeeds: number;
  safeFallback: string;
}

/**
 * Audit the full expected agent x provider matrix. A left join is important:
 * absent provider snapshots must be reported as missing, not disappear from a
 * normal-looking calculation.
 */
export function inspectProviderInputs(): ProviderInputHealth {
  const now = getSimNow();
  const rows = db
    .prepare(
      `SELECT a.id AS agent_id, p.id AS provider_id, b.e_money_balance, b.last_synced_at
       FROM agents a CROSS JOIN providers p
       LEFT JOIN agent_provider_balances b ON b.agent_id = a.id AND b.provider_id = p.id`
    )
    .all() as unknown as Array<{ agent_id: string; provider_id: string; e_money_balance: number | null; last_synced_at: string | null }>;

  let missingFeeds = 0;
  let staleFeeds = 0;
  let inconsistentFeeds = 0;
  for (const row of rows) {
    if (row.e_money_balance === null || row.last_synced_at === null) {
      missingFeeds += 1;
      continue;
    }
    const syncedAt = new Date(row.last_synced_at);
    if (!Number.isFinite(row.e_money_balance) || row.e_money_balance < 0 || Number.isNaN(syncedAt.getTime()) || syncedAt.getTime() > now.getTime() + 5 * 60_000) {
      inconsistentFeeds += 1;
      continue;
    }
    if ((now.getTime() - syncedAt.getTime()) / 60_000 > STALE_MINUTES) staleFeeds += 1;
  }

  return {
    state: missingFeeds || staleFeeds || inconsistentFeeds ? "degraded" : "healthy",
    expectedFeeds: rows.length,
    receivedFeeds: rows.length - missingFeeds,
    missingFeeds,
    staleFeeds,
    inconsistentFeeds,
    safeFallback: "Missing, stale, or inconsistent provider input is never treated as a zero balance; affected projections are marked unconfirmed and require provider confirmation.",
  };
}

export function observabilitySnapshot() {
  const routes = [...requestSamples.entries()].map(([route, sample]) => {
    const latencies = [...sample.latencies].sort((a, b) => a - b);
    const averageMs = latencies.reduce((sum, value) => sum + value, 0) / Math.max(latencies.length, 1);
    return {
      route,
      requests: sample.count,
      errors: sample.errors,
      averageMs: Number(averageMs.toFixed(1)),
      p95Ms: Number(percentile(latencies, 0.95).toFixed(1)),
    };
  });
  return {
    providerInputs: inspectProviderInputs(),
    routes,
  };
}
