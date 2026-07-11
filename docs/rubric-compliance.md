# Rubric Compliance

## Capability Map

| Requirement | Implementation |
|---|---|
| Liquidity pressure | `server/src/engine/liquidityScorer.ts` |
| Unusual transactions | `server/src/engine/detectors.ts` |
| Role-specific views | `client/src/pages/*` |
| Server-side masking | `server/src/routes/*` and `maskLiquidityForRole` |
| Human workflow | `server/src/engine/workflow.ts` |
| Synthetic data | `server/src/db/seed.ts` and `server/src/simulation/*` |
| Validation metrics | `server/src/engine/metrics.ts` |
| Observability | `server/src/observability.ts` |

## Non-Functional Notes

- Uses deterministic synthetic data for reproducibility.
- Keeps authority boundaries in the API, not only the UI.
- Exposes reliability checks for stale, missing, and inconsistent provider feeds.
- Ships without real credentials or external provider integrations.
