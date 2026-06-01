"""
invoices_api.py — read-only HTTP API serving the live invoices page.

Endpoints:
  GET  /api/invoices              — invoice headers in a date window, alpha by customer
  GET  /api/invoices/{realm_id}/{qbo_id}/lines  — line items for one invoice
  GET  /api/sync/status           — sync cursor + freshness signal
  GET  /healthz                   — liveness check

Status (OPEN, SENT, VIEWED, PARTIAL, PAID, OVERDUE, VOIDED) is derived here
from balance_cents / total_cents / email_status / due_date / is_voided.
Never stored on the row — OVERDUE depends on the current date.

Money returned in dollars (float) for display; stored as INTEGER cents.

Run:
  uvicorn api.invoices_api:app --reload --port 8765
"""
from __future__ import annotations

import os
import sqlite3
from datetime import date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

DB_PATH = os.environ.get("COLVARD_DB_PATH", "master.db")
DASHBOARDS_DIR = os.environ.get(
    "COLVARD_DASHBOARDS_DIR",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dashboards"),
)
TZ = ZoneInfo("America/New_York")

app = FastAPI(title="Colvard Invoices API", version="0.1.0")

# QBO webhook receiver (optional; only enabled if QBO_WEBHOOK_VERIFIER_TOKEN set)
if os.environ.get("QBO_WEBHOOK_VERIFIER_TOKEN"):
    from api.sync.webhook import router as webhook_router
    app.include_router(webhook_router)

# Dev convenience: serve the dashboard HTML alongside the API so the page can
# use same-origin relative paths to /api/*. In prod the dashboards are usually
# served by the existing static host; this mount is harmless either way.
if os.path.isdir(DASHBOARDS_DIR):
    app.mount("/dashboards", StaticFiles(directory=DASHBOARDS_DIR, html=True), name="dashboards")

    @app.get("/")
    def root_redirect() -> FileResponse:
        return FileResponse(os.path.join(DASHBOARDS_DIR, "invoices.html"))


# ── DB helpers ─────────────────────────────────────────────────────────────
def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, isolation_level=None)  # autocommit; we only read
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA query_only = 1")  # belt + braces against accidental writes
    return conn


# ── Week math (America/New_York, Monday-start) ─────────────────────────────
def _week_bounds(reference: date | None = None) -> tuple[date, date, date, date]:
    """Return (this_mon, this_sun, next_mon, next_sun) in local NY time."""
    today_ny = (reference or datetime.now(TZ).date())
    this_mon = today_ny - timedelta(days=today_ny.weekday())  # Monday
    this_sun = this_mon + timedelta(days=6)
    next_mon = this_mon + timedelta(days=7)
    next_sun = this_mon + timedelta(days=13)
    return this_mon, this_sun, next_mon, next_sun


# ── Status derivation (single source of truth) ─────────────────────────────
def _derive_status(row: sqlite3.Row, today_iso: str) -> str:
    if row["is_voided"]:
        return "VOIDED"
    if row["balance_cents"] == 0 and row["total_cents"] > 0:
        return "PAID"
    if 0 < row["balance_cents"] < row["total_cents"]:
        return "PARTIAL"
    # Fully unpaid below
    if row["due_date"] and row["due_date"] < today_iso:
        return "OVERDUE"
    es = (row["email_status"] or "").lower()
    if es == "emailviewed":
        return "VIEWED"
    if es == "emailsent":
        return "SENT"
    return "OPEN"


# ── Serialization ──────────────────────────────────────────────────────────
def _money(cents: int | None) -> float | None:
    if cents is None:
        return None
    return round(cents / 100.0, 2)


def _invoice_to_dict(row: sqlite3.Row, today_iso: str) -> dict:
    return {
        "qbo_id": row["qbo_id"],
        "realm_id": row["realm_id"],
        "doc_number": row["doc_number"],
        "customer_qbo_id": row["customer_qbo_id"],
        "customer_name": row["customer_name"],
        "txn_date": row["txn_date"],
        "due_date": row["due_date"],
        "ship_date": row["ship_date"],
        "total": _money(row["total_cents"]),
        "balance": _money(row["balance_cents"]),
        "tax": _money(row["tax_cents"]),
        "currency": row["currency"],
        "status": _derive_status(row, today_iso),
        "terms_name": row["terms_name"],
        "tracking_num": row["tracking_num"],
        "updated_utc": row["updated_utc"],
    }


# ── Endpoints ──────────────────────────────────────────────────────────────
@app.get("/healthz")
def healthz() -> dict:
    try:
        with _connect() as conn:
            conn.execute("SELECT 1").fetchone()
        return {"status": "ok", "db": DB_PATH}
    except Exception as e:
        raise HTTPException(503, f"db unavailable: {e}")


@app.get("/api/sync/status")
def sync_status() -> dict:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT realm_id, last_full_sync_utc, last_cdc_cursor_utc, "
            "last_webhook_utc, full_sync_count, error_count_24h "
            "FROM invoice_sync_state"
        ).fetchall()
    return {"realms": [dict(r) for r in rows], "now_utc": datetime.utcnow().isoformat() + "Z"}


@app.get("/api/invoices")
def list_invoices(
    week: Literal["this", "next", "both"] = Query("both"),
    bucket_by: Literal["txn_date", "due_date", "ship_date"] = Query("txn_date"),
    include_paid: bool = Query(False),
    include_voided: bool = Query(False),
) -> JSONResponse:
    """
    Return invoices in the requested week window(s), grouped by week and
    sorted alphabetically by customer (case-insensitive), then by txn_date.

    Defaults match the page spec: this+next week, by invoice date, open only.
    """
    this_mon, this_sun, next_mon, next_sun = _week_bounds()
    today_iso = datetime.now(TZ).date().isoformat()

    if week == "this":
        ranges = [("this", this_mon, this_sun)]
    elif week == "next":
        ranges = [("next", next_mon, next_sun)]
    else:
        ranges = [("this", this_mon, this_sun), ("next", next_mon, next_sun)]

    # Whitelist the bucket column (Literal already validates, but be paranoid)
    if bucket_by not in {"txn_date", "due_date", "ship_date"}:
        raise HTTPException(400, "bad bucket_by")

    filters = ["deleted_utc IS NULL"]
    if not include_voided:
        filters.append("is_voided = 0")
    if not include_paid:
        filters.append("balance_cents > 0")

    where_base = " AND ".join(filters)
    sql = (
        "SELECT * FROM invoices "
        f"WHERE {where_base} AND {bucket_by} BETWEEN ? AND ? "
        "ORDER BY customer_name COLLATE NOCASE, txn_date, doc_number"
    )

    with _connect() as conn:
        weeks_out = []
        for label, start, end in ranges:
            rows = conn.execute(sql, (start.isoformat(), end.isoformat())).fetchall()
            invoices = [_invoice_to_dict(r, today_iso) for r in rows]
            weeks_out.append(
                {
                    "label": label,
                    "start": start.isoformat(),
                    "end": end.isoformat(),
                    "count": len(invoices),
                    "total": round(sum(i["total"] or 0 for i in invoices), 2),
                    "balance": round(sum(i["balance"] or 0 for i in invoices), 2),
                    "invoices": invoices,
                }
            )

    return JSONResponse(
        {
            "weeks": weeks_out,
            "filters": {
                "bucket_by": bucket_by,
                "include_paid": include_paid,
                "include_voided": include_voided,
            },
            "generated_utc": datetime.utcnow().isoformat() + "Z",
            "today_local": today_iso,
            "timezone": "America/New_York",
        }
    )


@app.get("/api/invoices/{realm_id}/{qbo_id}/lines")
def get_lines(realm_id: str, qbo_id: str) -> dict:
    with _connect() as conn:
        header = conn.execute(
            "SELECT * FROM invoices WHERE realm_id = ? AND qbo_id = ?",
            (realm_id, qbo_id),
        ).fetchone()
        if not header:
            raise HTTPException(404, "invoice not found")
        lines = conn.execute(
            "SELECT line_num, item_qbo_id, item_name, item_sku, description, "
            "detail_type, quantity, unit_price_cents, amount_cents, "
            "class_name, service_date "
            "FROM invoice_lines "
            "WHERE realm_id = ? AND invoice_qbo_id = ? "
            "ORDER BY line_num",
            (realm_id, qbo_id),
        ).fetchall()

    return {
        "realm_id": realm_id,
        "qbo_id": qbo_id,
        "doc_number": header["doc_number"],
        "customer_name": header["customer_name"],
        "lines": [
            {
                "line_num": r["line_num"],
                "item_qbo_id": r["item_qbo_id"],
                "item_name": r["item_name"],
                "item_sku": r["item_sku"],
                "description": r["description"],
                "detail_type": r["detail_type"],
                "quantity": r["quantity"],
                "unit_price": _money(r["unit_price_cents"]),
                "amount": _money(r["amount_cents"]),
                "class_name": r["class_name"],
                "service_date": r["service_date"],
            }
            for r in lines
        ],
    }
