"""
invoices_sync.py — sync QBO Invoice objects into master.db.

Three modes:
  - backfill: pull invoices since a date (full query, paginated)
  - cdc: pull changes since the stored cursor (use after first backfill)
  - one: pull a single invoice by id (called from the webhook receiver)

All paths converge on a single idempotent upsert that uses SyncToken
optimistic concurrency: an incoming event is dropped if our stored
sync_token is greater than or equal to the incoming one.

Status (OPEN/SENT/PAID/...) is NOT computed here; it's derived at query
time in invoices_api.py.
"""
from __future__ import annotations

import json
import logging
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from .qbo_client import QboClient

log = logging.getLogger("colvard.invoices.sync")

_QBO_PAGE_SIZE = 1000


def _cents(amount: float | int | None) -> int | None:
    if amount is None:
        return None
    return int(round(float(amount) * 100))


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _iso_or_none(s: str | None) -> str | None:
    """Pass through ISO strings; return None for empty/None.

    QBO dates are ISO 8601 already. We don't reformat to avoid drift.
    """
    if not s:
        return None
    return s


@dataclass
class SyncResult:
    inserted: int = 0
    updated: int = 0
    skipped_stale: int = 0
    soft_deleted: int = 0
    errors: int = 0

    def __iadd__(self, other: "SyncResult") -> "SyncResult":
        self.inserted += other.inserted
        self.updated += other.updated
        self.skipped_stale += other.skipped_stale
        self.soft_deleted += other.soft_deleted
        self.errors += other.errors
        return self


# ── Mapping: QBO Invoice payload → row tuple ────────────────────────────────
def _map_invoice(payload: dict[str, Any], realm_id: str) -> dict[str, Any]:
    """Flatten a QBO Invoice object to the row dict used by upsert."""
    meta = payload.get("MetaData", {})
    customer_ref = payload.get("CustomerRef", {})

    return {
        "qbo_id": str(payload["Id"]),
        "realm_id": realm_id,
        "sync_token": str(payload.get("SyncToken", "0")),
        "doc_number": payload.get("DocNumber"),
        "customer_qbo_id": str(customer_ref.get("value", "")),
        "customer_name": customer_ref.get("name", "") or "",
        "customer_parent_qbo_id": None,  # Resolved later via customer sync if needed
        "txn_date": _iso_or_none(payload.get("TxnDate")),
        "due_date": _iso_or_none(payload.get("DueDate")),
        "ship_date": _iso_or_none(payload.get("ShipDate")),
        "service_date": _iso_or_none(payload.get("ServiceDate")),
        "created_utc": meta.get("CreateTime") or _utc_now_iso(),
        "updated_utc": meta.get("LastUpdatedTime") or _utc_now_iso(),
        "total_cents": _cents(payload.get("TotalAmt", 0)) or 0,
        "balance_cents": _cents(payload.get("Balance", 0)) or 0,
        "tax_cents": _cents((payload.get("TxnTaxDetail") or {}).get("TotalTax", 0)) or 0,
        "currency": (payload.get("CurrencyRef") or {}).get("value") or "USD",
        "email_status": payload.get("EmailStatus"),
        "is_voided": 1 if (payload.get("PrivateNote") or "").lower().startswith("voided") else 0,
        "deleted_utc": None,
        "terms_qbo_id": (payload.get("SalesTermRef") or {}).get("value"),
        "terms_name": (payload.get("SalesTermRef") or {}).get("name"),
        "private_note": payload.get("PrivateNote"),
        "customer_memo": (payload.get("CustomerMemo") or {}).get("value"),
        "bill_email": (payload.get("BillEmail") or {}).get("Address"),
        "tracking_num": payload.get("TrackingNum"),
        "custom_fields_json": json.dumps(payload.get("CustomField", [])) if payload.get("CustomField") else None,
        "last_synced_utc": _utc_now_iso(),
    }


def _map_lines(payload: dict[str, Any], realm_id: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    invoice_id = str(payload["Id"])
    for idx, line in enumerate(payload.get("Line", []), start=1):
        detail_type = line.get("DetailType", "Unknown")
        sales = line.get("SalesItemLineDetail") or {}
        item_ref = sales.get("ItemRef") or {}
        class_ref = sales.get("ClassRef") or {}
        tax_ref = (sales.get("TaxCodeRef") or {})
        out.append({
            "realm_id": realm_id,
            "invoice_qbo_id": invoice_id,
            "line_id": str(line.get("Id", f"auto-{idx}")),
            "line_num": line.get("LineNum") or idx,
            "item_qbo_id": item_ref.get("value"),
            "item_name": item_ref.get("name"),
            "item_sku": None,  # Resolved later via items sync; QBO line doesn't include sku inline
            "description": line.get("Description"),
            "detail_type": detail_type,
            "quantity": sales.get("Qty"),
            "unit_price_cents": _cents(sales.get("UnitPrice")),
            "amount_cents": _cents(line.get("Amount", 0)) or 0,
            "tax_code_qbo_id": tax_ref.get("value"),
            "is_taxable": 1 if tax_ref.get("value") and tax_ref.get("value") != "NON" else 0,
            "class_qbo_id": class_ref.get("value"),
            "class_name": class_ref.get("name"),
            "service_date": _iso_or_none(sales.get("ServiceDate")),
        })
    return out


# ── Upsert with SyncToken comparison ────────────────────────────────────────
_UPSERT_SQL = """
INSERT INTO invoices (
    qbo_id, realm_id, sync_token, doc_number,
    customer_qbo_id, customer_name, customer_parent_qbo_id,
    txn_date, due_date, ship_date, service_date,
    created_utc, updated_utc,
    total_cents, balance_cents, tax_cents, currency,
    email_status, is_voided, deleted_utc,
    terms_qbo_id, terms_name, private_note, customer_memo, bill_email, tracking_num,
    custom_fields_json, last_synced_utc, sync_source
) VALUES (
    :qbo_id, :realm_id, :sync_token, :doc_number,
    :customer_qbo_id, :customer_name, :customer_parent_qbo_id,
    :txn_date, :due_date, :ship_date, :service_date,
    :created_utc, :updated_utc,
    :total_cents, :balance_cents, :tax_cents, :currency,
    :email_status, :is_voided, :deleted_utc,
    :terms_qbo_id, :terms_name, :private_note, :customer_memo, :bill_email, :tracking_num,
    :custom_fields_json, :last_synced_utc, :sync_source
)
ON CONFLICT(realm_id, qbo_id) DO UPDATE SET
    sync_token            = excluded.sync_token,
    doc_number            = excluded.doc_number,
    customer_qbo_id       = excluded.customer_qbo_id,
    customer_name         = excluded.customer_name,
    customer_parent_qbo_id= excluded.customer_parent_qbo_id,
    txn_date              = excluded.txn_date,
    due_date              = excluded.due_date,
    ship_date             = excluded.ship_date,
    service_date          = excluded.service_date,
    updated_utc           = excluded.updated_utc,
    total_cents           = excluded.total_cents,
    balance_cents         = excluded.balance_cents,
    tax_cents             = excluded.tax_cents,
    currency              = excluded.currency,
    email_status          = excluded.email_status,
    is_voided             = excluded.is_voided,
    deleted_utc           = NULL,                            -- restore if re-emitted after a delete
    terms_qbo_id          = excluded.terms_qbo_id,
    terms_name            = excluded.terms_name,
    private_note          = excluded.private_note,
    customer_memo         = excluded.customer_memo,
    bill_email            = excluded.bill_email,
    tracking_num          = excluded.tracking_num,
    custom_fields_json    = excluded.custom_fields_json,
    last_synced_utc       = excluded.last_synced_utc,
    sync_source           = excluded.sync_source
WHERE CAST(excluded.sync_token AS INTEGER) > CAST(invoices.sync_token AS INTEGER)
"""


def upsert_invoice(
    conn: sqlite3.Connection, payload: dict[str, Any], realm_id: str, *, source: str = "poll",
) -> tuple[str, str | None]:
    """Upsert one invoice + its lines. Returns (action, error).

    action: 'insert' | 'update' | 'skip_stale'
    """
    row = _map_invoice(payload, realm_id)
    row["sync_source"] = source

    # Fetch existing sync_token to decide outcome (for logging)
    existing = conn.execute(
        "SELECT sync_token FROM invoices WHERE realm_id = ? AND qbo_id = ?",
        (realm_id, row["qbo_id"]),
    ).fetchone()
    existing_token = existing[0] if existing else None

    cur = conn.execute(_UPSERT_SQL, row)
    affected = cur.rowcount

    if existing is None and affected == 1:
        action = "insert"
    elif affected == 1:
        action = "update"
    else:
        # Conflict + no row updated → stale event
        action = "skip_stale"

    if action in ("insert", "update"):
        # Replace lines: simpler than diffing, negligible cost
        conn.execute(
            "DELETE FROM invoice_lines WHERE realm_id = ? AND invoice_qbo_id = ?",
            (realm_id, row["qbo_id"]),
        )
        lines = _map_lines(payload, realm_id)
        if lines:
            conn.executemany(
                "INSERT INTO invoice_lines ("
                " realm_id, invoice_qbo_id, line_id, line_num, "
                " item_qbo_id, item_name, item_sku, description, detail_type, "
                " quantity, unit_price_cents, amount_cents, "
                " tax_code_qbo_id, is_taxable, class_qbo_id, class_name, service_date"
                ") VALUES ("
                " :realm_id, :invoice_qbo_id, :line_id, :line_num, "
                " :item_qbo_id, :item_name, :item_sku, :description, :detail_type, "
                " :quantity, :unit_price_cents, :amount_cents, "
                " :tax_code_qbo_id, :is_taxable, :class_qbo_id, :class_name, :service_date"
                ")",
                lines,
            )

    # Audit log row
    conn.execute(
        "INSERT INTO invoice_sync_log "
        "(event_type, realm_id, qbo_id, action, sync_token_old, sync_token_new, detail_json) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            source, realm_id, row["qbo_id"], action,
            existing_token, row["sync_token"],
            json.dumps({"total_cents": row["total_cents"], "balance_cents": row["balance_cents"]}),
        ),
    )
    return action, None


def soft_delete(conn: sqlite3.Connection, realm_id: str, qbo_id: str, *, source: str = "cdc") -> None:
    conn.execute(
        "UPDATE invoices SET deleted_utc = ?, last_synced_utc = ?, sync_source = ? "
        "WHERE realm_id = ? AND qbo_id = ?",
        (_utc_now_iso(), _utc_now_iso(), source, realm_id, qbo_id),
    )
    conn.execute(
        "INSERT INTO invoice_sync_log (event_type, realm_id, qbo_id, action) "
        "VALUES (?, ?, ?, 'soft_delete')",
        (source, realm_id, qbo_id),
    )


# ── Pull modes ──────────────────────────────────────────────────────────────
def backfill(
    conn: sqlite3.Connection, client: QboClient, since: str, *, source: str = "backfill",
) -> SyncResult:
    """Paginated full sweep of invoices changed since `since` (ISO date)."""
    result = SyncResult()
    start = 1
    while True:
        sql = (
            "SELECT * FROM Invoice "
            f"WHERE Metadata.LastUpdatedTime >= '{since}' "
            f"STARTPOSITION {start} MAXRESULTS {_QBO_PAGE_SIZE}"
        )
        body = client.query(sql)
        invoices = (body.get("QueryResponse") or {}).get("Invoice") or []
        if not invoices:
            break

        for inv in invoices:
            try:
                action, _ = upsert_invoice(conn, inv, client.creds.realm_id, source=source)
                if action == "insert":
                    result.inserted += 1
                elif action == "update":
                    result.updated += 1
                elif action == "skip_stale":
                    result.skipped_stale += 1
            except Exception as e:
                log.exception("upsert failed for invoice %s", inv.get("Id"))
                conn.execute(
                    "INSERT INTO invoice_sync_log (event_type, realm_id, qbo_id, action, error_message) "
                    "VALUES ('error', ?, ?, 'error', ?)",
                    (client.creds.realm_id, str(inv.get("Id")), str(e)[:500]),
                )
                result.errors += 1

        conn.commit()
        if len(invoices) < _QBO_PAGE_SIZE:
            break
        start += _QBO_PAGE_SIZE

    # Update sync state
    conn.execute(
        "INSERT INTO invoice_sync_state (realm_id, last_full_sync_utc, last_cdc_cursor_utc, full_sync_count) "
        "VALUES (?, ?, ?, 1) "
        "ON CONFLICT(realm_id) DO UPDATE SET "
        " last_full_sync_utc = excluded.last_full_sync_utc, "
        " last_cdc_cursor_utc = excluded.last_cdc_cursor_utc, "
        " full_sync_count = invoice_sync_state.full_sync_count + 1",
        (client.creds.realm_id, _utc_now_iso(), _utc_now_iso()),
    )
    conn.commit()
    return result


def cdc_pull(conn: sqlite3.Connection, client: QboClient) -> SyncResult:
    """Incremental pull using QBO CDC since the stored cursor.

    Note QBO CDC has a 30-day max window. If the cursor is older, fall back
    to a backfill.
    """
    cursor_row = conn.execute(
        "SELECT last_cdc_cursor_utc FROM invoice_sync_state WHERE realm_id = ?",
        (client.creds.realm_id,),
    ).fetchone()
    cursor = cursor_row[0] if cursor_row else None

    if not cursor:
        log.warning("no CDC cursor; running 90-day backfill instead")
        since = (datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m-%dT%H:%M:%SZ")
        return backfill(conn, client, since)

    # CDC has a hard 30-day window; if we're older, just backfill
    cursor_dt = datetime.fromisoformat(cursor.replace("Z", "+00:00"))
    if (datetime.now(timezone.utc) - cursor_dt).days >= 30:
        log.info("CDC cursor stale (>30d); falling back to backfill")
        return backfill(conn, client, cursor)

    result = SyncResult()
    body = client.cdc(["Invoice"], cursor)
    responses = body.get("CDCResponse", [])
    for r in responses:
        for qr in r.get("QueryResponse", []):
            for inv in qr.get("Invoice", []):
                if inv.get("status") == "Deleted":
                    soft_delete(conn, client.creds.realm_id, str(inv["Id"]))
                    result.soft_deleted += 1
                    continue
                try:
                    action, _ = upsert_invoice(conn, inv, client.creds.realm_id, source="cdc")
                    if action == "insert":
                        result.inserted += 1
                    elif action == "update":
                        result.updated += 1
                    elif action == "skip_stale":
                        result.skipped_stale += 1
                except Exception as e:
                    log.exception("CDC upsert failed for invoice %s", inv.get("Id"))
                    result.errors += 1

    # Advance cursor
    conn.execute(
        "UPDATE invoice_sync_state SET last_cdc_cursor_utc = ? WHERE realm_id = ?",
        (_utc_now_iso(), client.creds.realm_id),
    )
    conn.commit()
    return result


def sync_one(conn: sqlite3.Connection, client: QboClient, invoice_id: str, *, source: str = "webhook") -> SyncResult:
    """Pull a single invoice (used from webhook handler)."""
    result = SyncResult()
    body = client.get_invoice(invoice_id)
    inv = body.get("Invoice")
    if not inv:
        log.warning("invoice %s not found in QBO; soft-deleting", invoice_id)
        soft_delete(conn, client.creds.realm_id, invoice_id, source=source)
        result.soft_deleted = 1
        conn.commit()
        return result
    action, _ = upsert_invoice(conn, inv, client.creds.realm_id, source=source)
    if action == "insert":
        result.inserted = 1
    elif action == "update":
        result.updated = 1
    elif action == "skip_stale":
        result.skipped_stale = 1
    conn.commit()
    return result
