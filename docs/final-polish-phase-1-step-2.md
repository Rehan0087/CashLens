# Final polish — Phase 1, Step 2

## Connecting liquidity warnings to unusual-activity evidence

Status: implemented for review. Copy sanitization, coordination state, and the
presentation script are intentionally not changed here.

## User journey

```text
1. Agent sees shared-cash pressure forecast
       |
       | “Review supporting activity”
       v
2. Screen scrolls to the matching unusual-activity alert
       |
       +--> same agent, same provider scope, same current dataset
       +--> explanation: observed signal vs usual baseline
       +--> evidence disclosure: amount, z-score/time, uncertainty
       v
3. Agent reviews context with the human coordinator
       |
       +--> no block / freeze / transfer action
       +--> provider operations may acknowledge or escalate
       v
4. Risk analyst receives the escalated case if needed
       |
       +--> records a note and disposition
       v
5. Case status becomes visible as resolved
```

This makes the story causal without making an unsafe causal claim:

> “The shared drawer is projected to come under pressure. Here is the unusual
> activity that may explain the demand pattern. Review the agent context before
> escalating.”

The unusual transaction is evidence adjacent to the liquidity warning, not proof
that the transaction caused the shortage or that anyone acted improperly.

## Implemented interaction

`client/src/pages/AgentView.tsx` now finds the first matching
`unusual_transaction` alert and places a **Review supporting activity** button
inside the pressure card. Selecting it:

- scrolls to the exact `InclusiveAlertCard` for that alert;
- moves keyboard focus to the card;
- preserves the selected agent and current provider context;
- exposes the explanation, suggested next step, confidence, and evidence
  disclosure in the same narrative;
- does not mutate data or trigger a financial action.

The destination card has a stable `alert-card-<id>` anchor and `tabIndex=-1` so
keyboard and assistive-technology users receive the same transition.

## Why this is simpler for judges

| Before | After |
|---|---|
| Pressure dial and alerts were separate vertical sections | One pressure warning links directly to its supporting alert |
| Reviewer had to scan the whole page | One click/focus transition identifies the relevant evidence |
| Relationship was implied by proximity | Relationship is explicit but still advisory |
| Evidence could feel like a second feature | Evidence becomes the next sentence in the same story |

## Acceptance criteria

- The warning explains the forward-looking condition first.
- The next action is “Review supporting activity,” never “block,” “freeze,” or
  “transfer.”
- The destination alert describes a statistical difference from the agent's own
  baseline and shows structured evidence.
- The flow preserves provider boundaries and human ownership.
- The link works with keyboard focus and does not require a page reload.

Approval requested: review this connected-insights flow before Phase 2,
Step 3 (language sanitization).
