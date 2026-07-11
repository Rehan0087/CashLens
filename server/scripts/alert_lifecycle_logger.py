#!/usr/bin/env python3
"""Emit CashLens alert lifecycle and health records as JSONL.

This read-only observer is intended for Ubuntu/Linux terminals, cron jobs, or a
small log shipper. It reads the SQLite audit tables and never updates alerts,
assignments, feedback, or balances.

Examples:
  python3 server/scripts/alert_lifecycle_logger.py --once
  python3 server/scripts/alert_lifecycle_logger.py --follow --interval 5 \
    --output /var/log/cashlens-alerts.jsonl
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, TextIO


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def json_value(value: Any) -> Any:
    """Convert SQLite values to stable JSON values without leaking row objects."""

    return value if value is None or isinstance(value, (str, int, float, bool)) else str(value)


class LifecycleLogger:
    def __init__(self, database: Path, output: TextIO, since: str = "") -> None:
        self.database = database
        self.output = output
        self.cursors = {
            "alert_created": (since, 0),
            "workflow_transition": (since, 0),
            "review_feedback": (since, 0),
        }

    def connect(self) -> sqlite3.Connection:
        if not self.database.exists():
            raise FileNotFoundError(f"database not found: {self.database}")
        connection = sqlite3.connect(f"file:{self.database}?mode=ro", uri=True, timeout=5)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 5000")
        return connection

    def emit(self, event: str, payload: dict[str, Any]) -> None:
        record = {
            "loggedAt": utc_now(),
            "service": "cashlens-alert-lifecycle",
            "event": event,
            **{key: json_value(value) for key, value in payload.items()},
        }
        self.output.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
        self.output.flush()

    def _new_rows(self, connection: sqlite3.Connection, key: str, sql: str) -> list[sqlite3.Row]:
        last_time, last_rowid = self.cursors[key]
        rows = connection.execute(sql, (last_time, last_time, last_rowid)).fetchall()
        if rows:
            self.cursors[key] = (str(rows[-1]["created_at"]), int(rows[-1]["_rowid"]))
        return rows

    def emit_lifecycle(self, connection: sqlite3.Connection) -> int:
        emitted = 0
        alert_rows = self._new_rows(
            connection,
            "alert_created",
            """
            SELECT rowid AS _rowid, id, provider_id, type, severity, confidence, status, assigned_role, created_at
            FROM alerts
            WHERE (created_at > ? OR (created_at = ? AND id > ?))
            ORDER BY created_at, id
            """,
        )
        for row in alert_rows:
            self.emit(
                "alert_created",
                {
                    "alertId": row["id"],
                    "providerScope": row["provider_id"],
                    "alertType": row["type"],
                    "severity": row["severity"],
                    "confidence": row["confidence"],
                    "status": row["status"],
                    "assignedRole": row["assigned_role"],
                    "createdAt": row["created_at"],
                },
            )
            emitted += 1

        workflow_rows = self._new_rows(
            connection,
            "workflow_transition",
            """
            SELECT rowid AS _rowid, id, alert_id, actor_role, action, from_status, to_status,
                   from_assigned_role, to_assigned_role, note, created_at
            FROM alert_workflow_events
            WHERE (created_at > ? OR (created_at = ? AND id > ?))
            ORDER BY created_at, id
            """,
        )
        for row in workflow_rows:
            self.emit(
                "alert_lifecycle_transition",
                {
                    "eventId": row["id"],
                    "alertId": row["alert_id"],
                    "actorRole": row["actor_role"],
                    "action": row["action"],
                    "fromStatus": row["from_status"],
                    "toStatus": row["to_status"],
                    "fromOwner": row["from_assigned_role"],
                    "toOwner": row["to_assigned_role"],
                    "note": row["note"],
                    "createdAt": row["created_at"],
                },
            )
            emitted += 1

        feedback_rows = self._new_rows(
            connection,
            "review_feedback",
            """
            SELECT rowid AS _rowid, id, alert_id, reviewer_role, outcome, rule_version, note, created_at
            FROM alert_feedback
            WHERE (created_at > ? OR (created_at = ? AND id > ?))
            ORDER BY created_at, id
            """,
        )
        for row in feedback_rows:
            self.emit(
                "alert_review_feedback",
                {
                    "feedbackId": row["id"],
                    "alertId": row["alert_id"],
                    "reviewerRole": row["reviewer_role"],
                    "outcome": row["outcome"],
                    "ruleVersion": row["rule_version"],
                    "note": row["note"],
                    "createdAt": row["created_at"],
                },
            )
            emitted += 1

        return emitted

    def emit_health(self, connection: sqlite3.Connection) -> None:
        started = time.perf_counter()
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        counts = connection.execute(
            """
            SELECT
              (SELECT COUNT(*) FROM alerts) AS alerts,
              (SELECT COUNT(*) FROM alerts WHERE status <> 'resolved') AS open_alerts,
              (SELECT COUNT(*) FROM alert_workflow_events) AS workflow_events,
              (SELECT COUNT(*) FROM alert_feedback) AS feedback_rows
            """
        ).fetchone()
        self.emit(
            "system_health",
            {
                "database": str(self.database),
                "integrity": integrity,
                "healthy": integrity == "ok",
                "alertCount": counts["alerts"],
                "openAlertCount": counts["open_alerts"],
                "workflowEventCount": counts["workflow_events"],
                "feedbackCount": counts["feedback_rows"],
                "queryMs": round((time.perf_counter() - started) * 1000, 2),
            },
        )

    def poll(self) -> None:
        connection = self.connect()
        try:
            self.emit_lifecycle(connection)
            self.emit_health(connection)
        finally:
            connection.close()


def arguments() -> argparse.Namespace:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=root / "data" / "cashlens.sqlite3", help="SQLite database path")
    parser.add_argument("--output", type=Path, help="JSONL output path; stdout is used by default")
    parser.add_argument("--since", default="", help="Only emit rows after this ISO-8601 timestamp")
    parser.add_argument("--once", action="store_true", help="Emit one snapshot and exit (the default)")
    parser.add_argument("--follow", action="store_true", help="Continue polling for new lifecycle events")
    parser.add_argument("--interval", type=float, default=5.0, help="Polling interval in seconds when --follow is used")
    return parser.parse_args()


def main() -> int:
    args = arguments()
    if args.interval <= 0:
        print("--interval must be greater than zero", file=sys.stderr)
        return 2

    output: TextIO = sys.stdout
    close_output = False
    try:
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            output = args.output.open("a", encoding="utf-8", buffering=1)
            close_output = True

        logger = LifecycleLogger(args.db, output, args.since)
        while True:
            try:
                logger.poll()
            except (OSError, sqlite3.Error) as error:
                logger.emit("logger_error", {"database": str(args.db), "error": str(error)})
                if not args.follow:
                    return 1
            if not args.follow:
                return 0
            time.sleep(args.interval)
    except KeyboardInterrupt:
        return 0
    finally:
        if close_output:
            output.close()


if __name__ == "__main__":
    raise SystemExit(main())
