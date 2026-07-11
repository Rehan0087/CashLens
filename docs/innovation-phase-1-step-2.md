# Innovation Phase 1 — Step 2

## Context-aware spike detection

Status: implemented as an isolated Python advisory engine. Phase 2 workflows
are not included in this step.

## What the detector does

`server/scripts/context_aware_spike_detector.py` consumes privacy-safe aggregate
windows from the Step 1 design. It compares observed volume with both:

1. the ordinary historical baseline; and
2. a context-adjusted expectation for a holiday or planned operational event.

It then checks corroborating signals: provider e-money depletion, concentration
of volume, activity outside normal hours, and novel network activity. The result
contains a deterministic score, classification, severity, evidence rows, and a
plain-language explanation.

The detector does not receive customer names, phone numbers, precise locations,
PINs, OTPs, private keys, or raw source account identifiers.

## Input contract

Input is a JSON object with an `observations` array. Each observation is one
provider and privacy-safe area/network scope for one time window.

| Field | Meaning |
|---|---|
| `observation_id` | Opaque event/window identifier |
| `provider_id` | Provider scope being evaluated |
| `scope_key` | Coarse cell or privacy-safe network key |
| `window_start` | ISO-8601 window start |
| `observed_volume` | Aggregate volume in the window |
| `baseline_mean` | Historical ordinary mean |
| `baseline_std` | Historical standard deviation |
| `baseline_windows` | Number of historical windows |
| `cohort_size` | Distinct-agent cohort count after suppression rules |
| `context_label` | Optional value such as `eid_holiday` or `planned_payday` |
| `context_expected_volume` | Expected volume for the active context |
| `provider_depletion_ratio` | Aggregate provider e-money depletion, 0–1 |
| `top_agent_share` | Largest agent share of scoped volume, 0–1 |
| `off_hours` | Whether the window is outside normal operating hours |
| `novel_network_share` | Share of new network activity, 0–1 |
| `feed_quality` | `fresh`, `stale`, `missing`, or `inconsistent` |

The engine requires at least 10 historical windows and a cohort of at least 5
agents for a confident classification. Smaller or degraded inputs are returned
as `insufficient_data` rather than being treated as suspicious.

## Decision logic

The core values are:

```text
ordinary_z = (observed_volume - baseline_mean) / max(baseline_std, 1)
context_z  = (observed_volume - context_expected_volume) / max(baseline_std, 1)
```

When a context is active but no expected value is supplied, the prototype uses
a documented 35% uplift as a fallback. A production implementation should load
the uplift from an approved calendar or planning table and record its version.

The risk score is the weighted sum of explainable components:

```text
0.30 × context-adjusted residual
0.25 × provider depletion
0.15 × agent concentration
0.15 × off-hours activity
0.15 × novel network activity
```

The context component is deliberately not a simple “holiday = safe” rule. A
holiday can explain a broad, expected rise, but a residual spike combined with
depletion, concentration, off-hours activity, or novel network behavior can
still become `suspicious_spike`.

## Output example

```json
{
  "classification": "suspicious_spike",
  "severity": "medium",
  "riskScore": 0.694,
  "context": {
    "label": "eid_holiday",
    "ordinaryBaseline": 100,
    "contextExpected": 135,
    "rawZScore": 4.2,
    "contextAdjustedZScore": 2.8
  },
  "evidence": [
    {
      "code": "context_adjusted_volume",
      "observed": 177,
      "baseline": 135,
      "unit": "volume per window",
      "contribution": 0.1114,
      "explanation": "Observed volume is 4.2σ above the ordinary baseline and 2.8σ above the context-adjusted expectation."
    },
    {
      "code": "provider_depletion",
      "observed": 0.82,
      "baseline": 0.55,
      "unit": "depletion ratio",
      "contribution": 0.15,
      "explanation": "Provider e-money depletion is high enough to make the demand spike operationally consequential."
    }
  ],
  "advisoryOnly": true,
  "humanReviewRequired": true,
  "permittedNextStep": "Review the evidence and confirm the operational context manually."
}
```

The UI can show exactly which evidence contributed to the score. The output
also explicitly records prohibited automations: account blocking, fund
freezing, automatic transfers, and final fraud determinations.

## Linux usage

```bash
python3 server/scripts/context_aware_spike_detector.py \
  --input examples/context-aware-observations.json \
  --output /tmp/cashlens-spike-results.json
```

The script uses only the Python standard library. It is intentionally isolated
from the current Node detection pass until the schema and output contract are
approved for integration.

## Acceptance criteria

- A holiday or planned operational spike can be classified as `contextual_spike`
  when the context explains the observed rise.
- A residual spike with corroborating depletion, concentration, timing, or
  network evidence can be classified as `suspicious_spike`.
- Insufficient or stale data is explicitly marked rather than over-interpreted.
- Every non-trivial result includes structured evidence and a readable reason.
- No result authorizes an automated financial or fraud action.

Approval requested: review Phase 1, Step 2 before Phase 2, Step 3 is started.
