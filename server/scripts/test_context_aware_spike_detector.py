#!/usr/bin/env python3
"""Small standard-library regression test for the context-aware detector."""

import unittest

from context_aware_spike_detector import SpikeObservation, evaluate_spike


def observation(**overrides):
    values = {
        "observation_id": "test-1",
        "provider_id": "bkash",
        "scope_key": "DHK-NORTH-03",
        "window_start": "2026-07-12T15:00:00Z",
        "observed_volume": 160,
        "baseline_mean": 100,
        "baseline_std": 15,
        "baseline_windows": 20,
        "cohort_size": 12,
        "context_label": "eid_holiday",
        "context_expected_volume": 155,
        "provider_depletion_ratio": 0.40,
        "top_agent_share": 0.35,
        "off_hours": False,
        "novel_network_share": 0.10,
        "feed_quality": "fresh",
    }
    values.update(overrides)
    return SpikeObservation.from_mapping(values)


class ContextAwareSpikeDetectorTests(unittest.TestCase):
    def test_expected_holiday_spike_is_contextual(self):
        result = evaluate_spike(observation())
        self.assertEqual(result["classification"], "contextual_spike")
        self.assertFalse(result["humanReviewRequired"])
        self.assertTrue(any(item["code"] == "context_alignment" for item in result["evidence"]))

    def test_correlated_residual_is_suspicious(self):
        result = evaluate_spike(
            observation(
                observed_volume=190,
                context_expected_volume=125,
                provider_depletion_ratio=0.90,
                top_agent_share=0.85,
                off_hours=True,
                novel_network_share=0.75,
            )
        )
        self.assertEqual(result["classification"], "suspicious_spike")
        self.assertTrue(result["humanReviewRequired"])
        self.assertGreaterEqual(result["riskScore"], 0.55)

    def test_weak_evidence_is_not_called_suspicious(self):
        result = evaluate_spike(
            observation(
                observed_volume=180,
                baseline_windows=4,
                cohort_size=3,
                feed_quality="stale",
            )
        )
        self.assertEqual(result["classification"], "insufficient_data")
        self.assertTrue(any(item["code"] == "data_quality_limit" for item in result["evidence"]))


if __name__ == "__main__":
    unittest.main()
