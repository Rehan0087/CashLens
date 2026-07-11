# Final polish — Phase 2, Step 4

## Coordination without execution

Status: implemented and verified for review.

## Coordination contract

The coordination feature changes only case ownership, status, notes, and human
feedback. It does not perform a financial operation.

Every case detail and successful action response now includes:

```json
{
  "coordination": {
    "mode": "human_review_only",
    "recommendationOnly": true,
    "executedOperation": null,
    "financialMovement": "none",
    "providerBoundaryEnforced": true,
    "note": "This workflow records human coordination and case status only; it does not move money or change an account."
  }
}
```

This gives judges an explicit API-level proof that an escalation is not a hidden
transfer or provider override.

## Final UI state

The case panel displays:

> Coordination recommendation only — no transfer, top-up, freeze, or account
> action was executed.

The message appears beside the evidence and suggested next step, so the user can
distinguish:

1. what the detector observed;
2. what the system recommends reviewing;
3. what the human coordinator recorded; and
4. what the system explicitly did not execute.

## API behavior

### Read context

`GET /api/planning/context` returns forecast context only. It includes
`advisoryOnly: true` and prohibited automation names. Provider masking is applied
before the response leaves the server.

### Case actions

`POST /api/alerts/:id/action` accepts only the workflow actions:

- `acknowledge`;
- `escalate`;
- `resolve`.

The route updates the alert status/owner and appends audit records. It has no
code path to a provider API, wallet ledger, cash ledger, transfer service, or
account-control service. Its response returns `financialMovement: "none"`.

### Human feedback

`POST /api/alerts/:id/feedback` records a reviewer label and note. It does not
change a balance, retrain a model, or automatically change case status.

## Provider-boundary proof

The server checks the authenticated session before an action:

- provider operations can act only on its own provider or a cross-provider alert;
- risk analysts can act only on escalated/resolved review cases;
- agents, FSP users, and management cannot mutate cases;
- client query parameters cannot change the role or provider scope;
- other providers' exact balances remain masked in context and case responses.

The workflow therefore coordinates the correct stakeholder without pretending
that one provider can operate another provider's wallet.

## Acceptance criteria

- Successful action responses explicitly report recommendation-only mode.
- Case UI visibly states that no financial or account operation was executed.
- Provider boundary enforcement remains server-side.
- Workflow status and ownership remain auditable through notes and events.
- No route calls or exposes a financial transfer operation.

Approval requested: review this coordination safeguard before Phase 3, Step 5
(the final presentation script).
