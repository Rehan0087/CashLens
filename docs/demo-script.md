# Demo Script

## 0. Guided Scenarios A–D (recommended demo path)

Sign in as `agent.demo`, then open **Guided scenarios** from the agent workspace. Walk the four brief scenarios in order;
each card jumps to the exact agent or case and a banner states what to notice.

- **A · Hidden provider shortage** — Agent view: the drawer bar total looks healthy, but
  one provider float segment is tiny. Point out that wallets stay separate — no transfer
  is suggested.
- **B · Liquidity pressure with unusual activity** — Agent view: the cash-out pressure dial
  is high (with an ETA) *and* an unusual-transaction alert sits in the same list. Note the
  language is "requires review", never "fraud".
- **C · Cross-provider / data inconsistency** — Agent view: one feed is hours stale, another
  is future-dated (inconsistent). Both are "unconfirmed" and confidence is reduced — input
  is never treated as a zero balance.
- **D · Coordinated response and closure** — sign out through the CashLens logo, sign in as
  `ops.bkash`, and open a high-severity case: who receives it, who owns it, the recommended
  step, the status. Acknowledge → escalate with a note → sign out and sign in as
  `risk.reviewer` to resolve. Show the audit trail.

Then use the role-by-role script below to go deeper.

## 1. Agent View

Pick an agent with visible liquidity pressure. Show that physical cash and provider floats are separate, and use the what-if slider to stress demand.

## 2. Provider Ops View

Sign in as `ops.bkash`. Review the alert queue, evidence, masked balances for other providers, and workflow actions. Acknowledge or escalate with a note.

## 3. Risk Analyst View

Sign in as `risk.reviewer`. Open escalated cases, review the evidence band and notes, then resolve with a written disposition.

## 4. Management View

Sign in as `management`. Review area hotspots, provider counts, validation metrics, and observability. Management sees aggregates, not individual balances.

## 5. Safety Message

Close by stating that all data is synthetic and the app cannot move money, block accounts, or accuse real people.
