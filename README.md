# Colvard Sausages

Repository for Colvard & Co LLC dashboards, analytics, and operational tooling.

## Invoices dashboard (this week & next week)

A near-real-time invoices page that mirrors QuickBooks Online: current week +
next week, alphabetical by customer, collapsible line items. Read-only — it can
never write to QuickBooks or touch anything but invoices.

### How to implement it (3 steps)

You need a computer with Python 3.10+ and this repository downloaded.

**1. Get the code onto your machine**
```bash
git clone https://github.com/Colvard-Sausages/Colvard-Sausages.git
cd Colvard-Sausages
git checkout claude/laptop-connection-status-4lzgd
```

**2. Add your QuickBooks credentials**
```bash
cp .env.example .env
```
Open `.env` in any text editor and paste in the 4 values from your QuickBooks
setup (the full walk-through is in `docs/qbo-connection-walkthrough.md`).

**3. Go live**
```bash
./scripts/go_live.sh
```
That one command installs everything, pulls your invoices from QuickBooks, and
opens the page at **http://localhost:8765**.

To keep it refreshing automatically, open a second terminal and run:
```bash
while true; do python3 -m api.sync.cli cdc; sleep 60; done
```

### Documentation

| Doc | What it covers |
|---|---|
| `docs/qbo-connection-walkthrough.md` | Step-by-step QuickBooks app setup (the manual part) |
| `docs/invoices-schema-design.md` | Database design + rationale |
| `docs/invoices-page-design.md` | The page + API design |
| `docs/invoices-sync-design.md` | The QuickBooks sync engine + read-only safety rails |

### Test it

```bash
python3 scripts/test_sync_logic.py    # 5 tests
python3 scripts/test_qbo_client.py    # 11 tests
```
