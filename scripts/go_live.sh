#!/usr/bin/env bash
#
# go_live.sh — one command to stand up the invoices dashboard.
#
# What it does, in order:
#   1. Checks Python 3 is available
#   2. Installs the Python dependencies
#   3. Loads your credentials from .env
#   4. Runs the first backfill from QuickBooks (skipped if --no-backfill)
#   5. Starts the live invoices page at http://localhost:8765
#
# Usage:
#   cp .env.example .env       # then edit .env with your real values
#   ./scripts/go_live.sh
#
# Re-run any time. The backfill is idempotent — it won't duplicate data.

set -euo pipefail
cd "$(dirname "$0")/.."

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
say()  { printf "${GREEN}==>${NC} %s\n" "$1"; }
warn() { printf "${YELLOW}!!${NC} %s\n" "$1"; }
die()  { printf "${RED}xx${NC} %s\n" "$1" >&2; exit 1; }

# ── 1. Python ───────────────────────────────────────────────────────────────
command -v python3 >/dev/null 2>&1 || die "python3 not found. Install Python 3.10+ first (https://www.python.org/downloads/)."
PYV=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
say "Found Python $PYV"

# ── 2. Dependencies ─────────────────────────────────────────────────────────
say "Installing dependencies (fastapi, uvicorn, httpx)..."
python3 -m pip install --quiet --upgrade fastapi 'uvicorn[standard]' httpx \
    || die "pip install failed. Try: python3 -m pip install --user fastapi uvicorn httpx"

# ── 3. Credentials ──────────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
    warn "No .env file found."
    warn "Run:  cp .env.example .env   then edit it with your QuickBooks values."
    die  "Create .env first, then re-run this script."
fi
set -a; source .env; set +a
say "Loaded credentials from .env (environment: ${QBO_ENVIRONMENT:-unset})"

for v in QBO_CLIENT_ID QBO_CLIENT_SECRET QBO_REFRESH_TOKEN QBO_REALM_ID; do
    val="${!v:-}"
    if [[ -z "$val" || "$val" == *"_here" ]]; then
        die "$v is not set in .env (still has the placeholder). Edit .env and fill it in."
    fi
done

# ── 4. Backfill ─────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--no-backfill" ]]; then
    warn "Skipping backfill (--no-backfill given)."
else
    say "Running first backfill from QuickBooks (this reads invoices only)..."
    python3 -m api.sync.cli backfill --since 2026-01-01 \
        || die "Backfill failed. Check your credentials in .env, then re-run."
    say "Backfill complete. Sync status:"
    python3 -m api.sync.cli status || true
fi

# ── 5. Serve ────────────────────────────────────────────────────────────────
say "Starting the invoices page..."
printf "\n${GREEN}Open this in your browser:${NC}  http://localhost:8765/\n\n"
printf "To keep it updating every 60s, open a SECOND terminal and run:\n"
printf "  while true; do python3 -m api.sync.cli cdc; sleep 60; done\n\n"
printf "Press Ctrl+C to stop the server.\n\n"
exec python3 -m uvicorn api.invoices_api:app --host 0.0.0.0 --port 8765
