# Final submission checklist — Phase 3, Step 5

## Metrics, edge cases, uncertainty, and false positives

Status: verified for review. Metrics below were regenerated from seed 42 with
`npm run seed && npm run metrics`.

## 1. Three headline metrics

### Analytics quality — anomaly precision

**Result: 100.0%**

The metric is calculated as:

```text
true injected anomalies represented by unusual-transaction alerts
-------------------------------------------------------------------
all unusual-transaction alerts
```

The current fixture produced 8 detected injected anomalies among 8 unusual
transaction alerts. This is a synthetic-fixture result, not a claim about
real-world fraud accuracy. Recall is 80.0% because two subtle injected signals
were deliberately below the normal 3σ threshold.

Measurement: `server/src/engine/metrics.ts`, run with `npm run metrics`.

### Reliability — provider-input guard coverage

**Result: 100.0% (6/6 scenarios)**

The guard tests fresh, delayed, missing, negative, future-dated, and malformed
provider snapshots. The expected safe behavior is:

- delayed input → `stale`, unconfirmed, confidence penalty;
- missing input → `missing`, unavailable rather than zero;
- invalid input → `inconsistent`, excluded from capacity calculation.

Measurement: `evaluateProviderInputGuards()` in
`server/src/simulation/providerInputValidation.ts`.

### Performance — dashboard read-path p95

**Result: 12.7 ms in-process p95**

The harness executes the management overview plus agent-liquidity read path 100
times, sorts timings, and reports the 95th percentile. This excludes browser,
network, and process startup time, so it is a local computation metric rather
than an end-to-end latency promise.

Measurement: `computeMetrics()` in `server/src/engine/metrics.ts`.

## 2. Additional measured evidence

| Metric | Current result | Meaning |
|---|---:|---|
| Full detection pass average | 13.3 ms | Four detectors over 3,707 synthetic transactions |
| Engine throughput | 279,101 tx/sec | Transactions scanned per average detection pass |
| Held-out shortage classification | 100.0% | Correct shortage/adequate-capacity classification across 12 scenarios |
| Shortages detected early | 7/7 | No held-out shortage missed in the fixture |
| Average warning lead | 186 minutes | Simulated time from snapshot signal to exhaustion |
| Explanation coverage | 100.0% | 18/18 persisted alerts contain reason, signals, uncertainty, confidence, and next step |
| Threshold-3σ false-positive rate | 0.0% | No normal demo-day transaction crossed the production threshold |

Held-out outcomes are kept separate from the live scorer and are read only by
the validation harness after prediction. They are not used to create alerts.

## 3. Failure and edge-case behavior

| Edge case | Safe behavior | Evidence |
|---|---|---|
| Missing provider balance | Mark unavailable; never substitute zero | `assessProviderInput()` |
| Stale provider feed | Mark unconfirmed and reduce confidence | `STALE_MINUTES = 60` |
| Future/invalid balance timestamp | Mark inconsistent; exclude from projection | input guard scenarios |
| Fewer than 10 baseline windows | Do not make a fair anomaly comparison | `computeBaselines()` / Python detector |
| Sparse rolling horizon | Add `thin_horizon` confidence penalty | `forecastConfidence()` |
| Highly volatile amounts | Add `volatile_amounts` penalty | `transactionVarianceIsHigh()` |
| Live stream unavailable | Report unavailable; do not call silence safe | live-feed UI state |
| Unauthorized workflow action | Return `403`; leave database unchanged | `alerts.ts` + workflow rules |
| Missing action note | Return `400`; leave database unchanged | `noteRequired()` |
| Provider boundary mismatch | Mask exact values or reject access | session scope + API masking |

## 4. False-positive considerations

CashLens treats a statistical difference as a prompt for review. Expected false
positive sources include:

- legitimate holiday, payday, or local-event demand;
- an approved agent operating outside their learned hours;
- a new but legitimate provider-network relationship;
- a shared operational event concentrated in one agent;
- delayed data that makes a healthy float look uncertain;
- a new agent whose history is too short for a stable baseline;
- amount distributions that are naturally heavy-tailed rather than anomalous.

The prototype addresses these risks by using agent-specific baselines, a
context-aware detector, a documented threshold sweep, explicit uncertainty, and
human feedback labels such as `false_positive` and `contextual_spike`.

At the current threshold, the synthetic demo-day false-positive rate is 0.0%,
while lowering the volume threshold to 2σ catches more subtle examples but
produces a 4.25% false-positive rate. This trade-off is shown rather than hidden.

## 5. Uncertainty and interpretation boundary

- Confidence measures confidence in the signal and data quality, not confidence
  that a person did anything wrong.
- Synthetic labels are validation ground truth only; detectors do not read them.
- A detected anomaly is not a fraud finding.
- A shortage forecast is not a command to move money.
- A false-positive label records reviewer feedback but does not automatically
  retrain a model or change an account.
- All metrics are small-fixture demonstrations and require broader, independent
  evaluation before any production claim.

## 6. Reproduction commands

```bash
cd server
npm run seed
npm run metrics
npm run verify:separation
npm run verify:evidence
npm run verify:risk-language
npm run verify:lifecycle
```

Approval requested: review the metrics and edge-case evidence before Phase 3,
Step 6 (final README boundary and architecture documentation).
