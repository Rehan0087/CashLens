# Data Simulation Note

All data in CashLens is synthetic. The seed uses a fixed PRNG seed so the same demo can be reproduced across machines.

## Synthetic Entities

- Agents are generated across Bangladesh-style operating areas.
- Providers are represented as separate bKash, Nagad, and Rocket float balances.
- Physical cash is modeled as one shared drawer per agent.
- Transactions are generated over a multi-day baseline plus a focused demo day.

## Injected Conditions

The dataset deliberately includes readable scenarios:

- liquidity pressure on a shared cash drawer
- provider float pressure
- stale provider balance feeds
- cross-provider imbalance
- unusual transaction volume and timing

These labels are used only by the metrics harness. The detector does not read the labels while producing alerts.

## Safety Boundary

The synthetic data contains no real accounts, customers, balances, credentials, or provider API connections.
