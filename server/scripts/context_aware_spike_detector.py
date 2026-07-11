#!/usr/bin/env python3
"""Context-aware, advisory-only spike detection for CashLens.

The script consumes aggregate observations rather than customer-level records.
It is intentionally dependency-free so it can run in an Ubuntu terminal with
the system Python 3 installation.

Input format:
    {"observations": [{...}, {...}]}

The observation fields are documented in ``docs/innovation-phase-1-step-2.md``.
The detector never blocks an account, freezes funds, initiates a transfer, or
declares fraud. It produces explainable signals for a human reviewer.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping


ENGINE_VERSION = "context-aware-spike-v1"
MIN_BASELINE_WINDOWS = 10
MIN_COHORT_SIZE = 5
STD_FLOOR = 1.0


def clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return min(upper, max(lower, value))


def number(value: Any, default: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return parsed if math.isfinite(parsed) else default


def boolean(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "y"}


@dataclass(frozen=True)
class SpikeObservation:
    """Aggregate, privacy-safe features for one provider/window scope."""

    observation_id: str
    provider_id: str
    scope_key: str
    window_start: str
    observed_volume: float
    baseline_mean: float
    baseline_std: float
    baseline_windows: int
    cohort_size: int
    context_label: str | None = None
    context_expected_volume: float | None = None
    provider_depletion_ratio: float = 0.0
    top_agent_share: float = 0.0
    off_hours: bool = False
    novel_network_share: float = 0.0
    feed_quality: str = "fresh"

    @classmethod
    def from_mapping(cls, raw: Mapping[str, Any]) -> "SpikeObservation":
        context = raw.get("context_label") or raw.get("operational_context")
        expected = raw.get("context_expected_volume")
        if expected is None:
            expected = raw.get("seasonal_expected_volume")

        return cls(
            observation_id=str(raw.get("observation_id", "unknown-observation")),
            provider_id=str(raw.get("provider_id", "unknown-provider")),
            scope_key=str(raw.get("scope_key", "unknown-scope")),
            window_start=str(raw.get("window_start", "")),
            observed_volume=number(raw.get("observed_volume")),
            baseline_mean=number(raw.get("baseline_mean")),
            baseline_std=max(number(raw.get("baseline_std"), STD_FLOOR), 0.0),
            baseline_windows=int(number(raw.get("baseline_windows"))),
            cohort_size=int(number(raw.get("cohort_size"))),
            context_label=str(context) if context else None,
            context_expected_volume=(number(expected) if expected is not None else None),
            provider_depletion_ratio=clamp(number(raw.get("provider_depletion_ratio"))),
            top_agent_share=clamp(number(raw.get("top_agent_share"))),
            off_hours=boolean(raw.get("off_hours")),
            novel_network_share=clamp(number(raw.get("novel_network_share"))),
            feed_quality=str(raw.get("feed_quality", "fresh")),
        )


def evidence(
    code: str,
    observed: float | str,
    baseline: float | str,
    unit: str,
    contribution: float,
    explanation: str,
) -> dict[str, Any]:
    """Build the stable evidence shape consumed by a future UI."""

    return {
        "code": code,
        "observed": observed,
        "baseline": baseline,
        "unit": unit,
        "contribution": round(contribution, 4),
        "explanation": explanation,
    }


def evaluate_spike(observation: SpikeObservation) -> dict[str, Any]:
    """Classify one aggregate window and return human-readable evidence."""

    std = max(observation.baseline_std, STD_FLOOR)
    raw_z = (observation.observed_volume - observation.baseline_mean) / std
    context_active = bool(observation.context_label)
    expected = observation.context_expected_volume
    if expected is None:
        expected = observation.baseline_mean * (1.35 if context_active else 1.0)
    context_z = (observation.observed_volume - expected) / std

    signals: list[dict[str, Any]] = []
    risk_score = 0.0

    # A large raw deviation is not enough to call a spike suspicious. The
    # context-adjusted residual and corroborating operational signals matter.
    baseline_risk = clamp((context_z - 1.5) / 3.5)
    if context_active and context_z < 2.5:
        signals.append(
            evidence(
                "context_alignment",
                round(observation.observed_volume, 2),
                round(expected, 2),
                "volume per window",
                -0.20,
                f"The {observation.context_label} context predicts elevated demand; "
                "the observed volume remains within the expected range.",
            )
        )
    elif raw_z >= 1.5 or context_z >= 1.5:
        contribution = 0.30 * baseline_risk
        risk_score += contribution
        signals.append(
            evidence(
                "context_adjusted_volume",
                round(observation.observed_volume, 2),
                round(expected, 2),
                "volume per window",
                contribution,
                f"Observed volume is {raw_z:.1f}σ above the ordinary baseline and "
                f"{context_z:.1f}σ above the context-adjusted expectation.",
            )
        )
    depletion_risk = clamp((observation.provider_depletion_ratio - 0.55) / 0.45)
    if observation.provider_depletion_ratio >= 0.55:
        contribution = 0.25 * depletion_risk
        risk_score += contribution
        signals.append(
            evidence(
                "provider_depletion",
                round(observation.provider_depletion_ratio, 3),
                0.55,
                "depletion ratio",
                contribution,
                "Provider e-money depletion is high enough to make the demand spike "
                "operationally consequential.",
            )
        )

    concentration_risk = clamp((observation.top_agent_share - 0.50) / 0.40)
    if observation.top_agent_share >= 0.50:
        contribution = 0.15 * concentration_risk
        risk_score += contribution
        signals.append(
            evidence(
                "agent_concentration",
                round(observation.top_agent_share, 3),
                0.50,
                "share of scoped volume",
                contribution,
                "A large share of the scoped volume comes from a small number of "
                "agents, so the aggregate spike is less broadly distributed.",
            )
        )

    if observation.off_hours:
        risk_score += 0.15
        signals.append(
            evidence(
                "off_hours_activity",
                "true",
                "normal operating hours",
                "boolean",
                0.15,
                "The spike occurred outside the configured operating-hour pattern.",
            )
        )

    if observation.novel_network_share >= 0.40:
        contribution = 0.15 * clamp((observation.novel_network_share - 0.40) / 0.60)
        risk_score += contribution
        signals.append(
            evidence(
                "novel_network_activity",
                round(observation.novel_network_share, 3),
                0.40,
                "share of new network activity",
                contribution,
                "A meaningful portion of activity is connected to previously unseen "
                "agent-network relationships.",
            )
        )

    data_insufficient = (
        observation.baseline_windows < MIN_BASELINE_WINDOWS
        or observation.cohort_size < MIN_COHORT_SIZE
        or observation.feed_quality != "fresh"
    )
    if data_insufficient:
        reasons: list[str] = []
        if observation.baseline_windows < MIN_BASELINE_WINDOWS:
            reasons.append(f"only {observation.baseline_windows} baseline windows")
        if observation.cohort_size < MIN_COHORT_SIZE:
            reasons.append(f"cohort size {observation.cohort_size} is below {MIN_COHORT_SIZE}")
        if observation.feed_quality != "fresh":
            reasons.append(f"feed quality is {observation.feed_quality}")
        signals.append(
            evidence(
                "data_quality_limit",
                "; ".join(reasons),
                "minimum evidence quality",
                "quality",
                0.0,
                "The detector cannot make a confident comparison because " + ", ".join(reasons) + ".",
            )
        )

    risk_score = clamp(risk_score)
    context_explains_spike = (
        context_active
        and context_z < 2.5
        and observation.provider_depletion_ratio < 0.75
        and not observation.off_hours
        and observation.novel_network_share < 0.60
    )

    if data_insufficient:
        classification = "insufficient_data"
        severity = "low"
        explanation = "The window is not classified because the available evidence is incomplete."
    elif context_explains_spike and risk_score < 0.55:
        classification = "contextual_spike"
        severity = "low"
        explanation = (
            f"Volume is elevated, but the configured {observation.context_label} context "
            "explains the increase and no strong corroborating pressure signal was observed."
        )
    elif risk_score >= 0.55 or context_z >= 3.0:
        classification = "suspicious_spike"
        severity = "high" if risk_score >= 0.75 or context_z >= 4.0 else "medium"
        explanation = (
            "The window remains unusual after context adjustment and has corroborating "
            "operational or behavioral signals requiring human review."
        )
    else:
        classification = "normal_variation"
        severity = "low"
        explanation = "The observed change is within the expected operating range."

    return {
        "engine": ENGINE_VERSION,
        "observationId": observation.observation_id,
        "providerId": observation.provider_id,
        "scopeKey": observation.scope_key,
        "windowStart": observation.window_start,
        "classification": classification,
        "severity": severity,
        "riskScore": round(risk_score, 4),
        "context": {
            "label": observation.context_label,
            "ordinaryBaseline": round(observation.baseline_mean, 2),
            "contextExpected": round(expected, 2),
            "rawZScore": round(raw_z, 3),
            "contextAdjustedZScore": round(context_z, 3),
        },
        "evidence": signals,
        "explanation": explanation,
        "advisoryOnly": True,
        "humanReviewRequired": classification in {"suspicious_spike", "insufficient_data"},
        "permittedNextStep": "Review the evidence and confirm the operational context manually.",
        "prohibitedAutomations": [
            "account_blocking",
            "fund_freezing",
            "automatic_transfer",
            "final_fraud_determination",
        ],
    }


def evaluate_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    raw_observations = payload.get("observations", [])
    if not isinstance(raw_observations, list):
        raise ValueError("observations must be a JSON array")
    results = [evaluate_spike(SpikeObservation.from_mapping(item)) for item in raw_observations]
    return {
        "engine": ENGINE_VERSION,
        "advisoryOnly": True,
        "resultCount": len(results),
        "results": results,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="JSON file containing aggregate observations")
    parser.add_argument("--output", type=Path, help="Optional JSON output file; stdout is used when omitted")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        payload = json.loads(args.input.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("top-level JSON value must be an object")
        output = evaluate_payload(payload)
        rendered = json.dumps(output, indent=2, ensure_ascii=False) + "\n"
        if args.output:
            args.output.write_text(rendered, encoding="utf-8")
        else:
            sys.stdout.write(rendered)
        return 0
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"context-aware-spike-detector: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
