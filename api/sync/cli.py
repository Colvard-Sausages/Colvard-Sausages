"""
cli.py — `python -m api.sync.cli <command>`

Commands:
  backfill   pull all invoices changed since --since (ISO date); first-run
  cdc        incremental pull since the stored cursor; cron this every 60s
  one        pull a single invoice by id (for ad-hoc reconcile)
  loop       cdc on a fixed interval until ctrl-c (alternative to systemd timer)
  status     show sync_state and recent log entries

All commands require QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REFRESH_TOKEN (once),
QBO_REALM_ID in the environment. See api/sync/qbo_client.py for details.
"""
from __future__ import annotations

import argparse
import logging
import os
import sqlite3
import sys
import time
from datetime import datetime, timedelta, timezone

from .invoices_sync import backfill, cdc_pull, sync_one
from .qbo_client import QboClient

log = logging.getLogger("colvard.sync.cli")


def _connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def _print_result(label: str, r) -> None:
    print(
        f"{label}: inserted={r.inserted} updated={r.updated} "
        f"skipped_stale={r.skipped_stale} soft_deleted={r.soft_deleted} errors={r.errors}"
    )


def cmd_backfill(args: argparse.Namespace) -> int:
    conn = _connect(args.db)
    client = QboClient()
    since = args.since or (datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"backfill from {since}")
    r = backfill(conn, client, since)
    _print_result("backfill", r)
    return 0 if r.errors == 0 else 1


def cmd_cdc(args: argparse.Namespace) -> int:
    conn = _connect(args.db)
    client = QboClient()
    r = cdc_pull(conn, client)
    _print_result("cdc", r)
    return 0 if r.errors == 0 else 1


def cmd_one(args: argparse.Namespace) -> int:
    conn = _connect(args.db)
    client = QboClient()
    r = sync_one(conn, client, args.invoice_id, source="cli")
    _print_result(f"one({args.invoice_id})", r)
    return 0 if r.errors == 0 else 1


def cmd_loop(args: argparse.Namespace) -> int:
    conn = _connect(args.db)
    client = QboClient()
    print(f"loop: cdc every {args.interval}s. ctrl-c to stop.")
    try:
        while True:
            try:
                r = cdc_pull(conn, client)
                if r.inserted or r.updated or r.soft_deleted:
                    _print_result(datetime.now().strftime("%H:%M:%S"), r)
            except Exception as e:
                log.exception("loop iteration failed")
                print(f"error: {e}", file=sys.stderr)
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nstopped")
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    conn = _connect(args.db)
    print("=== invoice_sync_state ===")
    rows = conn.execute(
        "SELECT realm_id, last_full_sync_utc, last_cdc_cursor_utc, last_webhook_utc, "
        " full_sync_count, error_count_24h FROM invoice_sync_state"
    ).fetchall()
    for row in rows:
        print(dict(zip(
            ["realm_id", "last_full_sync_utc", "last_cdc_cursor_utc", "last_webhook_utc",
             "full_sync_count", "error_count_24h"],
            row,
        )))
    print()
    print(f"=== last {args.log_limit} invoice_sync_log rows ===")
    for row in conn.execute(
        "SELECT ts_utc, event_type, qbo_id, action, error_message FROM invoice_sync_log "
        "ORDER BY id DESC LIMIT ?", (args.log_limit,)
    ):
        print(row)
    print()
    counts = conn.execute(
        "SELECT COUNT(*), COUNT(CASE WHEN balance_cents>0 THEN 1 END), "
        "       COUNT(CASE WHEN deleted_utc IS NOT NULL THEN 1 END), "
        "       COUNT(CASE WHEN is_voided=1 THEN 1 END) "
        "FROM invoices"
    ).fetchone()
    print(f"invoices: total={counts[0]} open={counts[1]} deleted={counts[2]} voided={counts[3]}")
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"),
                        format="%(asctime)s %(levelname)s %(name)s %(message)s")
    p = argparse.ArgumentParser(prog="python -m api.sync.cli")
    p.add_argument("--db", default=os.environ.get("COLVARD_DB_PATH", "master.db"))

    sub = p.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("backfill", help="full sweep since --since (default 90d)")
    b.add_argument("--since", help="ISO date or datetime")
    b.set_defaults(func=cmd_backfill)

    c = sub.add_parser("cdc", help="incremental pull since stored cursor")
    c.set_defaults(func=cmd_cdc)

    o = sub.add_parser("one", help="pull a single invoice by id")
    o.add_argument("invoice_id")
    o.set_defaults(func=cmd_one)

    lo = sub.add_parser("loop", help="cdc on a fixed interval")
    lo.add_argument("--interval", type=int, default=60)
    lo.set_defaults(func=cmd_loop)

    s = sub.add_parser("status", help="show sync state + recent log")
    s.add_argument("--log-limit", type=int, default=10)
    s.set_defaults(func=cmd_status)

    args = p.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
