# Final polish — Phase 1, Step 1

## Simplicity audit: multi-provider dashboard

Status: UX proposal for review. The connected warning-to-evidence journey and
copywriting phases are intentionally not changed here.

## Current audit

The existing `DrawerBar` is the right visual metaphor: one green physical-cash
segment beside three provider-colored segments. The current `AgentView` also
shows provider cards and a pressure dial.

One element is potentially misleading for a judge: the hero headline called
`Total serviceable value` adds physical cash and all provider floats into one
large number. Although the note says wallets are not merged, a viewer can read
the large total as a transferable pool. The first screen should make separation
more prominent than the sum.

## Proposed at-a-glance component

Use one compact “capacity board” with a single shared-cash card and a three-card
provider row. Keep the drawer strip as a small visual bridge, but remove the
combined total from the primary hierarchy.

```tsx
<section aria-labelledby="capacity-board-title" className="capacity-board">
  <header className="capacity-board__header">
    <div>
      <p className="eyebrow">TODAY'S CAPACITY VIEW</p>
      <h2 id="capacity-board-title">One drawer · three separate floats</h2>
    </div>
    <span className="boundary-chip">Wallets stay separate</span>
  </header>

  <div className="capacity-board__grid">
    <article className="capacity-card capacity-card--cash">
      <span className="capacity-card__eyebrow">SHARED PHYSICAL CASH</span>
      <strong className="capacity-card__amount">৳{cashOnHand}</strong>
      <div className="capacity-meter" aria-label="Projected cash-out versus shared cash">
        <span style={{ width: `${cashPressurePercent}%` }} />
      </div>
      <p>Next 4h cash-out need: ৳{projectedOutflow}</p>
      <StatusPill level={cashLevel} />
      <small>Every provider's customer cash-outs use this one drawer.</small>
    </article>

    <div className="provider-float-grid" aria-label="Separate provider e-money floats">
      {providers.map((provider) => (
        <article className="capacity-card capacity-card--provider" key={provider.providerId}>
          <div className="provider-heading">
            <ProviderDot providerId={provider.providerId} />
            <span>{provider.providerName}</span>
            <span className="separate-label">SEPARATE FLOAT</span>
          </div>
          <strong className="capacity-card__amount">৳{provider.balance}</strong>
          <p>Next 4h need: ৳{provider.projectedInflowNeed}</p>
          <p className="capacity-card__eta">{shortageEta(provider.estimatedShortageMinutes)}</p>
          <StatusPill level={provider.level} />
          {provider.stale && <span className="unconfirmed">Unconfirmed feed</span>}
        </article>
      ))}
    </div>
  </div>

  <footer className="capacity-board__legend">
    <span className="legend-line legend-line--cash">Shared cash can serve all providers.</span>
    <span className="legend-line legend-line--provider">Provider e-money cannot be transferred between wallets.</span>
  </footer>
</section>
```

The repository uses a small custom CSS system rather than Tailwind. The
Tailwind-style names above map directly to existing CSS variables:

```css
.capacity-board__grid { display: grid; grid-template-columns: minmax(220px, .8fr) 1.6fr; gap: 12px; }
.provider-float-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.capacity-card { border: 1px solid var(--line); border-radius: var(--r-lg); padding: 16px; background: var(--panel); }
.capacity-card--cash { border-top: 3px solid var(--cash); }
.capacity-card--provider { border-top: 3px solid var(--provider-color); }
.separate-label { color: var(--mute); font: 10px var(--font-mono); letter-spacing: .08em; }
```

On narrow screens, the shared-cash card stays first and the provider cards stack
under it. That preserves the reading order: shared physical capacity first,
then each independent float.

## Information hierarchy

1. **Shared physical cash** — the one common constraint.
2. **Three separate provider floats** — independent balances and forecast needs.
3. **Pressure/ETA** — what may become constrained and when.
4. **Evidence link** — why the warning exists, without implying guilt.
5. **What-if and detailed timeline** — secondary controls below the first-glance
   capacity board.

The primary card should not show a summed `cash + all floats` value. If a total is
needed for a management aggregate, label it explicitly as “non-transferable
reference total” and keep it visually subordinate.

## UX acceptance criteria

- A judge can answer “what is shared?” in under two seconds: the green card is
  labeled **SHARED PHYSICAL CASH**.
- A judge can answer “what is separate?” without reading body copy: each provider
  card has its own color and **SEPARATE FLOAT** label.
- No bar, headline, or action implies a provider wallet can replenish another.
- A stale or masked provider value shows `—`/`Unconfirmed`, never `0`.
- Pressure and shortage ETA remain visible without opening another page.
- Keyboard and screen-reader users receive the same shared/separate distinction
  through headings, labels, and `aria-label` text.

## Review conclusion

The existing drawer metaphor should be retained, but the combined total should be
demoted or removed from the agent hero. The capacity board above makes the
platform's core insight visually undeniable: one shared cash constraint sits
beside three independently constrained provider floats.

Approval requested: review this simplicity proposal before Phase 1, Step 2.
