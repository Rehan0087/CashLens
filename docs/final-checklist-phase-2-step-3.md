# Final submission checklist — Phase 2, Step 3

## Careful risk language and human review

Status: verified for review. This step covers anomaly-alert wording only; the
alert lifecycle audit is the next step.

## Approved English UI copy

### Volume anomaly

> This transaction is unusual compared with this agent's usual transaction
> size. Review it with the agent before escalating. This is a statistical
> signal, not a final fraud decision.

### Unusual-hour anomaly

> This transaction occurred outside this agent's usual operating hours. Verify
> the operational context before escalating. This is a review signal, not a
> fraud determination.

### Human-review banner

> Advisory only: human review is required. No account is blocked, no funds are
> frozen, and this system does not make a final fraud decision.

## Approved Banglish UI copy

### Volume anomaly

> Ei transaction ei agent-er shabhabik transaction size-er tulonay oshabhabik.
> Escalate korar age agenter shathe kotha bole review korun. Eta statistical
> signal, final fraud-er siddhanto noy.

### Unusual-hour anomaly

> Ei transaction ei agent-er shabhabik kajer somoyer baire hoyeche. Escalate
> korar age operational prekkhapot jachai korun. Eta review signal, fraud-er
> final nirdharon noy.

### Human-review banner

> Shudhu advisory: manusher review dorkar. Kono account block hoy na, kono taka
> freeze hoy na, ebong ei system final fraud-er siddhanto ney na.

## Payload rules

The server payload must contain:

```json
{
  "evidence": {
    "explanation": {
      "en": "Describe the observed statistical difference.",
      "bn": "পর্যবেক্ষিত পরিসংখ্যানগত পার্থক্য ব্যাখ্যা করুন।",
      "banglish": "Observed statistical difference-ta bojhan."
    },
    "suggestedAction": {
      "en": "Review or verify context before escalating. This is not a final fraud decision.",
      "bn": "এস্কেলেট করার আগে প্রেক্ষাপট যাচাই করুন। এটি চূড়ান্ত জালিয়াতির সিদ্ধান্ত নয়।",
      "banglish": "Escalate korar age prekkhapot review/jachai korun. Eta final fraud-er siddhanto noy."
    },
    "unconfirmed": false
  },
  "confidence": 0.85,
  "status": "new",
  "advisoryOnly": true,
  "humanReviewRequired": true
}
```

The current implementation stores the localized explanation and suggested next
step in `server/src/i18n/explanations.ts`. `InclusiveAlertCard` selects the
active language, displays the explanation first, and exposes evidence through an
accessible disclosure. It does not render a block, freeze, transfer, or
accusation action.

## Language guardrail

Run the automated review after seeding:

```bash
cd server
npm run seed
npm run verify:risk-language
```

The verifier checks every persisted `unusual_transaction` alert for:

- English, Bengali, and Banglish explanation/action strings;
- a review, verification, or confirmation next step;
- an explicit non-determination boundary in English;
- absence of “fraud detected”, “fraud confirmed”, “fraudster”, “guilty”, “block
  now”, and “freeze now”.

The word “fraud” may appear only in a boundary such as “not a fraud decision”;
the system must never state or imply that fraud has been proven.

## Review result

The current seeded anomaly alerts use statistical descriptions and the shared
review-first action copy. The verifier must report `passed: true` before final
submission.

Approval requested: review this risk-language step before Phase 2, Step 4.
