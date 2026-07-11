# Final polish — Phase 3, Step 5

## Three-minute story-driven demo script

Scenario: Eid afternoon demand peak. Audience: hackathon judges.

### 0:00–0:25 — Set the problem

“Imagine Eid afternoon. Customers are arriving for cash-out, but this agent is
serving three mobile-money providers from one physical cash drawer. The
complexity is easy to miss: the drawer is shared, while bKash, Nagad, and Rocket
floats are separate. CashLens is designed to make that distinction visible in
one glance.”

Sign in as `agent.demo` and show the agent dashboard.

### 0:25–0:55 — Make the multi-provider situation simple

“The green area is the shared physical cash available for every provider's
cash-out. Beside it are three independent e-money floats. We do not add them
together as if they were interchangeable. Each float has its own balance,
forecast need, feed state, and shortage estimate.”

Point to the pressure dial and the four-hour projected cash-out need.

“The question is not only ‘what is the balance now?’ It is ‘what may become
constrained next, and when?’”

### 0:55–1:25 — Show forward-looking liquidity insight

“The forecast uses recent rolling demand to estimate the next four hours. Here,
the shared drawer is projected to come under pressure during the peak. That is
an early-warning signal, not an instruction to move money.”

Point out the shortage ETA, confidence, and any stale/unconfirmed feed marker.

“If a provider feed is stale or missing, CashLens does not invent a zero or a
healthy number. It marks the value uncertain and lowers confidence.”

### 1:25–1:55 — Connect pressure to unusual activity

Click **Review supporting activity**.

“Now the product connects the story. Instead of making the reviewer search a
separate alert queue, the liquidity warning takes us directly to the supporting
activity for this same agent. We can see the transaction type, amount, usual
baseline, deviation, and time.”

“The wording is deliberate: this is unusual compared with the agent's own
history. It is a statistical signal, not proof of wrongdoing and not a final
fraud decision.”

Open the evidence disclosure and point to the structured signals.

### 1:55–2:25 — Hand off to the right human owner

Sign out through the CashLens logo and sign in as `ops.bkash`.

“The provider operations team receives the relevant queue. Their provider scope
is enforced by the server; another provider's exact balance is not exposed.”

Open the case and say:

“Operations can acknowledge the signal or escalate it with a written note. The
system records ownership and status, but it does not call a provider API, move
cash, request a top-up automatically, freeze a wallet, or block an account.”

Acknowledge, then escalate with a note.

### 2:25–2:50 — Human review and resolution

Sign in as `risk.reviewer` and open the escalated case.

“The risk analyst receives the evidence, the operations note, and the case
history. They can record feedback such as contextual spike or false positive,
then resolve the case with a human disposition.”

Resolve the case and show the visible `resolved` status plus workflow timeline.

### 2:50–3:00 — Close with the boundary

“CashLens turns a complicated multi-provider situation into one understandable
story: shared cash pressure, supporting activity evidence, and a traceable human
handoff. Everything here is synthetic. The prototype advises; people decide;
no financial action is executed automatically.”

## Judge-facing proof points

- **Simplicity:** one shared drawer is visually separated from three provider
  floats.
- **Innovation:** a forward-looking shortage signal links directly to its
  supporting unusual-activity evidence.
- **Explainability:** baseline, deviation, time, confidence, and uncertainty are
  visible.
- **Coordination:** provider operations owns the first response; risk owns the
  escalated review.
- **Safety:** the API reports `human_review_only`, `financialMovement: "none"`,
  and `providerBoundaryEnforced: true`.
- **Honesty:** all metrics and scenarios are synthetic, reproducible, and
  accompanied by false-positive and uncertainty limitations.

## If the demo is short on time

Show only three screens: agent capacity board, linked supporting alert, and
risk case resolved with the audit timeline. Say the final boundary sentence
verbatim. Do not spend time on login mechanics, secondary metrics, or optional
AI configuration unless a judge asks.
