#!/usr/bin/env bash
#
# bootstrap.sh — install everything the Colvard pipeline needs on the new Mac.
#
# Safe to re-run: every step checks before it acts. It installs tools only;
# it does NOT copy data, start jobs, or touch launchd.
#
#   1. Homebrew (runs Apple's/Homebrew's installer if missing — asks for your password)
#   2. System tools: python@3.14, node@24, tesseract, poppler, ghostscript,
#      graphviz, zbar, pango, cairo, ffmpeg, gh
#   3. Python venv at ~/colvard-venv (Python 3.14 — matches the laptop)
#   4. The laptop's Python packages (requirements-mac.txt = laptop list minus
#      5 Windows-only packages)
#   5. Playwright's Chromium
#   6. An import check of the packages that need system libraries
#
# Usage (from the repo root):   bash deploy/mac/bootstrap.sh

set -euo pipefail
cd "$(dirname "$0")"

VENV="${COLVARD_VENV:-$HOME/colvard-venv}"
FORMULAS=(python@3.14 node@24 tesseract poppler ghostscript graphviz zbar pango cairo ffmpeg gh)

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
say()  { printf "${GREEN}==>${NC} %s\n" "$1"; }
warn() { printf "${YELLOW}!!${NC} %s\n" "$1"; }
die()  { printf "${RED}xx${NC} %s\n" "$1" >&2; exit 1; }

[[ "$(uname -s)" == "Darwin" ]] || die "This script is for macOS."
[[ -f requirements-mac.txt ]] || die "requirements-mac.txt not found next to this script."

# Append a line to ~/.zprofile once (new Terminal windows pick it up).
add_to_zprofile() {
    touch "$HOME/.zprofile"
    grep -qxF "$1" "$HOME/.zprofile" || printf '%s\n' "$1" >> "$HOME/.zprofile"
}

# ── 1. Homebrew ─────────────────────────────────────────────────────────────
if ! command -v brew >/dev/null 2>&1; then
    for p in /opt/homebrew/bin/brew /usr/local/bin/brew; do
        [[ -x "$p" ]] && eval "$("$p" shellenv)" && break
    done
fi
if ! command -v brew >/dev/null 2>&1; then
    say "Installing Homebrew (it will ask for your Mac password)..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    for p in /opt/homebrew/bin/brew /usr/local/bin/brew; do
        [[ -x "$p" ]] && eval "$("$p" shellenv)" && break
    done
    command -v brew >/dev/null 2>&1 || die "Homebrew install did not complete."
fi
BREW_PREFIX="$(brew --prefix)"
add_to_zprofile "eval \"\$(${BREW_PREFIX}/bin/brew shellenv)\""
say "Homebrew ready at ${BREW_PREFIX}"

# ── 2. System tools ─────────────────────────────────────────────────────────
missing=()
for f in "${FORMULAS[@]}"; do
    brew list --formula "$f" >/dev/null 2>&1 || missing+=("$f")
done
if ((${#missing[@]})); then
    say "Installing: ${missing[*]}"
    brew install "${missing[@]}"
else
    say "System tools already installed."
fi
# node@24 is keg-only (not on PATH by default).
add_to_zprofile "export PATH=\"${BREW_PREFIX}/opt/node@24/bin:\$PATH\""
export PATH="${BREW_PREFIX}/opt/node@24/bin:$PATH"

# ── 3. Python 3.14 venv ─────────────────────────────────────────────────────
PY314="${BREW_PREFIX}/bin/python3.14"
[[ -x "$PY314" ]] || die "python3.14 not found at $PY314"
if [[ ! -x "$VENV/bin/python" ]]; then
    say "Creating venv at $VENV"
    "$PY314" -m venv "$VENV"
fi
VENV_VER="$("$VENV/bin/python" -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
[[ "$VENV_VER" == "3.14" ]] || die "$VENV is Python $VENV_VER, expected 3.14. Move it aside and re-run."

# Homebrew's libraries (zbar, pango, cairo) live outside the default search
# path on Apple Silicon; pyzbar/weasyprint/cairocffi need this to find them.
MARK="# colvard: homebrew dylibs"
if ! grep -qF "$MARK" "$VENV/bin/activate"; then
    {
        printf '\n%s\n' "$MARK"
        printf 'export DYLD_FALLBACK_LIBRARY_PATH="%s/lib${DYLD_FALLBACK_LIBRARY_PATH:+:$DYLD_FALLBACK_LIBRARY_PATH}"\n' "$BREW_PREFIX"
    } >> "$VENV/bin/activate"
fi
set +u  # activate scripts aren't guaranteed to be nounset-safe
# shellcheck disable=SC1091
source "$VENV/bin/activate"
set -u
say "Venv ready: $(python --version) at $VENV"

# ── 4. Python packages ──────────────────────────────────────────────────────
say "Installing Python packages (244 pinned; first run takes several minutes)..."
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r requirements-mac.txt

# ── 5. Playwright browser ───────────────────────────────────────────────────
say "Installing Playwright Chromium..."
python -m playwright install chromium

# ── 6. Verify ───────────────────────────────────────────────────────────────
say "Checking the packages that depend on system libraries..."
fail=0
check() {  # check <label> <python statement>
    if python -c "$2" >/dev/null 2>&1; then
        printf "  ${GREEN}ok${NC}    %s\n" "$1"
    else
        printf "  ${RED}FAIL${NC}  %s\n" "$1"; fail=1
    fi
}
check duckdb       "import duckdb; duckdb.sql('select 1').fetchall()"
check ortools      "from ortools.linear_solver import pywraplp"
check pandas       "import pandas, numpy, scipy, sklearn, statsmodels"
check weasyprint   "import weasyprint"
check cairosvg     "import cairosvg"
check pyzbar       "from pyzbar import pyzbar"
check pytesseract  "import pytesseract; pytesseract.get_tesseract_version()"
check pdf2image    "import pdf2image, shutil; assert shutil.which('pdftoppm')"
check PyMuPDF      "import fitz"
check playwright   "from playwright.sync_api import sync_playwright"
check fastapi      "import fastapi, uvicorn, flask"
check google-api   "import googleapiclient, google_auth_oauthlib"
check twilio       "import twilio"
check xlwings      "import xlwings"
for tool in node npx git gh dot gs ffmpeg; do
    if command -v "$tool" >/dev/null 2>&1; then
        printf "  ${GREEN}ok${NC}    %s\n" "$tool"
    else
        printf "  ${RED}FAIL${NC}  %s\n" "$tool"; fail=1
    fi
done

echo
if ((fail)); then
    warn "Some checks failed (above). Paste this output to Claude."
else
    say "All checks passed."
fi
cat <<EOF

Next:
  - Open a NEW Terminal window (so ~/.zprofile takes effect).
  - Activate the environment in each Terminal:   source $VENV/bin/activate
  - Python 3.15 stays installed; the pipeline uses 3.14 via this venv.
  - Sign in to GitHub once:                       gh auth login
  - Copy the laptop folders (plan section 4), then do the porting (docs/mac-port-handoff.md).
EOF
