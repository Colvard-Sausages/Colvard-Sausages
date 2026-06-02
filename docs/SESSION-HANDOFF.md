# Colvard Invoices Dashboard — Session Decisions & Handoff

**Date:** 2026-06-01
**Repository:** github.com/Colvard-Sausages/Colvard-Sausages
**Branch:** `claude/laptop-connection-status-4lzgd`
**Pull Request:** [#1 (draft)](https://github.com/Colvard-Sausages/Colvard-Sausages/pull/1)

A copy of this document also lives in Google Drive: *"Colvard Invoices Dashboard — Session Decisions & Handoff (2026-06-01)"*.

---

## 1. What was built

A near-real-time **Sales > Invoices** dashboard page that mirrors QuickBooks Online. Shows invoices for **this week** and **next week**, alphabetical by customer, with collapsible line items and status badges (OPEN / SENT / VIEWED / PARTIAL / PAID / OVERDUE / VOIDED). Built in three slices, all on PR #1:

- **Slice 1 — Schema** (`schema/invoices.sql`): tables `invoices`, `invoice_lines`, `invoice_sync_state`, `invoice_sync_log`. Money as integer cents; dates as ISO 8601 text; status derived at query time (OVERDUE depends on today's date).
- **Slice 2 — Page + read-only API** (`dashboards/invoices.html`, `api/invoices_api.py`): FastAPI service; the page polls every 30s with a freshness indicator. Demo seed (`scripts/seed_demo_data.py`) previews it with realistic Colvard data without QuickBooks.
- **Slice 3 — QBO sync engine** (`api/sync/*.py`): OAuth2 with token rotation, 60s incremental poll (CDC), webhook receiver for sub-5s updates, idempotent upsert that drops out-of-order events. CLI: `backfill / cdc / one / loop / status`.

## 2. Key decisions

- **QuickBooks Online** (not Desktop) is the source system.
- **Week boundaries:** Monday–Sunday, America/New_York.
- **Bucketed by invoice date** by default (UI toggle for due/ship date).
- **Integer cents** end to end; dollars only for display.
- **Status computed at read time**, never stored.
- **Soft deletes** locally (audit trail; auto-restore if invoice reappears).
- **Sandbox first, production later** — Intuit's Production tab needs a multi-day review; Development/sandbox gives the full API immediately. (Corrected an earlier walkthrough error that said Production first.)

### Read-only safety (explicit requirement: "two or three layers")

Intuit's OAuth scope is coarse — `com.intuit.quickbooks.accounting` grants the whole accounting surface (including bank accounts), because there is **no invoices-only scope**. The real boundary is enforced in our code, in three independent layers:

1. **Verb guard** — refuses any POST/PUT/DELETE/PATCH to QuickBooks; only GET allowed (errors before sending).
2. **Entity allowlist** — only the `Invoice` entity may be queried; Account, BankAccount, Payment, Customer, etc. are refused.
3. **Local DB** — the serving API runs in query-only mode.

The program reads invoices and disregards everything else, by design. Verified by automated tests.

## 3. Testing

16 automated tests, all passing:
- `scripts/test_sync_logic.py` (5): upsert idempotency, out-of-order handling, soft-delete/restore, audit logging, re-backfill safety.
- `scripts/test_qbo_client.py` (11): OAuth rotation, 401-refresh-retry, 429 backoff, 5xx give-up, pagination, plus the three read-only enforcement tests.

CI: `.github/workflows/test.yml` runs everything on every push.

## 4. Current status — done vs. not

**Done:** all code written/tested/pushed to PR #1; QBO Developer app created; sandbox credentials obtained (realm id `9130357960294036`); one-command setup script + `.env` template.

**Not done:** first backfill not run (no invoices pulled yet); still sandbox (not real Colvard QBO); not connected to the real `master.db` or live dashboards; no auto-refresh running; PR #1 still a draft.

## 5. Deployment reality (Cloudflare)

The existing 24 dashboards appear to be on Cloudflare. The invoices feature uses Python (FastAPI) + SQLite + a background sync process. **Cloudflare Pages serves only static files, so this stack does not drop onto Pages unchanged.** Two paths:

- **Path A** — keep the Python stack on a small always-on server ($5–7/mo, or wherever `master.db` already updates); Cloudflare serves the page, which calls that server's API. Minimal changes.
- **Path B** — rebuild native to Cloudflare with Workers + D1 + Cron Triggers. More work; everything stays in Cloudflare.

**This decision is still open** and depends on how the current dashboards are built (static files vs. Workers).

## 6. Next steps (in order)

1. Decide deployment Path A vs. B.
2. Run the first backfill (paste sandbox creds for a live demo, or run `scripts/go_live.sh` on a machine with Python + the repo).
3. Set up the 60s refresh (cron / systemd timer, or Cloudflare Cron Trigger for Path B).
4. Wire the page into the dashboard set under a new "Sales" section.
5. Graduate to production QuickBooks (Intuit app-review form; ~1–3 days).

> **Reality check:** this work runs on a real machine you control — not from the chat. Seeing these messages in Claude Code on your laptop does **not** mean the assistant has access to your laptop's files; the session runs in an isolated cloud container that contains only this Git repository.

## 7. Where everything lives

All code + docs are on PR #1. Key docs:

| File | Covers |
|---|---|
| `docs/qbo-connection-walkthrough.md` | Step-by-step QuickBooks setup |
| `docs/invoices-schema-design.md` | Database design + rationale |
| `docs/invoices-page-design.md` | Page + API design |
| `docs/invoices-sync-design.md` | Sync engine + read-only safety |
| `README.md` | 3-step implementation guide |
