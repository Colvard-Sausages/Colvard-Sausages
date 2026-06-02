-- ============================================================================
-- Colvard dashboards — invoices schema (v1)
-- ============================================================================
-- Adds AR / live-invoice tables sourced from QuickBooks Online.
-- Designed to coexist with the existing master.db transactions table without
-- disturbing the static dashboard builder.
--
-- Target: SQLite >= 3.24 (UPSERT support).
-- Required at connection setup (not enforceable via DDL):
--   PRAGMA journal_mode = WAL;        -- concurrent reader + writer
--   PRAGMA foreign_keys = ON;         -- enforced per-connection
--   PRAGMA busy_timeout = 5000;       -- absorb sync/api contention
--
-- All money is stored as INTEGER cents to avoid float drift.
-- All dates are ISO 8601 TEXT: YYYY-MM-DD for date-only, YYYY-MM-DDTHH:MM:SSZ
-- for UTC timestamps. SQLite has no native date type; ISO 8601 sorts lexically.
-- ============================================================================

-- ============================================================================
-- invoices: one row per QBO Invoice (header).
--
-- Status (OPEN/SENT/VIEWED/PARTIAL/PAID/OVERDUE/VOIDED) is DERIVED at query
-- time from balance_cents, email_status, due_date, is_voided. It is NOT
-- stored because OVERDUE depends on the current date and would go stale
-- without a daily refresh job.
--
-- Primary key is (realm_id, qbo_id) to support multi-company QBO setups
-- (e.g., a future sandbox + production split, or a parent-company structure).
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoices (
    -- Identity
    qbo_id                  TEXT    NOT NULL,
    realm_id                TEXT    NOT NULL,
    sync_token              TEXT    NOT NULL,                  -- QBO optimistic concurrency
    doc_number              TEXT,                              -- Human-readable invoice number; may be reused

    -- Customer
    customer_qbo_id         TEXT    NOT NULL,
    customer_name           TEXT    NOT NULL,                  -- Denormalized for sort; refresh on customer rename
    customer_parent_qbo_id  TEXT,                              -- For Hannaford-style sub-customers (assumes single level)

    -- Dates (ISO 8601: dates are YYYY-MM-DD; timestamps are UTC YYYY-MM-DDTHH:MM:SSZ)
    txn_date                TEXT    NOT NULL,                  -- Invoice date (date-only)
    due_date                TEXT,
    ship_date               TEXT,
    service_date            TEXT,                              -- Invoice-level if set; lines may override
    created_utc             TEXT    NOT NULL,                  -- QBO MetaData.CreateTime
    updated_utc             TEXT    NOT NULL,                  -- QBO MetaData.LastUpdatedTime

    -- Money (cents)
    total_cents             INTEGER NOT NULL,
    balance_cents           INTEGER NOT NULL,                  -- 0 = paid; > 0 = open
    tax_cents               INTEGER NOT NULL DEFAULT 0,
    currency                TEXT    NOT NULL DEFAULT 'USD',

    -- Lifecycle flags
    email_status            TEXT,                              -- NotSet | NeedToSend | EmailSent | EmailViewed
    is_voided               INTEGER NOT NULL DEFAULT 0,        -- 0/1
    deleted_utc             TEXT,                              -- Soft-delete timestamp; null = live

    -- Terms & routing
    terms_qbo_id            TEXT,
    terms_name              TEXT,                              -- 'Net 30', etc.
    private_note            TEXT,
    customer_memo           TEXT,
    bill_email              TEXT,
    tracking_num            TEXT,

    -- QBO extensibility (avoid schema churn for custom fields)
    custom_fields_json      TEXT,                              -- JSON array of QBO CustomField[]

    -- Provenance
    last_synced_utc         TEXT    NOT NULL,
    sync_source             TEXT    NOT NULL DEFAULT 'poll',   -- poll | webhook | backfill

    PRIMARY KEY (realm_id, qbo_id),
    CHECK (total_cents >= 0 OR is_voided = 1),
    CHECK (balance_cents >= 0),
    CHECK (is_voided IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_invoices_customer_name ON invoices(customer_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_invoices_txn_date      ON invoices(txn_date);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date      ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_qbo  ON invoices(customer_qbo_id);
CREATE INDEX IF NOT EXISTS idx_invoices_updated       ON invoices(updated_utc);

-- Partial index for the dominant page query: open invoices in a date window
CREATE INDEX IF NOT EXISTS idx_invoices_open
    ON invoices(txn_date, customer_name COLLATE NOCASE)
    WHERE balance_cents > 0 AND deleted_utc IS NULL AND is_voided = 0;

-- ============================================================================
-- invoice_lines: one row per QBO Invoice Line.
--
-- All DetailType values are persisted (SalesItemLineDetail, DiscountLineDetail,
-- SubTotalLineDetail, GroupLineDetail) so totals reconcile. Non-item lines have
-- null item_qbo_id but keep detail_type and amount_cents.
--
-- GroupLineDetail (item bundles) is not exploded into sub-lines in v1; the
-- group line is captured flat. If Colvard adopts grouped items later, the
-- sync layer must be extended.
--
-- Sync strategy: on invoice update, DELETE all lines for that invoice and
-- INSERT fresh. Simpler than diffing; line IDs are stable per invoice version
-- in QBO but the cost of full replace is negligible at this scale.
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoice_lines (
    realm_id            TEXT    NOT NULL,
    invoice_qbo_id      TEXT    NOT NULL,
    line_id             TEXT    NOT NULL,                      -- QBO Line.Id
    line_num            INTEGER NOT NULL,                      -- Display order (1-based)

    -- Item
    item_qbo_id         TEXT,                                  -- Null for non-item lines
    item_name           TEXT,                                  -- Denormalized for display
    item_sku            TEXT,                                  -- QBO Item.Sku, if present
    description         TEXT,
    detail_type         TEXT    NOT NULL,                      -- SalesItemLineDetail | DiscountLineDetail | ...

    -- Quantities & money
    quantity            REAL,                                  -- QBO supports fractional
    unit_price_cents    INTEGER,                               -- Null for non-item lines
    amount_cents        INTEGER NOT NULL,                      -- Can be negative (within-invoice refunds)

    -- Tax & class
    tax_code_qbo_id     TEXT,
    is_taxable          INTEGER NOT NULL DEFAULT 0,
    class_qbo_id        TEXT,                                  -- Useful for Gen 1 vs Gen 2 split
    class_name          TEXT,

    -- Service / delivery
    service_date        TEXT,                                  -- Line-level service date if set

    PRIMARY KEY (realm_id, invoice_qbo_id, line_id),
    FOREIGN KEY (realm_id, invoice_qbo_id)
        REFERENCES invoices(realm_id, qbo_id)
        ON DELETE CASCADE,
    CHECK (is_taxable IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_lines_invoice ON invoice_lines(realm_id, invoice_qbo_id);
CREATE INDEX IF NOT EXISTS idx_lines_item    ON invoice_lines(item_qbo_id);
CREATE INDEX IF NOT EXISTS idx_lines_service ON invoice_lines(service_date);

-- ============================================================================
-- invoice_sync_state: singleton sync cursor for incremental CDC pulls.
-- One row per realm_id. realm_id is the natural key but a singleton check
-- is added for the single-company case.
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoice_sync_state (
    realm_id                TEXT    PRIMARY KEY,
    last_full_sync_utc      TEXT,
    last_cdc_cursor_utc     TEXT,                              -- QBO ChangedSince cursor
    last_webhook_utc        TEXT,
    full_sync_count         INTEGER NOT NULL DEFAULT 0,
    error_count_24h         INTEGER NOT NULL DEFAULT 0,
    notes                   TEXT
);

-- ============================================================================
-- invoice_sync_log: append-only audit trail.
-- Prune nightly to last 30 days (operational concern, not schema).
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoice_sync_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ts_utc          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    event_type      TEXT    NOT NULL,                          -- poll | webhook | backfill | error | prune | rename
    realm_id        TEXT,
    qbo_id          TEXT,
    action          TEXT,                                      -- insert | update | no_change | soft_delete | skip
    sync_token_old  TEXT,
    sync_token_new  TEXT,
    detail_json     TEXT,
    error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_log_ts    ON invoice_sync_log(ts_utc);
CREATE INDEX IF NOT EXISTS idx_log_event ON invoice_sync_log(event_type);
CREATE INDEX IF NOT EXISTS idx_log_qbo   ON invoice_sync_log(qbo_id);

-- ============================================================================
-- Schema version. Bump on every change. Migration runner reads this.
-- ============================================================================
PRAGMA user_version = 1;
