# Final polish — Phase 2, Step 3

## Sanitized risk language

Status: implemented and verified for review. Coordination-state design is the
next step.

## Forbidden wording checklist

Do not use these terms as labels, conclusions, or instructions:

- “Fraud detected”, “fraud confirmed”, “fraudster”, “guilty”, or “criminal”;
- “Block now”, “freeze now”, “suspend”, “deny”, or “close the account”;
- “Transfer funds”, “rebalance wallets”, “move money”, or “execute top-up”;
- “Certain”, “proven”, or “no explanation needed”;
- “Suspicious person”, “bad agent”, or any identity-based accusation.

The words “fraud”, “block”, and “freeze” may appear only in an explicit safety
boundary such as “this is not a final fraud decision” or “no account is
blocked”. They must never appear as an alert conclusion or an automated action.

## Rewritten core alert messages

### Shared physical-cash pressure

**English**

> Projected cash-out demand is higher than the shared cash available over the
> next four hours. Review this forecast with provider operations and coordinate
> any approved support through official channels. This system does not move cash
> or execute a top-up.

**Banglish**

> Agami 4 ghontay projected cash-out demand shared cash-er cheye beshi. Ei
> forecast provider operations-er shathe review korun ebong official channele
> approved support coordinate korun. Ei system cash move ba top-up execute kore
> na.

### Provider e-money pressure

**English**

> Projected cash-in demand is higher than the current provider float. Review this
> forecast with provider operations and request any approved e-float support
> through the official provider channel. This system does not initiate a top-up.

**Banglish**

> Projected cash-in demand bortoman provider float-er cheye beshi. Ei forecast
> provider operations-er shathe review korun ebong official provider channele
> approved e-float support-er onurodh korun. Ei system top-up initiate kore na.

### Cross-provider imbalance

**English**

> Provider floats are imbalanced: one has more available value while another may
> face service pressure. Review the difference with the affected provider.
> Wallets stay separate; this system cannot transfer value between them.

**Banglish**

> Provider float-e imbalance ache: ekotite beshi value, onnotite service pressure
> hote pare. Affected provider-er shathe ei difference review korun. Wallet alada
> thakbe; ei system ek wallet theke onnotite value transfer korte pare na.

### Unusual transaction or unusual hour

**English**

> This transaction differs from the agent's usual pattern. Review it with the
> agent before escalating. This is a statistical signal, not proof of wrongdoing
> or a final fraud decision.

**Banglish**

> Ei transaction agent-er shabhabik pattern theke alada. Escalate korar age
> agenter shathe kotha bole review korun. Eta statistical signal, kono onyay-er
> proman ba final fraud-er siddhanto noy.

### Stale or invalid data

**English**

> The provider feed is stale or unavailable. Confirm the balance through the
> official provider channel before interpreting related alerts. No automatic
> action is taken on uncertain data.

**Banglish**

> Provider feed stale ba unavailable. Related alert bujhar age official provider
> channele balance nishchit korun. Onishchito data-r opor kono automatic
> podokkhep neya hoy na.

## Implementation review

The wording is implemented in:

- `server/src/i18n/explanations.ts` for persisted alert evidence;
- `client/src/i18n/ui.ts` for live-feed labels and safe UI chrome;
- `client/src/components/InclusiveAlertCard.tsx` for localized rendering;
- `server/scripts/verify_risk_language.ts` for automated anomaly-copy checks.

The verifier checks every persisted `unusual_transaction` alert for:

- English, Bengali, and Banglish strings;
- a human review/verification next step;
- an explicit non-determination boundary;
- absence of accusatory or enforcement wording.

Run it with:

```bash
cd server
npm run seed
npm run verify:risk-language
```

## Acceptance criteria

- Alerts describe observed patterns, not allegedly bad people.
- Every anomaly alert asks a human to review or verify context.
- Operational suggestions are framed as coordination through approved channels.
- The system explicitly says it cannot move money or execute a top-up.
- No alert copy instructs an automatic block, freeze, transfer, or final fraud
  decision.

Approval requested: review this sanitized copy before Phase 2, Step 4.
