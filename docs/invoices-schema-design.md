# Invoices schema — design notes & adversarial review

Schema lives in [`schema/invoices.sql`](../schema/invoices.sql). This doc is the rationale, the assumptions, and the deliberate trade-offs. Read it before touching the SQL.

> **On "infallible."** No schema is infallible — every design closes some doors and opens others. What this design promises is: defensible defaults, every assumption named, every known failure mode listed below. If a section here surprises you, push back before we build on it.

---

## Design rationale (the choices that matter)

| Choice | Why |
|---|---|
| **`(realm_id, qbo_id)` composite PK** | Survives multi-company QBO setups (sandbox+prod, parent+sub, future M&A). Adds one column; costs nothing today. |
| **Money in INTEGER cents** | Floats accumulate rounding error. QBO returns floats; convert with `int(round(x * 100))` once at ingest. |
| **Dates as ISO 8601 TEXT** | SQLite has no date type. ISO 8601 sorts lexically. Use date-only (`YYYY-MM-DD`) for business dates, UTC datetime (`YYYY-MM-DDTHH:MM:SSZ`) for timestamps. Bucket into "this week / next week" in `America/New_York` at query time. |
| **Status is derived, not stored** | OVERDUE depends on `today`. Storing it requires a daily refresh job that can fail silently. Compute in the API layer from `balance_cents`, `email_status`, `due_date`, `is_voided`. One source of truth. |
| **Soft-delete via `deleted_utc`** | QBO supports hard delete via API + CDC. Soft-delete preserves audit trail and lets a panicked user query history. Live queries filter `deleted_utc IS NULL`. |
| **Denormalized `customer_name` on invoices** | Alpha sort is the dominant query; joining 5,000 invoices to a customer table on every page load is wasteful. Cost: on customer rename, we must `UPDATE invoices SET customer_name = ? WHERE customer_qbo_id = ?`. Handled by a customer-rename webhook or daily reconcile. |
| **Lines: replace-on-update, not diff** | At Colvard's scale (~5 lines/invoice, ~5k invoices) the replace cost is negligible. Diffing is a bug factory. |
| **`custom_fields_json` blob** | QBO supports up to 3 custom fields, configured per-company. Capture them all without schema churn. |
| **Partial index for the page query** | `idx_invoices_open` covers `balance_cents > 0 AND deleted_utc IS NULL AND is_voided = 0` — the exact filter for the live page. |
| **Append-only `invoice_sync_log`** | When sync goes wrong (it will), this is the first place ops looks. Pruned nightly to 30 days. |

---

## Adversarial review — failure modes I went looking for

### Money & arithmetic

- **Float drift.** Mitigated by INTEGER cents. The one risk: tax can produce fractional cents in some jurisdictions. Maine on standard food/sausage rates: no fractional cents. Documented.
- **Negative line amounts.** Allowed (within-invoice refunds/adjustments). `CHECK (amount_cents)` does **not** restrict sign on lines.
- **Voided invoices have TotalAmt = 0.** Handled: `CHECK (total_cents >= 0 OR is_voided = 1)`.
- **Multi-currency.** Plan assumes USD-only (confirmed by KeHE brief: Maine + adjacent states, USD). `currency` column reserves the door; no FX conversion logic in v1.

### Identity & uniqueness

- **DocNumber is not unique.** QBO allows manual override. Not constrained.
- **SyncToken race.** Two writers (cron + webhook) can collide. UPSERT must use `WHERE excluded.sync_token > invoices.sync_token` (cast to integer for comparison; QBO returns string but value is monotonic). Logged on conflict.
- **QBO realm switch.** If Colvard ever migrates QBO companies, `realm_id` differentiates. No code change to schema needed.

### Sync correctness

- **QBO CDC misses.** QuickBooks CDC occasionally drops events. Mitigated by combining: webhook (fast) + 60s poll (reconcile) + nightly full sync (last resort). Cursor in `invoice_sync_state.last_cdc_cursor_utc`.
- **Pagination.** QBO returns max 1,000 results per query. Sync code must handle (not a schema concern, flagged for the `sync_invoices.py` build).
- **Deletes.** Soft-delete on receipt of QBO delete CDC payload. Hard delete is reversible only via QBO restore, so soft-delete buys safety.
- **Out-of-order events.** Webhook for invoice X arrives after a newer webhook for X. UPSERT with `sync_token` comparison drops the stale event.

### Customer model

- **Sub-customer depth.** Schema captures `customer_parent_qbo_id` (single level). QBO supports arbitrary nesting. **Assumption: Colvard uses ≤1 level** (Hannaford → store-N is the dominant pattern). If deeper, the parent chain must be resolved by sync code, not schema.
- **Customer rename.** Denormalized name will go stale until the rename is propagated. Mitigated by: (a) capturing `Customer.LastUpdatedTime` in a separate customer sync; (b) running a daily reconcile that re-pulls names; (c) honoring `Customer` events on the QBO webhook.

### Lines edge cases

- **DetailType variety.** SalesItemLineDetail, DiscountLineDetail, SubTotalLineDetail, GroupLineDetail. All persisted; non-item lines have null `item_qbo_id`. Page display filters to item lines only by default.
- **GroupLineDetail (bundles).** Captured flat; not exploded into sub-lines. Colvard usage today: assumed none. If adopted, sync extension required (no schema change unless we want bundle hierarchy).
- **Description-only lines.** `item_qbo_id` null, `description` populated, `amount_cents` 0 — allowed.
- **Line tax & class.** Captured for Gen 1 vs Gen 2 analytics that already exist elsewhere in the dashboards.

### Concurrency & integrity

- **Single writer (sync) + readers (API).** Requires `PRAGMA journal_mode = WAL` at connection open. Documented in the SQL header. Not enforced by DDL.
- **`PRAGMA foreign_keys = ON`** is per-connection. Easy to forget; documented in the SQL header.
- **`CHECK` constraints** are minimal — only on values that cannot be wrong (`balance_cents >= 0`, `is_voided IN (0,1)`). Over-constraining causes sync failures on weird QBO data that's still "valid" QBO data.

### Performance at scale

- Estimated steady-state size: ~5k–8k invoices, ~30k–40k lines. SQLite handles this in microseconds for indexed reads.
- Dominant page query (`WHERE txn_date BETWEEN ? AND ? AND balance_cents > 0 ORDER BY customer_name`) is covered by `idx_invoices_open`.
- `invoice_sync_log` grows linearly with sync events (~10k/day at 60s polling + webhooks). 30-day pruning keeps it under 1M rows.

---

## What is deliberately NOT in v1

| Out of scope | Why | When to add |
|---|---|---|
| **`payments` + `payment_links` tables** | Balance reduction is enough for the "this week / next week" page. Full payment history isn't on screen. | Add when AR-aging page lands. |
| **`credit_memos` table** | Same — credit memos affect Balance, which is captured. | Add with payments. |
| **Recurring invoice templates** | QBO `RecurringTransaction` is a separate object. "Next week" invoices that exist as recurring templates won't appear until QBO instantiates them. **Confirm with Frank: is this OK, or do you want scheduled-but-not-yet-created visible too?** | If "yes," add a `recurring_templates` table. |
| **EDI 850/810/856 envelopes** | KeHE-readiness item, not invoice-page item. | When EDI broker is engaged. |
| **Gross margin (COGS join)** | Per audit, COGS column is the next big unlock — but it lives on `transactions`, not invoices. Cross-join later. | When `transactions.LineCogs` is populated. |
| **Class hierarchy** | Captured as a flat `class_qbo_id` + `class_name`; QBO supports nested classes which Colvard isn't using today. | Only if Colvard adds nested classes. |

---

## Open questions — defaults are reasonable but worth confirming

1. **QuickBooks Online or Desktop?** Schema is identical. Sync layer differs. **Default: QBO.**
2. **Week boundary.** Monday→Sunday (ISO 8601, business default) or Sunday→Saturday (US calendar)? **Default: Monday.**
3. **"This week / next week" bucketed by which date?** `txn_date` (when invoiced) is the default. Could be `due_date` (AR view) or `service_date` (delivery view). **Default: `txn_date`, with a UI toggle in v2.**
4. **Show recurring-template invoices that haven't been instantiated yet?** Today: no (only real invoices in QBO show up). If yes, schema extension needed.
5. **Single QBO realm?** If yes, the `realm_id` machinery is dormant but harmless. **Default: yes.**
6. **Sub-customer hierarchy depth.** Are any Colvard customers nested more than one level deep? **Default: no.**
7. **Tax-inclusive or tax-exclusive pricing in QBO?** Affects how `tax_cents` reconciles with line totals. **Default: tax-exclusive (US standard).**

---

## Migration & rollout

1. Apply `schema/invoices.sql` against a copy of master.db (`sqlite3 master.db < schema/invoices.sql`). The file is idempotent (`CREATE TABLE IF NOT EXISTS` + `PRAGMA user_version`). Re-running is safe.
2. Verify with `PRAGMA user_version;` → returns `1`.
3. Insert a single row of test data; query the partial index with `EXPLAIN QUERY PLAN`. Confirm it uses `idx_invoices_open`.
4. Backfill via `sync_invoices.py --backfill --since 2026-01-01` (build coming next).
5. Static dashboards continue to work unchanged — they don't read these tables.

---

## What scrutiny did NOT catch

Honesty: I designed this from the QBO Invoice API spec, the OPCON audit, and the KeHE brief. I did **not** read your actual `master.db` schema (no access), the `Claude_v1_handoff_20260512.zip` (too large for this session), or any prior `invoices.html` work. Specifically:

- I don't know your existing `customers` table column names. The FK from `invoices.customer_qbo_id` may need a join column rename.
- I don't know whether `transactions` has a column that should be re-pointed at `invoices.qbo_id` for AR reconciliation.
- I don't know what your dashboard build's nav configuration file looks like — adding a "Sales" group is HTML work, not schema.

If you can paste `PRAGMA table_info(customers);` and `PRAGMA table_info(transactions);` from your real master.db, I can tighten the integration before the next build step.
