"""
seed_demo_data.py — populate a master.db with realistic Colvard invoice data
so invoices.html + invoices_api.py can be demoed without QuickBooks credentials.

Usage:
    python scripts/seed_demo_data.py [--db master.db] [--reset]

Customer + item names are drawn from the OPCON RAG audit (real Colvard
counterparties); amounts and timing are synthetic but plausible.
"""
from __future__ import annotations

import argparse
import random
import sqlite3
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = ROOT / "schema" / "invoices.sql"

# Real customer names from the OPCON audit (page 3 + page 4 mentions)
CUSTOMERS = [
    ("c001", "Bar Harbor Cellars", None),
    ("c002", "Barn Door Baking Co. Cafe", None),
    ("c003", "Big Cat's Catering", None),
    ("c004", "Brewster House B&B", None),
    ("c005", "Buck's Harbor Market", None),
    ("c006", "Cafe This Way", None),
    ("c007", "Captain Sawyer's Bed & Breakfast", None),
    ("c008", "College of the Atlantic", None),
    ("c009", "Conant Acres Inc", None),
    ("c010", "Dennis Foodservice", None),
    ("c011", "Finelli Pizzeria", None),
    ("c012", "Footbridge Brewing Company", None),
    ("c013", "Frith Farm", None),
    ("c014", "Hannaford — Bangor", "hpar"),
    ("c015", "Hannaford — Bar Harbor", "hpar"),
    ("c016", "Hannaford — Ellsworth", "hpar"),
    ("c017", "Harbour Cottage Inn", None),
    ("c018", "Hearth and Soul", None),
    ("c019", "Native Maine", None),
    ("c020", "Norumbega Inn", None),
    ("c021", "Rollin' Smoke BBQ Pit", None),
    ("c022", "Town Hill Market", None),
    ("c023", "Upper Valley Produce", None),
]

# Real SKUs / flavors referenced in the audit
ITEMS = [
    ("i01", "Maple Sage Bulk Links 5lb", "MS-5LB-G1", "Gen 1", 24.50),
    ("i02", "Maple Sage 12oz Pack", "MS-12OZ-G2", "Gen 2", 7.99),
    ("i03", "Sweet Italian 12oz Pack", "SI-12OZ-G2", "Gen 2", 7.99),
    ("i04", "Sweet Italian Bulk Links 5lb", "SI-5LB-G1", "Gen 1", 22.50),
    ("i05", "Chorizo Links 1lb", "CH-1LB-G1", "Gen 1", 9.50),
    ("i06", "Chorizo 12oz Pack", "CH-12OZ-G2", "Gen 2", 7.99),
    ("i07", "Hot Italian Bulk 5lb", "HI-5LB-G1", "Gen 1", 22.50),
    ("i08", "Breakfast Patties 1lb", "BP-1LB-G1", "Gen 1", 8.50),
    ("i09", "Andouille 12oz Pack", "AN-12OZ-G2", "Gen 2", 8.49),
]

REALM = "12345678901234567"  # Demo realm; real QBO is 17 digits


def _cents(d: float) -> int:
    return int(round(d * 100))


def _ny_today() -> date:
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo("America/New_York")).date()


def _week_bounds(today: date) -> tuple[date, date, date, date, date]:
    """Last week Mon, this week Mon, next week Mon, week-after Mon, today."""
    this_mon = today - timedelta(days=today.weekday())
    return (
        this_mon - timedelta(days=7),
        this_mon,
        this_mon + timedelta(days=7),
        this_mon + timedelta(days=14),
        today,
    )


def reset(conn: sqlite3.Connection) -> None:
    for t in ("invoice_lines", "invoices", "invoice_sync_state", "invoice_sync_log"):
        conn.execute(f"DELETE FROM {t}")


def seed(conn: sqlite3.Connection, today: date | None = None) -> dict:
    today = today or _ny_today()
    last_mon, this_mon, next_mon, after_mon, _ = _week_bounds(today)

    rng = random.Random(42)
    inv_counter = 2600
    inv_rows: list[tuple] = []
    line_rows: list[tuple] = []

    def add_invoice(cust: tuple, txn_date: date, n_lines: int, pay_state: str):
        nonlocal inv_counter
        inv_counter += 1
        doc = f"INV-{inv_counter}"
        qbo_id = str(inv_counter)

        # Pick lines
        chosen = rng.sample(ITEMS, k=min(n_lines, len(ITEMS)))
        line_subtotals = []
        for line_num, (iid, name, sku, klass, unit) in enumerate(chosen, start=1):
            qty = rng.choice([2, 4, 6, 8, 12, 24])
            amount = round(qty * unit, 2)
            line_subtotals.append(amount)
            line_rows.append((
                REALM, qbo_id, f"L{line_num}", line_num,
                iid, name, sku, None, "SalesItemLineDetail",
                qty, _cents(unit), _cents(amount),
                None, 0, None, klass, None,
            ))
        total = round(sum(line_subtotals), 2)

        if pay_state == "paid":
            balance = 0.0
            email = "EmailSent"
            voided = 0
        elif pay_state == "partial":
            balance = round(total * 0.5, 2)
            email = "EmailViewed"
            voided = 0
        elif pay_state == "viewed":
            balance = total
            email = "EmailViewed"
            voided = 0
        elif pay_state == "sent":
            balance = total
            email = "EmailSent"
            voided = 0
        elif pay_state == "open":
            balance = total
            email = "NotSet"
            voided = 0
        elif pay_state == "voided":
            balance = 0.0
            email = "EmailSent"
            voided = 1
        else:
            balance = total
            email = "NotSet"
            voided = 0

        due = txn_date + timedelta(days=30)
        ship = txn_date + timedelta(days=rng.choice([1, 2, 3]))
        now_utc = datetime.utcnow().isoformat(timespec="seconds") + "Z"

        inv_rows.append((
            qbo_id, REALM, "1", doc,
            cust[0], cust[1], cust[2],
            txn_date.isoformat(), due.isoformat(), ship.isoformat(), None,
            now_utc, now_utc,
            _cents(total), _cents(balance), _cents(round(total * 0.0, 2)), "USD",
            email, voided, None,
            "t01", "Net 30", None, None, "billing@example.com", None,
            None,
            now_utc, "backfill",
        ))

    # Distribution:
    #   This week (Mon..today): mix of paid/partial/open/sent/viewed
    #   This week (today..Sun): a few "scheduled" open invoices dated future-this-week
    #   Next week: open + sent
    #   Last week (overdue context): a couple with due_date already passed
    #   One voided to validate the badge

    # Last-week stragglers (overdue)
    for cust in rng.sample(CUSTOMERS, k=3):
        d = last_mon + timedelta(days=rng.randint(0, 4))
        # Force overdue: txn_date last week, due_date == today - 1 (rewrite below)
        add_invoice(cust, d, rng.randint(2, 4), "open")

    # This week, already happened (Mon..today)
    days_into_week = (today - this_mon).days
    for cust in rng.sample(CUSTOMERS, k=8):
        d = this_mon + timedelta(days=rng.randint(0, max(0, days_into_week)))
        add_invoice(cust, d, rng.randint(2, 5), rng.choice(["paid", "partial", "sent", "viewed", "open"]))

    # This week, scheduled (today..Sun)
    for cust in rng.sample(CUSTOMERS, k=6):
        d = today + timedelta(days=rng.randint(0, max(0, 6 - days_into_week)))
        add_invoice(cust, d, rng.randint(2, 4), rng.choice(["open", "sent"]))

    # Next week
    for cust in rng.sample(CUSTOMERS, k=10):
        d = next_mon + timedelta(days=rng.randint(0, 6))
        add_invoice(cust, d, rng.randint(2, 5), rng.choice(["open", "sent", "open"]))

    # One voided
    add_invoice(CUSTOMERS[0], this_mon + timedelta(days=1), 2, "voided")

    # Bulk insert
    conn.executemany(
        "INSERT INTO invoices ("
        "qbo_id, realm_id, sync_token, doc_number, "
        "customer_qbo_id, customer_name, customer_parent_qbo_id, "
        "txn_date, due_date, ship_date, service_date, "
        "created_utc, updated_utc, "
        "total_cents, balance_cents, tax_cents, currency, "
        "email_status, is_voided, deleted_utc, "
        "terms_qbo_id, terms_name, private_note, customer_memo, bill_email, tracking_num, "
        "custom_fields_json, last_synced_utc, sync_source) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        inv_rows,
    )
    conn.executemany(
        "INSERT INTO invoice_lines ("
        "realm_id, invoice_qbo_id, line_id, line_num, "
        "item_qbo_id, item_name, item_sku, description, detail_type, "
        "quantity, unit_price_cents, amount_cents, "
        "tax_code_qbo_id, is_taxable, class_qbo_id, class_name, service_date) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        line_rows,
    )

    # Backdate due_date on last-week invoices so they show OVERDUE
    yesterday = (today - timedelta(days=1)).isoformat()
    conn.execute(
        "UPDATE invoices SET due_date = ? WHERE txn_date < ? AND is_voided = 0",
        (yesterday, this_mon.isoformat()),
    )

    conn.execute(
        "INSERT OR REPLACE INTO invoice_sync_state "
        "(realm_id, last_full_sync_utc, last_cdc_cursor_utc, full_sync_count) "
        "VALUES (?, ?, ?, ?)",
        (REALM, datetime.utcnow().isoformat() + "Z", datetime.utcnow().isoformat() + "Z", 1),
    )

    return {
        "invoices": len(inv_rows),
        "lines": len(line_rows),
        "today_local": today.isoformat(),
        "this_week": (this_mon.isoformat(), (this_mon + timedelta(days=6)).isoformat()),
        "next_week": (next_mon.isoformat(), (next_mon + timedelta(days=6)).isoformat()),
    }


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--db", default="master.db")
    p.add_argument("--reset", action="store_true", help="Truncate invoice tables before seeding")
    args = p.parse_args()

    conn = sqlite3.connect(args.db)
    conn.execute("PRAGMA foreign_keys = ON")
    with open(SCHEMA) as f:
        conn.executescript(f.read())

    if args.reset:
        reset(conn)
    summary = seed(conn)
    conn.commit()
    conn.close()

    print(f"Seeded {summary['invoices']} invoices and {summary['lines']} lines into {args.db}")
    print(f"  today        : {summary['today_local']}")
    print(f"  this week    : {summary['this_week'][0]} → {summary['this_week'][1]}")
    print(f"  next week    : {summary['next_week'][0]} → {summary['next_week'][1]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
