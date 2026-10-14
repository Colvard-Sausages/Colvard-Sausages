"""
webhook.py — QBO webhook receiver.

QBO posts data-change notifications (Invoice, Customer, Item, …) to a public
HTTPS endpoint registered in the QBO app. Each request is signed with a shared
verifier token; we MUST verify the signature before parsing.

Wire up in invoices_api.py:

    from api.sync.webhook import router as webhook_router
    app.include_router(webhook_router)

Then expose the public URL via TLS reverse proxy at `/webhook/qbo` and paste
that URL into the QBO app's webhook configuration. QBO retries failed deliveries
for ~24 hours, so we MUST return 200 quickly even if downstream sync fails.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import sqlite3
import threading
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request, Response

from .invoices_sync import sync_one
from .qbo_client import QboClient

log = logging.getLogger("colvard.qbo.webhook")

router = APIRouter(prefix="/webhook", tags=["webhook"])

_DB_PATH = os.environ.get("COLVARD_DB_PATH", "master.db")
_VERIFIER = os.environ.get("QBO_WEBHOOK_VERIFIER_TOKEN", "")


def _verify_signature(body: bytes, signature_header: str | None) -> bool:
    """HMAC-SHA256 of raw body with verifier token, base64-encoded.

    Returns True if signature matches. Constant-time comparison.
    """
    if not _VERIFIER or not signature_header:
        return False
    expected = base64.b64encode(
        hmac.new(_VERIFIER.encode("utf-8"), body, hashlib.sha256).digest()
    ).decode("ascii")
    return hmac.compare_digest(expected, signature_header)


def _process_entities(entities: list[dict[str, Any]]) -> None:
    """Run in a background thread to keep the webhook response fast."""
    try:
        conn = sqlite3.connect(_DB_PATH)
        conn.execute("PRAGMA foreign_keys = ON")
        client = QboClient()
        for ent in entities:
            if ent.get("name") != "Invoice":
                continue
            op = ent.get("operation", "")
            qbo_id = str(ent.get("id", ""))
            if not qbo_id:
                continue
            if op == "Delete":
                from .invoices_sync import soft_delete
                soft_delete(conn, client.creds.realm_id, qbo_id, source="webhook")
                conn.commit()
            else:
                # Create / Update / Void / Merge / Emailed: pull the latest
                sync_one(conn, client, qbo_id, source="webhook")
        conn.close()
    except Exception:
        log.exception("webhook background sync failed")


@router.post("/qbo")
async def qbo_webhook(
    request: Request,
    intuit_signature: str | None = Header(None, alias="intuit-signature"),
) -> Response:
    body = await request.body()
    if not _verify_signature(body, intuit_signature):
        # 401 means QBO will retry; we want it to keep trying if our verifier
        # is misconfigured. But if the signature is wrong, 401 is appropriate.
        raise HTTPException(401, "invalid signature")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(400, "invalid json")

    # Collect all entity events across realms
    entities: list[dict[str, Any]] = []
    for notification in payload.get("eventNotifications", []):
        dce = notification.get("dataChangeEvent") or {}
        for ent in dce.get("entities", []):
            entities.append(ent)

    # QBO retries for 24h on non-2xx. ACK immediately; sync in the background.
    if entities:
        threading.Thread(target=_process_entities, args=(entities,), daemon=True).start()

    return Response(status_code=200)
