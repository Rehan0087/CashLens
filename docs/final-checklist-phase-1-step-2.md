# Final submission checklist — Phase 1, Step 2

## Liquidity and anomaly evidence review

Status: verified for review. This document covers forward-looking liquidity
insight and one explainable anomaly category.

## 1. Forward-looking liquidity logic

The core implementation is in
`server/src/engine/liquidityScorer.ts`.

```text
historical transactions
        |
        +--> eight rolling 30-minute windows
        |
        +--> exponentially weighted moving demand estimate
        |       alpha = 0.35; latest windows receive more weight
        |
        +--> project over a four-hour horizon
                |
                +--> shared physical-cash outflow
                |       cash-out - cash-in
                |
                +--> provider e-money need
                        cash-in - cash-out, computed per provider
                                |
                                +--> shortage ETA
                                +--> pressure score and level
                                +--> confidence penalties
```

The key formulas are:

```ts
const projectedOutflow = Math.max(0, cashBurnRate * 4);
const cashScore = projectedOutflow / Math.max(agent.physicalCash, 1);

const projectedInflowNeed = Math.max(0, providerBurnRate * 4);
const providerScore = projectedInflowNeed / Math.max(providerBalance, 1);

const availableCapacity = balance - Math.max(1, Math.round(balance * 0.1));
const hourlyBurnRate = projectedDemand / 4;
const shortageMinutes = (availableCapacity / hourlyBurnRate) * 60;
```

This is forward-looking because the system projects demand over the next four
hours and returns `projectedOutflow`, `projectedInflowNeed`, and
`estimatedShortageMinutes`; it does not merely report today's totals.

The implementation also handles uncertainty explicitly:

- missing or invalid provider balances become unavailable, not zero;
- feeds older than 60 minutes are marked stale and reduce confidence;
- sparse history, thin rolling horizons, and volatile amounts add confidence
  penalties;
- provider forecasts remain separate from the shared physical-cash forecast.

## 2. Explainable anomaly category

The seeded detector demonstrates the `unusual_transaction` category. A
transaction is evaluated against the agent's pre-demo-day baseline:

```ts
const z = (transaction.amount - baseline.mean) / baseline.std;

if (z >= 3) {
  // Persist an advisory unusual_transaction alert with volume evidence.
}
```

An alternate `odd_hour` evidence path identifies activity outside the agent's
usual operating hours. Neither path reads `is_synthetic_anomaly`,
`anomaly_kind`, or `scenario_tag`; those labels are used only by validation
after detection.

The persisted payload shape is:

```json
{
  "id": "al-11",
  "type": "unusual_transaction",
  "severity": "medium",
  "confidence": 0.85,
  "evidence": {
    "kind": "volume_spike",
    "signals": {
      "transaction_type": "cash_out",
      "amount": 18400,
      "z_score": 6.4,
      "baseline_mean": 6200,
      "baseline_stddev": 1900,
      "at": "14:30"
    },
    "unconfirmed": false,
    "explanation": {
      "en": "A cash-out of ৳18,400 is 6.4 standard deviations above this agent's usual size (typically ৳6,200 ± ৳1,900).",
      "bn": "এই ক্যাশ-আউট এজেন্টের স্বাভাবিক লেনদেনের তুলনায় ৬.৪ স্ট্যান্ডার্ড ডেভিয়েশন বেশি।",
      "banglish": "Ei cash-out ei agenter shabhabik lendener cheye 6.4 standard deviation beshi."
    },
    "suggestedAction": {
      "en": "Review with the agent before escalating. This is a statistical signal — not a fraud decision.",
      "bn": "এস্কেলেট করার আগে এজেন্টের সঙ্গে যাচাই করুন। এটি পরিসংখ্যানগত সংকেত — জালিয়াতির সিদ্ধান্ত নয়।",
      "banglish": "Escalate korar age agenter shathe kotha bole jachai korun. Eta statistical signal — kono jaliyatir siddhanto noy."
    }
  }
}
```

This evidence is explainable because it shows the observed amount, baseline
mean, baseline deviation, calculated z-score, time, uncertainty state, and a
safe human-review next step.

## 3. Reproducible verification

From Ubuntu/Linux or a local development shell:

```bash
cd server
npm run seed
npm run verify:evidence
```

The verifier exits with status 1 if any requirement fails. It checks that:

- at least one forward-looking cash or provider projection exists;
- shortage estimates are explicit numbers or explicit `null` values;
- an `unusual_transaction` category is persisted;
- anomaly evidence contains structured signals and all three languages;
- detector evidence does not contain validation-only labels;
- the in-memory draft path and persisted alert path both exist.

## 4. Boundary conclusion

The evidence proves decision support, not production fraud detection. A high
z-score is a statistical difference from one synthetic agent's history. It is
not proof of wrongdoing, and no alert authorizes blocking, freezing, transfer,
or a final fraud decision.

Approval requested: review this evidence before Phase 2, Step 3.
