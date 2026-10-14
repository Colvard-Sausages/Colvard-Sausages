# Invoices page + API — design notes & adversarial review

Files in this slice: [`api/invoices_api.py`](../api/invoices_api.py), [`dashboards/invoices.html`](../dashboards/invoices.html), [`scripts/seed_demo_data.py`](../scripts/seed_demo_data.py). Reads the schema defined in [`schema/invoices.sql`](../schema/invoices.sql) and design notes in [`invoices-schema-design.md`](./invoices-schema-design.md).

This is the **viewable** half of the invoices feature. The sync layer (QBO → master.db) is the unbuilt half; see the open questions below.

---

## What this delivers

A `/dashboards/invoices.html` page that:

- Lists invoices in **this week** and **next week** (America/New_York, Monday-start), each as a collapsible row
- Sorts alphabetical by customer (case-insensitive), then by date
- Expands on click to reveal line items: item name, qty, unit price, amount, class (Gen 1 / Gen 2)
- Shows derived status badge — OPEN, SENT, VIEWED, PARTIAL, PAID, OVERDUE, VOIDED
- Polls `/api/invoices` every 30s; "Updated HH:MM:SS" pill flashes green on success, yellow when stale, red when dead
- Filter toggles: show paid, bucket by invoice date / due date / ship date

A FastAPI service `api/invoices_api.py` that:

- Reads the schema you already shipped — does not write
- Sets `PRAGMA query_only = 1` per connection as defense-in-depth
- Whitelists every dynamic SQL identifier (no f-string injection paths)
- Escapes all HTML in the page via `escHtml()` — XSS-safe
- Lazy-loads line items only when an invoice row is expanded
- Returns money as dollars (float) for display; stores it as INTEGER cents

A seed script `scripts/seed_demo_data.py` that:

- Uses real customer names from the OPCON audit (Conant Acres, Hannaford, Native Maine, etc.) and real Colvard SKUs (Maple Sage, Chorizo, Sweet Italian)
- Produces a believable distribution across this week / next week / overdue
- Lets anyone demo the page in 5 seconds without QuickBooks credentials

---

## Adversarial review — what could go wrong

### Security

| Risk | Mitigation |
|---|---|
| SQL injection | All values parameterized with `?`. `bucket_by` is `Literal[...]` (FastAPI enforces) **and** re-checked at runtime against a set. |
| Path traversal via static mount | FastAPI `StaticFiles` blocks `../` traversal. |
| XSS in customer/item names | Every dynamic insertion in the page goes through `escHtml()`. No `innerHTML` of un-escaped data. |
| Accidental writes via the API | `PRAGMA query_only = 1` set on every connection — SQLite will reject any DML/DDL even if a future endpoint forgets to read-only. |
| **No auth on the API** | **Out of scope for v1.** The endpoint is bare. Acceptable only if the host is internal-network-only or behind an existing reverse-proxy auth layer (matches the rest of the dashboard pack). **Confirm before exposing publicly.** |
| CORS | Not configured. Page and API share an origin (same host), so the browser won't ask. If they ever split, add `from fastapi.middleware.cors import CORSMiddleware` with an explicit allowlist. |
| Rate limiting | None. At 1–5 internal users polling every 30s, the DB load is negligible. If you ever expose this externally, put nginx or Cloudflare in front. |

### Correctness

| Concern | Handling |
|---|---|
| Week boundary across DST | `zoneinfo.ZoneInfo("America/New_York")` handles DST transitions correctly. Tests would confirm; covered by the standard library. |
| Money rounding | All math in INTEGER cents on the server. Page converts to dollars for display only with `round(cents / 100, 2)`. |
| Status drift | OVERDUE depends on `today`. Computed at query time from `balance_cents`, `email_status`, `due_date`, `is_voided`. Never stored. |
| Stale line cache after invoice update | Page clears `lineCache` whenever any row's `updated_utc` changes. Re-expand reloads. |
| Concurrent toggle of the same row | `inFlightLines` Set dedups in-flight fetches. |
| Empty result | Page shows "No invoices in this window." instead of crashing. |
| API down mid-session | Page sets status to yellow (stale) after one failed poll, red (dead) after 90s. Last-good data stays on screen. |

### Out of scope (deliberate)

| Not in v1 | Why | Next |
|---|---|---|
| **Overdue invoices from past weeks** | The page's spec is "this week + next week." Overdue items older than this Monday won't show on this page. AR aging is a separate page. | Build `ar_aging.html` later; query becomes `WHERE balance_cents > 0 AND due_date < today`. |
| **Auth** | The dashboard pack is internal; matches existing access pattern. | If exposed externally, add OIDC or basic auth at the reverse proxy. |
| **SSE / WebSocket push** | Polling at 30s is plenty for invoice cadence. SSE shaves latency to <5s; can be added without changing the page contract. | Plan item #6 (webhook → SSE). |
| **Search / free-text filter** | Visible row count ≤30; eyeballs are faster than a search box. | Add when a customer hits 50+ open invoices/week. |
| **Pagination** | Same reason. | Add when needed. |
| **Editing invoices** | Out of scope; QuickBooks is the system of record. | Stays in QBO forever. |

### What I'd want to test before relying on this

- Render with **zero invoices** in the window (page must not crash). ✓ Tested.
- Render with a **voided** invoice (badge must show, balance must be $0). ✓ Tested in seed.
- Render with an **overdue** invoice (badge must show, due_date must drive it). ✓ Tested in seed.
- Toggle **show paid** and verify PAID rows appear/disappear. ✓ Tested via API; needs human eye on UI.
- **DB unavailable mid-session** — kill the API, verify the page degrades to red, no data loss on screen.
- **Slow query** — insert 10k invoices, confirm `idx_invoices_open` is still used and response time stays sub-100ms.

---

## What's still missing for the real "near-real-time from QuickBooks"

The page is correct. The data is currently from a seed script. The actual sync layer (`sync_invoices.py`) is the next deliverable:

1. **QBO OAuth2 setup** — needs your action: app registration at developer.intuit.com, save client_id + client_secret + refresh_token. ~1 hr you, then I can take over.
2. **Initial backfill** — `python -m colvard.sync invoices --backfill --since 2026-01-01`.
3. **60-second poll loop** — cron or systemd timer; reads `invoice_sync_state.last_cdc_cursor_utc`, pulls QBO CDC since cursor, upserts.
4. **Webhook receiver** (optional, drops latency from ~60s to ~5s) — needs a public endpoint with TLS; QBO won't talk to localhost.

Each step is independently shippable. Step 3 alone gets you to "≤60s after a QuickBooks change, the page reflects it."

---

## How to demo locally (verified working)

```bash
# from the repo root
python3 scripts/seed_demo_data.py --db /tmp/demo.db
COLVARD_DB_PATH=/tmp/demo.db python3 -m uvicorn api.invoices_api:app --port 8765 --reload
# open http://127.0.0.1:8765/
```

The screenshot in the PR thread was produced by exactly this sequence + headless Chromium.
