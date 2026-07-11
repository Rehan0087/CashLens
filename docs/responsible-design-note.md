# Responsible Design Note

CashLens is decision support, not automated enforcement.

## Explicit Limits

The prototype cannot:

- move money
- merge provider wallets
- block accounts
- identify a real customer
- call a provider API
- declare someone a fraudster

## Human Review

Alerts include confidence, evidence, uncertainty, and a suggested next step. Risk and operations users must record notes for escalation and resolution so the audit trail stays visible.

## Data Minimization

Provider operations users see their own provider balance exactly, but other providers' balances are masked. Management sees aggregate counts and pressure indexes, not balances or case details.

## Input Reliability

Missing, stale, or inconsistent provider feeds are marked as degraded input. They are never interpreted as a zero balance.
