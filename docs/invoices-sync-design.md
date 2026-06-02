# Invoices sync layer — design notes & adversarial review

Files: [`api/sync/qbo_client.py`](../api/sync/qbo_client.py), [`api/sync/invoices_sync.py`](../api/sync/invoices_sync.py), [`api/sync/webhook.py`](../api/sync/webhook.py), [`api/sync/cli.py`](../api/sync/cli.py), [`scripts/test_sync_logic.py`](../scripts/test_sync_logic.py).

Reads the schema from `schema/invoices.sql`; feeds the page served by `api/invoices_api.py`. This is the third and final slice of the invoices feature — the piece that makes "near-real-time from QuickBooks" actually true.

---

## Read-only safety rails (enforced, not just convention)

Intuit's OAuth scope is coarse: `com.intuit.quickbooks.accounting` grants access to the *entire* accounting surface — invoices, customers, items, **and** bank accounts, chart of accounts, payments. There is no narrower "invoices-only" scope to request. So the real boundary is enforced in our own code, in three independent layers:

| Layer | Where | What it refuses | Test |
|---|---|---|---|
| **1 — verb guard** | `QboClient._request` | Any `POST/PUT/DELETE/PATCH` against `/v3/company/...` raises `PermissionError` before a byte is sent. Only `GET` is allowed. | `test_readonly_refuses_write_verbs` |
| **2 — entity allowlist** | `QboClient.query` / `.cdc` | Any query or CDC touching anything but `Invoice` (e.g. `Account`, `BankAccount`, `Payment`, `Customer`) raises `PermissionError`. `_ALLOWED_ENTITIES = {"Invoice"}`. | `test_readonly_refuses_non_invoice_entities` |
| **3 — local DB read-only** | `invoices_api.py` | The serving API opens every connection with `PRAGMA query_only = 1`, so even a buggy endpoint cannot write `master.db`. | (existing) |

`QboClient(read_only=True)` is the default and nothing in the codebase sets it `False`. A future caller that genuinely needs to write to QBO must opt in explicitly and loudly — there is no accidental path to mutation. The OAuth token-refresh `POST` goes to a *different* host (`oauth.platform.intuit.com`), not the company API, so it is unaffected by Layer 1.

`test_readonly_still_allows_invoice_reads` confirms the rails don't break the legitimate invoice read path.

---

## What this delivers

```
              QBO Webhook (HMAC-signed POST)
                       │
                       ▼  (verify → 200 fast → background sync_one)
   ┌──────────────────────────────────────────────┐
   │                                              │
QBO API ◀──── HTTP w/ OAuth2 token refresh ──── QboClient
   │                                              │
   │                                              ▼
   └────── CDC poll (every 60s) ─────────► upsert_invoice + lines
                                                  │
                                                  ▼
                                            master.db
                                                  │
                                                  ▼
                                      invoices_api.py  →  invoices.html
```

| Component | Role |
|---|---|
| `qbo_client.QboClient` | OAuth2 token lifecycle, retry/backoff, sandbox/prod URL switch |
| `qbo_client.QboTokenStore` | Atomic file-backed token persistence with 0600 perms; refresh_token rotates on every use |
| `invoices_sync.upsert_invoice` | Single idempotent code path; SyncToken comparison via `CAST(... AS INTEGER) > ...` in the UPSERT |
| `invoices_sync.backfill` | Paginated full sweep (90-day default), used for first run + when CDC cursor is stale |
| `invoices_sync.cdc_pull` | 60s incremental pull; auto-falls back to backfill if cursor > 30 days old (QBO limit) |
| `invoices_sync.sync_one` | Single-invoice pull used by the webhook |
| `webhook.qbo_webhook` | HMAC-SHA256 signature verify → 200 ACK in <50ms → background thread does the work |
| `cli.py` | `backfill / cdc / one / loop / status` commands |

---

## The hard problems and how this design handles them

### 1. OAuth refresh token rotation

QBO rotates the `refresh_token` on **every** call to the token endpoint. If your sync worker reads only from env vars, you have access for exactly one refresh — then you're locked out.

**Solution:** `QboTokenStore` persists tokens to a 0600 file (`QBO_TOKEN_FILE`, default `.qbo_tokens.json`, already in `.gitignore`). The env var `QBO_REFRESH_TOKEN` is only the *bootstrap* — after first run, the file is the source of truth. Atomic temp-file rename prevents corruption on partial writes.

### 2. Idempotent upsert with optimistic concurrency

Two writers (60s CDC poll + webhook) can race. The UPSERT is gated by `WHERE CAST(excluded.sync_token AS INTEGER) > CAST(invoices.sync_token AS INTEGER)`. SQLite supports this UPSERT-with-WHERE clause since 3.24.

**Verified by tests** in `scripts/test_sync_logic.py`:

- Same SyncToken → `skip_stale`, no clobber
- Lower SyncToken → `skip_stale`, no clobber
- Higher SyncToken → `update`, lines replaced
- Re-running backfill over the same data → 0 dupes

### 3. CDC cursor staleness vs full backfill

QBO CDC has a hard 30-day window. If our cursor is older (laptop sat idle, server was off), CDC returns empty.

**Solution:** `cdc_pull` checks cursor age; if ≥30 days, it falls back to `backfill(since=cursor)` automatically. No data is dropped silently.

### 4. Webhook latency vs reliability

QBO retries failed deliveries for ~24 hours. If our handler is slow, retries pile up and our DB sees the same event multiple times.

**Solution:** Verify signature → ACK 200 in <50ms → spawn a background thread for the actual sync. The sync is idempotent (see #2) so duplicate deliveries are harmless even if a retry races a poll.

### 5. Voided invoice detection

QBO does not expose a clean `VoidStatus` field on the Invoice object through the public API. The de facto signal: when you void in the UI, QBO appends "Voided" to the `PrivateNote` and zeros out line amounts.

**Solution:** `is_voided = 1 if (PrivateNote or "").lower().startswith("voided") else 0`. Imperfect but conventional.

**Alternative if Colvard wants stronger detection:** treat any invoice where `TotalAmt == 0 AND Balance == 0 AND PrivateNote contains "Voided"` as voided. This adds defense in depth. Open question for v2.

### 6. Hard delete in QBO → soft delete in master.db

QBO allows hard-delete via API; the deleted entity appears in CDC with `status: "Deleted"`. Hard-deleting locally would lose audit trail and break joins with `transactions`.

**Solution:** Soft-delete via `deleted_utc`. Live page queries filter `deleted_utc IS NULL`. If the user restores the invoice in QBO and we get a fresh upsert, `ON CONFLICT … DO UPDATE SET deleted_utc = NULL` brings it back. **Verified by test_soft_delete_and_restore.**

---

## Adversarial review — what could still go wrong

| Risk | Status | Notes |
|---|---|---|
| **Refresh token leaked via env logging** | ⚠ Operator concern | Use `LOG_LEVEL=INFO` not `DEBUG` in prod; httpx redacts auth by default. |
| **Token file permissions** | ✅ 0600 enforced | If the file is on shared storage, this isn't enough — keep it on the sync host. |
| **Webhook replay attack** | ⚠ Not mitigated | QBO does not include a timestamp in its signature; a replayed signed POST would re-run sync. The replay is harmless (idempotent), so not a real risk. If you want strict replay protection, store the `intuit-tid` header and reject duplicates. |
| **Webhook signature verification with no verifier set** | ✅ Fails closed | If `QBO_WEBHOOK_VERIFIER_TOKEN` is unset, `_verify_signature` returns False → 401 to QBO. Tested. |
| **CDC payload ordering** | ✅ Resolved by SyncToken | Out-of-order events are dropped by the WHERE clause. |
| **Two sync workers running simultaneously** | ⚠ Not protected | The token store has no file lock. Single-worker is the assumed deployment. Wrap with `flock` or use a process supervisor that guarantees singleton. |
| **API rate limits** | ✅ Backoff implemented | 429 → respect `Retry-After`; 5xx → exponential backoff to 30s. |
| **Network errors** | ✅ Retry up to 5 attempts | After that the iteration logs an error and continues; next CDC pull picks up. |
| **Customer parent_id not resolved** | ⚠ Stub | The `_map_invoice` sets `customer_parent_qbo_id = None`. A separate customer sync would populate it. **Acceptable for v1**: parent resolution is for Hannaford-style sub-customer grouping, a v2 page feature. |
| **Item SKU not on the line** | ⚠ Stub | QBO line objects don't include `Item.Sku` inline; would need a separate item lookup. The page falls back to `item_name` which is always populated. |
| **GroupLineDetail (item bundles)** | ⚠ Captured flat | Colvard isn't using bundles today (per audit). If adopted, sync needs to recurse into nested SalesItemLineDetail children. |
| **Multi-currency** | ⚠ Captured but not converted | Currency code is stored; FX math is out of scope. |
| **Sandbox vs production switch** | ✅ Env-driven | `QBO_ENVIRONMENT=sandbox` → sandbox base URL. Test thoroughly before flipping. |

---

## What I cannot validate from this session

- **Real QBO traffic.** No credentials, no live calls. The httpx client paths (token refresh, CDC, query, get_invoice) are wired correctly per the QBO API docs but unexercised against the actual service.
- **Webhook delivery from QBO.** No public URL, no TLS, no app registration. Signature math is verified locally; the integration path is documented.
- **Token-file behavior under concurrent writers.** Single-worker is the assumption; concurrent test would require process-level coordination not yet built.

**What's been validated locally** (5 tests, 13 assertions, all green):

```
test_insert_then_idempotent_then_update    [4 assertions]
test_soft_delete_and_restore               [2 assertions]
test_audit_log_records_action              [1 assertion]
test_webhook_signature_verification        [4 assertions]
test_idempotent_upsert_on_full_resync      [1 assertion]
```

---

## Operator runbook

### One-time setup

1. Go to [developer.intuit.com](https://developer.intuit.com), create an app, get `client_id` and `client_secret`.
2. Use Intuit's OAuth Playground to authorize against your Colvard QBO company → copy the `refresh_token` and `realm_id`.
3. Set env on the sync host:
   ```
   QBO_CLIENT_ID=...
   QBO_CLIENT_SECRET=...
   QBO_REFRESH_TOKEN=...        # bootstrap value; rotates after first run
   QBO_REALM_ID=...             # 17-digit company id
   QBO_ENVIRONMENT=production   # or 'sandbox'
   COLVARD_DB_PATH=/path/to/master.db
   ```
4. (Optional, for webhook) In the QBO app config, add a webhook endpoint URL pointing at `https://YOUR-PUBLIC-HOST/webhook/qbo`, subscribe to **Invoice** events, save the **verifier token** as:
   ```
   QBO_WEBHOOK_VERIFIER_TOKEN=...
   ```

### First run

```bash
python3 -m api.sync.cli backfill --since 2026-01-01
```

This populates `invoices` + `invoice_lines` and sets the CDC cursor.

### Steady state (cron, every minute)

```cron
* * * * *  cd /opt/colvard && python3 -m api.sync.cli cdc >> /var/log/colvard-sync.log 2>&1
```

Or the equivalent systemd timer (preferred — easier to monitor).

### Monitor

```bash
python3 -m api.sync.cli status
```

Shows the cursor, recent log entries, and total invoice counts. If `error_count_24h` > 0, check `invoice_sync_log` for `event_type = 'error'` rows.
