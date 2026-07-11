# Requirements Traceability — CashLens ↔ Challenge Brief

This maps the *Super Agent Liquidity & Risk Intelligence Platform* brief (bKash ·
SUST CSE Carnival 2026) to concrete implementation. Section numbers follow the brief.

---

## §5 Intended Users and Stakeholders

The brief defines "Operations Team" as *the people who help agents keep serving
customers* — a general challenge role, not any provider's real org chart. All six brief
stakeholders are represented: **five authenticated demo identities/roles** in the landing sign-in, plus
**Customers** as the acknowledged beneficiary (shown on the role screen, deliberately not
an operator). Each role's visibility boundary is **enforced in the API**
(`server/src/routes/*` + `maskLiquidityForRole`), not just hidden in the UI.

| Stakeholder (brief) | Need (brief) | Role · where it lives | Boundary enforced (API) |
|---|---|---|---|
| Multi-provider agent | See physical cash and each provider balance together; understand upcoming pressure; know what action may be needed | `agent` · `client/src/pages/AgentView.tsx` — drawer bar, pressure dial, per-provider ETA, what-if | Sees only their own outlet |
| Provider operations / network coordination team | Monitor assigned agents, review alerts, contact the right agent, coordinate approved support, track the case to closure | `provider_ops` · `client/src/pages/OpsView.tsx` — alert queue, filters, case drawer, acknowledge/escalate | Own provider's alerts + cross-provider ones; **other providers' balances masked to direction only** |
| Risk or compliance analyst | Review unusual activity with evidence and context; ops may escalate but must **not** make the final fraud decision | `risk_analyst` · `client/src/pages/RiskView.tsx` — escalated queue, evidence band, disposition + resolve | Only role that can resolve an unusual-transaction case |
| Financial service provider | Understand provider-specific service pressure while keeping provider data and authority separate | `financial_service_provider` · `client/src/pages/FspView.tsx` — provider readiness, float-pressure list, KPIs | Sees only its **own** provider's pressure; others masked; **no case list, no what-if** (403 aggregates-only) |
| Management | See area-level service risk, recurring problems, overall readiness | `fsp_management` · `client/src/pages/MgmtView.tsx` — area hotspots, provider counts, validation + observability | **Counts only, never balances or case detail** |
| Customers | Receive more reliable service from their preferred provider | Acknowledged beneficiary on `RoleSelect` + framed as the FSP view's "customer service at risk" indicator | Served, never surveilled — no customer data exists in the system |

The prototype shows one combined outlet view but **never suggests one provider can
control another provider's balance, data, or decisions** (brief §5). The Financial
service provider and Management are distinct roles here precisely because the brief
lists them as distinct stakeholders with distinct needs (provider-specific pressure vs.
area-level readiness) — they are not conflated into one "FSP Management" screen.

---

## §6 Scope of the Challenge

**In scope** (all present):

| In-scope item | Implementation |
|---|---|
| Simulated ecosystem with ≥2 logically separate providers | 3 providers (bKash, Nagad, Rocket), separate rows/balances — `simulation/syntheticDataGenerator.ts` |
| Shared physical cash + provider-specific electronic balances | `agents.physical_cash` (one drawer) + `agent_provider_balances` (per provider) |
| Provider-aware demand, liquidity risk, projected service pressure, confidence | `engine/liquidityScorer.ts` — EWRH burn-rate projection, per-provider score, confidence engine |
| Anomaly / risk indicators (transaction, timing, balance, area, behavioral) | `engine/detectors.ts` — z-score, odd-hour, imbalance, data-quality |
| Human-review workflows, explanations, evidence, safe recommendations | `engine/workflow.ts`, `i18n/explanations.ts`, `CasePanel.tsx` |
| Provider-aware coordination (routing, ownership, ack, escalation, resolution tracking) | `routes/alerts.ts` `/action`, `case_notes` audit trail |
| Web prototype interface | React + Vite client |
| Testing, monitoring, evaluation, documented limitations | `engine/metrics.ts`, `observability.ts`, this doc + `docs/*` |

**Out of scope** (all respected — see also §14 guardrails):

- No real interoperability, settlement, or conversion between wallets — no such code path exists.
- No production APIs, real identities, real balances, or real accounts — 100% synthetic seed.
- No automatic blocking, accusation, disciplinary action, or final fraud determination.
- No unauthorized cash movement, refill, transfer, recovery, or reversal.
- No collection of real PINs, OTPs, or production credentials — only salted hashes for synthetic demo identities are stored.
- No claim of regulatory approval or production fraud-detection readiness — stated in `responsible-design-note.md`.

---

## §7 Functional Expectations

| Priority | Expected capability (brief) | Status | Evidence |
|---|---|---|---|
| Mandatory | Show shared physical cash and separate balances per provider | ✅ | Drawer bar renders one cash pool + three float segments, never merged |
| Mandatory | Show which provider or shared cash reserve may face a shortage and approximately **when** | ✅ | `estimateShortageMinutes` / `cashShortageMinutes` → ETA on pressure dial + provider pills |
| Mandatory | Detect ≥1 type of unusual activity and show why it was flagged | ✅ | 4 detectors; evidence band + structured signals in `CasePanel` |
| Mandatory | Use careful language ("unusual" / "requires review"); do not declare fraud | ✅ | `explanations.ts` wording; the word "fraud" appears in no alert |
| Mandatory | For ≥1 important alert: who receives it, who owns it, recommended next step, final status | ✅ | Scenario D; `assigned_role`, suggested action, status chip, audit trail |
| Mandatory | Show lower confidence / safe fallback when data is missing, late, or conflicting | ✅ | `assessProviderInput` (fresh/stale/missing/inconsistent), confidence × 0.65, "unconfirmed" badge |
| Mandatory | Use AI/APIs/analytics/data-processing as a meaningful part of the product | ✅ | Statistical engine (EWRH projection, z-score, EMA burn-rate) drives every alert |
| Recommended | Filter or prioritize by provider, agent, area, time | ✅ | Ops queue filters + sort; management area/provider breakdown |
| Recommended | Provide evidence and a simple history for important alerts | ✅ | Evidence band + `case_notes` timeline |
| Recommended | Offer clear Bengali, Banglish, or English explanations | ✅ | Every alert + UI string in all three (`i18n/`) |
| Recommended | Show ≥1 simple Bengali/Banglish alert with situation, evidence, uncertainty, safe next step | ✅ | Bengali liquidity + unusual alerts (matches brief's illustrative outputs) |
| Recommended | Provider-specific escalation, case notes, alert history with clear boundaries | ✅ | `workflow.ts` authority rules + masked context |
| Optional | Simulations, peer comparison, relationship / cross-provider patterns | ◐ | What-if demand simulation + cross-provider imbalance detection |
| Optional | Teams independently select/implement anomaly-detection scenarios (documented, simulated, not presented as proof of fraud) | ✅ | Documented in `data-simulation-note.md`; scores never labeled fraud |

Legend: ✅ implemented · ◐ partially (what-if + imbalance; no peer-graph view).

---

## §8 Non-Functional Expectations

| Area (brief) | Expectation | How CashLens meets it |
|---|---|---|
| Usability | Provider distinctions, shared-cash exposure, risk signals easy to understand | Drawer bar (colour-coded per provider), pressure dial, plain-language trilingual alerts |
| Performance | Core analytics/dashboard responsive at the demonstrated volume | Full detection pass ~8 ms; dashboard-assembly p95 ~2 ms; API read p95 tracked (`metrics.performance`) |
| Reliability | Provider data failures/inconsistencies must not silently produce confident conclusions | `assessProviderInput` classifies fresh/stale/missing/inconsistent; degraded input → reduced confidence + "unconfirmed", never zero-filled |
| Explainability | Every high-impact alert exposes reason, evidence, uncertainty | `evidence_json` (signals + explanation + suggested action + confidence); explanation-coverage metric |
| Security & privacy | Synthetic identifiers; no real credentials/identities/account data | Demo identities use salted password hashes, HttpOnly sessions, server-side scope, and no production credentials |
| Fairness & responsible AI | Avoid unsupported profiling; demonstrate human review | Per-agent baselines (not cross-agent), <10-tx agents exempted; note-gated human workflow |
| Auditability | Alerts, ownership changes, acks, escalations, evidence, resolutions traceable | Append-only `case_notes`; per-request structured logs + trace ids (`observability.ts`) |
| Interoperability | Represent multiple providers without assuming real technical integration | Providers are logically separate rows; no integration is implied or attempted |

---

## §11 Demonstration Scenarios (A–D)

All four are computed from live seeded data by `server/src/engine/scenarios.ts` and
presented as a guided walkthrough (`client/src/pages/ScenariosView.tsx`) that
deep-links to the exact agent or case. Open **Guided scenarios** in the app.

| Scenario | Brief summary | In-app target (seed 42) | What it demonstrates |
|---|---|---|---|
| **A — Hidden provider shortage** | Totals look healthy but one provider's e-money is about to run out; show which, when, how certain, safe next step | Agent *Karim Y.* — total ≈ ৳127k healthy, but Rocket float ≈ ৳609 | Drawer bar exposes the tiny segment; imbalance alert; wallets stay separate |
| **B — Liquidity pressure with unusual activity** | Physical cash falling fast **and** one provider shows a sudden spike; show both, explain normal reasons, recommend review | Agent *Beauty U.* — cash-out pressure high (ETA ≈ 1h) + a 6–7σ unusual transaction | Pressure dial + unusual alert on one agent; "requires review", never "fraud" |
| **C — Cross-provider / data inconsistency** | Feeds arrive late or conflict; warn, reduce confidence, keep balances separate, avoid misleading advice | Agent *Rahim M.* — bKash feed hours stale + Nagad feed future-dated (inconsistent) | Both marked "unconfirmed", confidence reduced, input never treated as zero |
| **D — Coordinated response and closure** | High-priority alert on one provider; show who receives, who owns, recommended action, ack, resolved/escalated | Opens a high-severity provider case in Ops | Routing → ownership → acknowledge → escalate (note) → risk resolves; full audit trail |

The guided banner states each scenario and "what to notice", and every alert is an
**advisory message, not a financial command** (brief §11).

---

## §12 Success Metrics (≥3 required; 8 provided)

Computed by `server/src/engine/metrics.ts` (`npm run metrics`), shown live in the
Management view, and written to `docs/validation-evidence.md`.

| Brief metric | CashLens metric |
|---|---|
| Provider-level demand or balance error | Provider forecast demand MAPE on held-out scenarios |
| Shortage detection lead time | Average / minimum warning lead minutes before projected shortage |
| Anomaly precision and recall | Precision + recall on labeled injected anomalies |
| False-positive rate | Normal demo-day transactions incorrectly flagged (Eid-rush kept below threshold) |
| Alert explanation coverage | % of alerts with reason + evidence + uncertainty |
| API or processing latency | Engine run time, dashboard p95, API read-path p95 |
| Reliability and observability | Provider-input health (missing/stale/inconsistent) + per-route counters/latency |

---

## §13 Evaluation Criteria — self-assessment

| Category (weight) | Where we're strong |
|---|---|
| Problem understanding & ecosystem relevance (15%) | This traceability doc, stakeholder-scoped roles, one-drawer/three-float framing, provider boundaries |
| Innovation & decision value (20%) | Unified drawer bar, EWRH shortage ETA, what-if, unconfirmed-feed discounting, guided A–D |
| Technical implementation & integration (25%) | TS end-to-end, API-enforced masking, pure-function engine, workflow state machine, observability, reproducible seed |
| Data & analytical quality (20%) | Labeled ground truth, deliberately-missed subtle anomalies, threshold sweep, per-agent baselines, honest FPR |
| UX & explainability (10%) | Evidence bands, trilingual plain-language alerts, confidence bars, status/severity system |
| Security, privacy, fairness, responsible design (5%) | `responsible-design-note.md`, refusal list, per-agent fairness, careful language |
| Presentation & demonstration (5%) | Guided scenarios A–D + `demo-script.md` |

---

## §14 Constraints & Guardrails — compliance

All satisfied: simulated data only · providers logically separate, no conversion/settlement ·
no real wallets/accounts/infrastructure · no real PINs/OTPs/credentials (demo hashes only) · risk signals advisory,
never a final fraud determination · no automatic block/freeze/accuse/initiate · coordination
may notify/assign/escalate/recommend/track but never bypasses authorization, exposes another
provider's confidential data, or transfers liquidity · assumptions, synthetic patterns, test
conditions, limitations, and expected false positives documented in `docs/`.

---

## §16 Submission Checklist — status

| Item | Status |
|---|---|
| ≥2 provider contexts represented distinctly | ✅ 3 providers |
| Shared cash + provider-specific balances demonstrated | ✅ drawer bar |
| Forward-looking liquidity insight demonstrated | ✅ 4h projection + ETA |
| ≥1 anomaly category with evidence | ✅ 4 categories |
| Human-review + careful risk language | ✅ workflow + wording |
| ≥1 alert with routing, ownership, ack/escalation, visible resolution | ✅ Scenario D |
| Repository, data, README, architecture complete | ✅ `README.md`, `docs/architecture-diagram.md` |
| ≥3 metrics measured and explained | ✅ 8 metrics |
| Failure, uncertainty, false-positive considerations shown | ✅ data-quality states + threshold sweep |
| Safety, privacy, boundaries, limitations stated | ✅ `responsible-design-note.md` |
| Final presentation ready | ✅ `demo-script.md` |
