#!/usr/bin/env python3
"""Generate deterministic CashLens demo data as a relational SQL script.

The generated SQL targets server/src/db/schema.sql. It creates providers,
agents, provider balances, transactions, and simulation metadata. Alerts are
intentionally not generated here; the TypeScript detection engine should derive
those from the observed data after loading the seed.
"""

from __future__ import annotations

import argparse
import random
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


PROVIDERS = (
    ("bkash", "bKash"),
    ("nagad", "Nagad"),
    ("rocket", "Rocket"),
)
AREAS = ("Mirpur", "Uttara", "Dhanmondi", "Gulshan", "Mohammadpur", "Savar")
FIRST_NAMES = (
    "Karim",
    "Rahim",
    "Jamal",
    "Salma",
    "Nasrin",
    "Habib",
    "Rina",
    "Faruk",
    "Mizan",
    "Shahid",
    "Lima",
    "Anwar",
    "Beauty",
    "Rafiq",
    "Sultana",
)
SCENARIOS = ("liquidity_pressure", "cross_provider_imbalance", "stale_data", "unusual_transaction")
OPEN_HOUR = 8
SIM_HOUR = 16


def sql_literal(value: Any) -> str:
    """Return a safely quoted SQLite literal for generated demo SQL."""

    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    escaped = str(value).replace("'", "''")
    return f"'{escaped}'"


def iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def bounded_gauss(rng: random.Random, mean: float, stddev: float, minimum: float = 50) -> int:
    return max(int(minimum), round(rng.gauss(mean, stddev)))


def parse_sim_now(raw: str) -> datetime:
    value = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    if value.tzinfo is None:
        raise ValueError("--sim-now must include a timezone offset, for example +06:00")
    return value


def generate(args: argparse.Namespace) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    rng = random.Random(args.seed)
    sim_now = parse_sim_now(args.sim_now)

    agents: list[dict[str, Any]] = []
    balances: list[dict[str, Any]] = []
    transactions: list[dict[str, Any]] = []

    for index in range(args.agents):
        scenario = "normal"
        if index > 0 and index % 4 == 0:
            scenario = SCENARIOS[((index // 4) - 1) % len(SCENARIOS)]
        agents.append(
            {
                "id": f"agent-{index + 1}",
                "name": f"{rng.choice(FIRST_NAMES)} {chr(65 + index % 26)}.",
                "area": rng.choice(AREAS),
                "physical_cash": round(rng.uniform(1500, 4000) if scenario == "liquidity_pressure" else rng.uniform(15000, 60000)),
                "scenario_tag": scenario,
                "baseline_mean": rng.uniform(800, 2500),
                "baseline_stddev": rng.uniform(150, 500),
            }
        )

    for agent in agents:
        for provider_id, _provider_name in PROVIDERS:
            minutes_behind = rng.uniform(1, 20)
            last_synced = sim_now - timedelta(minutes=minutes_behind)
            balance = rng.uniform(5000, 40000)

            if agent["scenario_tag"] == "stale_data":
                if provider_id == "bkash":
                    last_synced = sim_now - timedelta(minutes=rng.uniform(180, 600))
                elif provider_id == "nagad":
                    last_synced = sim_now + timedelta(minutes=rng.uniform(45, 90))
            elif agent["scenario_tag"] == "cross_provider_imbalance":
                balance = rng.uniform(60000, 90000) if provider_id == "bkash" else rng.uniform(500, 2000)

            balances.append(
                {
                    "agent_id": agent["id"],
                    "provider_id": provider_id,
                    "e_money_balance": round(balance),
                    "last_synced_at": iso(last_synced),
                }
            )

    tx_counter = 0
    today_by_agent: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for agent in agents:
        for day_offset in range(args.days - 1, -1, -1):
            day = sim_now - timedelta(days=day_offset)
            demo_day = day_offset == 0
            for _ in range(rng.randint(4, 10)):
                hour = round(rng.gauss(12 if demo_day else 14, 2 if demo_day else 3))
                hour = max(OPEN_HOUR, min((SIM_HOUR - 1) if demo_day else 20, hour))
                timestamp = day.replace(hour=hour, minute=rng.randint(0, 59), second=0, microsecond=0)
                tx_counter += 1
                tx = {
                    "id": f"tx-{tx_counter}",
                    "agent_id": agent["id"],
                    "provider_id": rng.choice(PROVIDERS)[0],
                    "type": "cash_in" if rng.random() > 0.5 else "cash_out",
                    "amount": bounded_gauss(rng, agent["baseline_mean"], agent["baseline_stddev"]),
                    "timestamp": iso(timestamp),
                    "is_synthetic_anomaly": False,
                    "anomaly_kind": None,
                }
                transactions.append(tx)
                if demo_day:
                    today_by_agent[agent["id"]].append(tx)

            if demo_day:
                for _ in range(rng.randint(2, 5)):
                    timestamp = day.replace(hour=rng.randint(13, SIM_HOUR - 1), minute=rng.randint(0, 59), second=0, microsecond=0)
                    tx_counter += 1
                    tx = {
                        "id": f"tx-{tx_counter}",
                        "agent_id": agent["id"],
                        "provider_id": rng.choice(PROVIDERS)[0],
                        "type": "cash_out",
                        "amount": bounded_gauss(rng, agent["baseline_mean"] + 1.5 * agent["baseline_stddev"], 0.4 * agent["baseline_stddev"]),
                        "timestamp": iso(timestamp),
                        "is_synthetic_anomaly": False,
                        "anomaly_kind": None,
                    }
                    transactions.append(tx)
                    today_by_agent[agent["id"]].append(tx)

    for agent in agents:
        todays = today_by_agent[agent["id"]]
        if not todays:
            continue
        mean = agent["baseline_mean"]
        stddev = agent["baseline_stddev"]

        if agent["scenario_tag"] == "unusual_transaction":
            plans = ("volume_spike", "volume_spike", "odd_hour", "subtle_volume")
            for tx, kind in zip(todays[: len(plans)], plans):
                if kind == "odd_hour":
                    current = datetime.fromisoformat(tx["timestamp"].replace("Z", "+00:00"))
                    tx["timestamp"] = iso(current.replace(hour=rng.randint(1, 4), minute=rng.randint(0, 59)))
                elif kind == "subtle_volume":
                    tx["amount"] = round(mean + stddev * rng.uniform(2.1, 2.4))
                else:
                    tx["amount"] = round(mean + stddev * rng.uniform(5, 8))
                tx["is_synthetic_anomaly"] = True
                tx["anomaly_kind"] = kind
        elif agent["scenario_tag"] == "liquidity_pressure":
            todays[0]["amount"] = round(mean + stddev * rng.uniform(5.5, 7.5))
            todays[0]["is_synthetic_anomaly"] = True
            todays[0]["anomaly_kind"] = "volume_spike"

    return agents, balances, transactions


def render_sql(args: argparse.Namespace, agents: list[dict[str, Any]], balances: list[dict[str, Any]], transactions: list[dict[str, Any]]) -> str:
    statements = [
        "-- Generated by server/scripts/generate_synthetic_sql.py",
        f"-- seed={args.seed}; agents={len(agents)}; history_days={args.days}; sim_now={args.sim_now}",
        "PRAGMA foreign_keys = ON;",
        "BEGIN;",
        "DELETE FROM sessions;",
        "DELETE FROM users;",
        "DELETE FROM case_notes;",
        "DELETE FROM alerts;",
        "DELETE FROM transactions;",
        "DELETE FROM agent_provider_balances;",
        "DELETE FROM agents;",
        "DELETE FROM providers;",
        "DELETE FROM sim_meta;",
    ]

    statements.extend(
        f"INSERT INTO providers (id, name) VALUES ({sql_literal(provider_id)}, {sql_literal(name)});"
        for provider_id, name in PROVIDERS
    )
    statements.extend(
        "INSERT INTO agents (id, name, area, physical_cash, scenario_tag) VALUES "
        f"({sql_literal(a['id'])}, {sql_literal(a['name'])}, {sql_literal(a['area'])}, {a['physical_cash']}, {sql_literal(a['scenario_tag'])});"
        for a in agents
    )
    statements.extend(
        "INSERT INTO agent_provider_balances (agent_id, provider_id, e_money_balance, last_synced_at) VALUES "
        f"({sql_literal(b['agent_id'])}, {sql_literal(b['provider_id'])}, {b['e_money_balance']}, {sql_literal(b['last_synced_at'])});"
        for b in balances
    )
    statements.extend(
        "INSERT INTO transactions (id, agent_id, provider_id, type, amount, timestamp, is_synthetic_anomaly, anomaly_kind) VALUES "
        f"({sql_literal(t['id'])}, {sql_literal(t['agent_id'])}, {sql_literal(t['provider_id'])}, {sql_literal(t['type'])}, {t['amount']}, {sql_literal(t['timestamp'])}, {1 if t['is_synthetic_anomaly'] else 0}, {sql_literal(t['anomaly_kind'])});"
        for t in transactions
    )
    statements.extend(
        [
            f"INSERT INTO sim_meta (key, value) VALUES ('sim_now', {sql_literal(args.sim_now)});",
            "INSERT INTO sim_meta (key, value) VALUES ('seeded_by', 'generate_synthetic_sql.py');",
            "COMMIT;",
        ]
    )
    return "\n".join(statements) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--agents", type=int, default=36)
    parser.add_argument("--days", type=int, default=14)
    parser.add_argument("--sim-now", default="2026-07-12T16:00:00+06:00")
    parser.add_argument("--output", default="server/data/synthetic_seed.sql")
    args = parser.parse_args()

    if args.agents < 1 or args.days < 1:
        parser.error("--agents and --days must be positive")
    try:
        parse_sim_now(args.sim_now)
    except ValueError as error:
        parser.error(str(error))

    agents, balances, transactions = generate(args)
    sql = render_sql(args, agents, balances, transactions)
    if args.output == "-":
        sys.stdout.write(sql)
    else:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(sql, encoding="utf-8")

    scenario_counts = Counter(agent["scenario_tag"] for agent in agents)
    anomaly_counts = Counter(tx["anomaly_kind"] for tx in transactions if tx["is_synthetic_anomaly"])
    print(f"Generated {len(agents)} agents, {len(balances)} balances, and {len(transactions)} transactions.", file=sys.stderr)
    print(f"Scenario distribution: {dict(scenario_counts)}", file=sys.stderr)
    print(f"Injected anomaly labels: {dict(anomaly_counts)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
