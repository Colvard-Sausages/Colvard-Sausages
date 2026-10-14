"""
test_sync_logic.py — exercise the QBO → invoices upsert path with fixture
payloads (no real QBO access required).

Validates:
  - Realistic QBO Invoice payload maps to the correct row shape
  - First upsert → insert
  - Repeat with same SyncToken → skip_stale (idempotent)
  - Repeat with higher SyncToken → update; lines replaced
  - QBO 'Deleted' status payload → soft_delete sets deleted_utc
  - Webhook signature verification: positive + negative cases

Run:
    python3 scripts/test_sync_logic.py
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import sqlite3
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api.sync.invoices_sync import soft_delete, upsert_invoice  # noqa: E402


def _make_db() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")
    with open(ROOT / "schema" / "invoices.sql") as f:
        conn.executescript(f.read())
    return conn


def _fixture_invoice(sync_token: str = "0", balance: float = 482.40) -> dict:
    """A realistic QBO Invoice payload, abridged to fields we actually map."""
    return {
        "Id": "1042",
        "SyncToken": sync_token,
        "DocNumber": "INV-1042",
        "TxnDate": "2026-06-02",
        "DueDate": "2026-07-02",
        "ShipDate": "2026-06-04",
        "CustomerRef": {"value": "73", "name": "Conant Acres Inc"},
        "CurrencyRef": {"value": "USD"},
        "TotalAmt": 482.40,
        "Balance": balance,
        "EmailStatus": "EmailSent",
        "TxnTaxDetail": {"TotalTax": 0},
        "SalesTermRef": {"value": "3", "name": "Net 30"},
        "PrivateNote": None,
        "CustomerMemo": {"value": "Thanks!"},
        "BillEmail": {"Address": "ap@conantacres.example"},
        "TrackingNum": None,
        "CustomField": [],
        "MetaData": {
            "CreateTime": "2026-06-02T13:14:00Z",
            "LastUpdatedTime": "2026-06-02T13:14:00Z",
        },
        "Line": [
            {
                "Id": "1",
                "LineNum": 1,
                "Description": None,
                "Amount": 191.76,
                "DetailType": "SalesItemLineDetail",
                "SalesItemLineDetail": {
                    "ItemRef": {"value": "i02", "name": "Maple Sage 12oz Pack"},
                    "Qty": 24, "UnitPrice": 7.99,
                    "ClassRef": {"value": "g2", "name": "Gen 2"},
                    "TaxCodeRef": {"value": "NON"},
                },
            },
            {
                "Id": "2",
                "LineNum": 2,
                "Description": "Chorizo bulk",
                "Amount": 290.64,
                "DetailType": "SalesItemLineDetail",
                "SalesItemLineDetail": {
                    "ItemRef": {"value": "i05", "name": "Chorizo Links 1lb"},
                    "Qty": 30.6, "UnitPrice": 9.50,
                    "ClassRef": {"value": "g1", "name": "Gen 1"},
                },
            },
        ],
    }


# ── Tests ──────────────────────────────────────────────────────────────────
def test_insert_then_idempotent_then_update():
    conn = _make_db()
    realm = "test-realm"

    # 1) Insert
    payload = _fixture_invoice(sync_token="0", balance=482.40)
    action, _ = upsert_invoice(conn, payload, realm, source="backfill")
    assert action == "insert", f"expected insert, got {action}"
    rows = conn.execute("SELECT * FROM invoices").fetchall()
    assert len(rows) == 1, f"expected 1 row, got {len(rows)}"

    cents = conn.execute("SELECT total_cents, balance_cents FROM invoices").fetchone()
    assert cents == (48240, 48240), f"cents wrong: {cents}"

    lines = conn.execute("SELECT COUNT(*) FROM invoice_lines").fetchone()[0]
    assert lines == 2, f"expected 2 lines, got {lines}"
    print("  [pass] insert + cents conversion + lines persisted")

    # 2) Same sync_token → skip_stale
    action, _ = upsert_invoice(conn, payload, realm, source="cdc")
    assert action == "skip_stale", f"expected skip_stale, got {action}"
    print("  [pass] same SyncToken → skip_stale (idempotent)")

    # 3) Higher sync_token + balance changed → update + lines replaced
    payload2 = _fixture_invoice(sync_token="3", balance=0.00)  # Paid
    payload2["EmailStatus"] = "EmailViewed"
    payload2["MetaData"]["LastUpdatedTime"] = "2026-06-03T09:00:00Z"
    payload2["Line"] = [payload2["Line"][0]]  # Drop second line
    action, _ = upsert_invoice(conn, payload2, realm, source="webhook")
    assert action == "update", f"expected update, got {action}"

    bal = conn.execute("SELECT balance_cents, email_status FROM invoices").fetchone()
    assert bal == (0, "EmailViewed"), f"update didn't propagate: {bal}"
    lines = conn.execute("SELECT COUNT(*) FROM invoice_lines").fetchone()[0]
    assert lines == 1, f"lines should be replaced (1), got {lines}"
    print("  [pass] higher SyncToken → update; lines replaced")

    # 4) Lower sync_token → skip
    payload3 = _fixture_invoice(sync_token="1", balance=482.40)
    action, _ = upsert_invoice(conn, payload3, realm, source="cdc")
    assert action == "skip_stale", f"expected skip_stale, got {action}"
    bal = conn.execute("SELECT balance_cents FROM invoices").fetchone()[0]
    assert bal == 0, f"stale event clobbered balance: {bal}"
    print("  [pass] lower SyncToken → skip_stale (no clobber)")


def test_soft_delete_and_restore():
    conn = _make_db()
    realm = "test-realm"
    payload = _fixture_invoice(sync_token="0")
    upsert_invoice(conn, payload, realm)
    soft_delete(conn, realm, "1042", source="cdc")
    row = conn.execute("SELECT deleted_utc FROM invoices WHERE qbo_id='1042'").fetchone()
    assert row[0] is not None, "deleted_utc not set"
    print("  [pass] soft_delete sets deleted_utc")

    # Re-emit (e.g., user restored in QBO) → deleted_utc cleared
    payload2 = _fixture_invoice(sync_token="2")
    payload2["MetaData"]["LastUpdatedTime"] = "2026-06-04T00:00:00Z"
    action, _ = upsert_invoice(conn, payload2, realm, source="webhook")
    assert action == "update", f"expected update on re-emit, got {action}"
    row = conn.execute("SELECT deleted_utc FROM invoices WHERE qbo_id='1042'").fetchone()
    assert row[0] is None, f"deleted_utc should be cleared, got {row[0]}"
    print("  [pass] re-emit after delete clears deleted_utc")


def test_audit_log_records_action():
    conn = _make_db()
    realm = "test-realm"
    p1 = _fixture_invoice(sync_token="0")
    p2 = _fixture_invoice(sync_token="0")  # Same → skip
    p3 = _fixture_invoice(sync_token="5")
    p3["MetaData"]["LastUpdatedTime"] = "2026-06-03T09:00:00Z"
    upsert_invoice(conn, p1, realm)
    upsert_invoice(conn, p2, realm)
    upsert_invoice(conn, p3, realm)
    actions = [
        r[0] for r in conn.execute(
            "SELECT action FROM invoice_sync_log WHERE event_type != 'error' ORDER BY id"
        )
    ]
    assert actions == ["insert", "skip_stale", "update"], f"audit trail wrong: {actions}"
    print("  [pass] audit log records insert/skip/update")


def test_webhook_signature_verification():
    # Avoid importing webhook module at top level (it touches env at import time)
    from api.sync.webhook import _verify_signature
    body = b'{"eventNotifications":[]}'

    # Without verifier configured, must fail closed
    os.environ.pop("QBO_WEBHOOK_VERIFIER_TOKEN", None)
    import importlib
    import api.sync.webhook as wh
    importlib.reload(wh)
    assert wh._verify_signature(body, "anything") is False
    print("  [pass] no verifier → rejected (fail closed)")

    # With verifier configured and a correct signature, must pass
    os.environ["QBO_WEBHOOK_VERIFIER_TOKEN"] = "secret-verifier-token"
    importlib.reload(wh)
    sig = base64.b64encode(
        hmac.new(b"secret-verifier-token", body, hashlib.sha256).digest()
    ).decode("ascii")
    assert wh._verify_signature(body, sig) is True
    print("  [pass] correct signature → accepted")

    # Wrong signature must fail
    assert wh._verify_signature(body, "wrong") is False
    print("  [pass] wrong signature → rejected")

    # Missing header must fail
    assert wh._verify_signature(body, None) is False
    print("  [pass] missing signature → rejected")


def test_idempotent_upsert_on_full_resync():
    """Backfill running twice over the same data must not duplicate rows."""
    conn = _make_db()
    realm = "r"
    payloads = [_fixture_invoice(sync_token=str(i % 3), balance=100 * i) for i in range(20)]
    for i, p in enumerate(payloads):
        p["Id"] = str(1000 + i)
        upsert_invoice(conn, p, realm)
    count1 = conn.execute("SELECT COUNT(*) FROM invoices").fetchone()[0]

    # Re-run the same backfill — every upsert should hit ON CONFLICT
    for p in payloads:
        upsert_invoice(conn, p, realm)
    count2 = conn.execute("SELECT COUNT(*) FROM invoices").fetchone()[0]
    assert count1 == count2 == 20, f"re-backfill duplicated rows: {count1} vs {count2}"
    print(f"  [pass] re-backfill idempotent ({count2} rows stable)")


def main() -> int:
    tests = [
        test_insert_then_idempotent_then_update,
        test_soft_delete_and_restore,
        test_audit_log_records_action,
        test_webhook_signature_verification,
        test_idempotent_upsert_on_full_resync,
    ]
    failed = 0
    for t in tests:
        print(f"\n--- {t.__name__} ---")
        try:
            t()
        except AssertionError as e:
            failed += 1
            print(f"  [FAIL] {e}")
        except Exception:
            failed += 1
            import traceback
            print("  [ERROR]")
            traceback.print_exc()
    print()
    if failed:
        print(f"FAILED: {failed}/{len(tests)}")
        return 1
    print(f"OK: {len(tests)}/{len(tests)} passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
