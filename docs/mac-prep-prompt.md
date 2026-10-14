# Mac prep prompt (reviewed). Paste into Claude Code running ON the Mac

Frank's prompt of 2026-10-14, with corrections marked **[FIX]**. Hard rules unchanged.

---

You are preparing Frank's new MacBook to take over the Colvard BI pipeline from his Windows laptop. The laptop is STILL LIVE and runs every scheduled job today. This session only PREPARES the Mac. Nothing here may touch a live system.

HARD RULES (do not break any, even if a step seems to need it)
- Do NOT run any BI pipeline, deploy, or sync script (nothing under "Master Data/pipeline" except the two read-only checks in step 8), and no .bat file.
- Do NOT run wrangler or npx wrangler, QuickBooks auth/pull scripts, TrackPod scripts, `git push`, or anything that writes to Cloudflare (D1, KV, Pages, Worker), QuickBooks, TrackPod, email or GitHub.
- Do NOT store any QuickBooks, Cloudflare, TrackPod or Worker credential yet. Only one machine may pull QuickBooks at a time; that moves on cutover day. **[FIX] The SMB copy already contains live credential files (.env, token JSONs). Never copy them into ~/Colvard, and never run anything that reads them.** Intuit rotates the QuickBooks refresh token on use, so one accidental pull from the Mac could break the laptop's sync.
- Do NOT create or load any launchd job yet, and do not start update_bi_listener.py or live_sync.py.
- Do NOT delete or move anything in the copied folders below. Ask Frank before any `sudo` command and before anything not on this list.

WHAT IS ALREADY ON THE MAC
- Copied from the laptop over SMB on 2026-10-14:
  - `~/Hard Drive Documents/Colvard Sausage/...`. The BI folder is `~/Hard Drive Documents/Colvard Sausage/Operations/Succurre/Weekly Briefs/Claude v1`. It has Windows line endings and Windows worktree records; treat it as a DATA source, not the working checkout.
  - `~/Desktop/Python/`: QuickBooks input/output folders.
  - `~/ProgramData/colvard/`: laptop runtime state (do not use).
  - `~/inventory/`: pip.txt, npm.txt, runtimes.txt, apps.csv, task-actions.csv.
- **[FIX] Already installed by `~/Colvard-Sausages/deploy/mac/bootstrap.sh` (all checks passed):**
  - Homebrew, python@3.14, node@24, gh, tesseract, poppler, ghostscript, graphviz, zbar, pango, cairo, ffmpeg
  - a venv at `~/colvard-venv` holding all 244 laptop packages, plus Playwright Chromium
  - gh is signed in as `Frank-Bukoski`

STEPS
1. Inventory: macOS version, chip, free disk, versions of brew, python3.14, node, git, gh and LibreOffice. Read ~/inventory/runtimes.txt and pip.txt (the laptop runs Python 3.14.7).
2. Install only what's missing: the `libreoffice` cask, plus anything step 1 shows absent. **[FIX]** Skip `gh auth login` if `gh auth status` already shows Frank-Bukoski.
3. Fresh clone (clean Mac line endings) to ~/Colvard/BI:
     `git clone https://github.com/MyLiege-FJB/colvard-bi-system.git ~/Colvard/BI`
   - If access is denied for Frank-Bukoski, stop and report. **[FIX]** If the repo has since been transferred to Colvard-Sausages, the old URL redirects.
   - Then run `git -C ~/Colvard/BI config user.name "Frank Bukoski"` and the same for `user.email fbukoski@gmail.com`. Stay on branch master.

3b. **[FIX] Drift check (read-only). The laptop had 512 uncommitted files.** A fresh clone lacks any code changed on the laptop but never committed, or committed but never pushed. Without touching the copy's index:
   ```bash
   C=~/"Hard Drive Documents/Colvard Sausage/Operations/Succurre/Weekly Briefs/Claude v1"
   GIT_OPTIONAL_LOCKS=0 git -C "$C" -c core.autocrlf=true -c core.fileMode=false status --short --untracked-files=no
   GIT_OPTIONAL_LOCKS=0 git -C "$C" rev-parse master; git -C ~/Colvard/BI rev-parse master
   ```
   - Report every modified tracked file.
   - Report whether the two `master` hashes differ. If they do, the laptop has commits GitHub doesn't.
   - Don't fix anything; Frank decides whether the laptop commits and pushes first.

4. Python env: **[FIX] one venv only.** Create `~/Colvard/venv` as specified. Then `~/colvard-venv` is redundant: report it, don't delete it. Every future launchd job must point at `~/Colvard/venv`.
   **[FIX]** Don't put `~` inside quotes, because it won't expand:
   ```bash
   python3.14 -m venv ~/Colvard/venv && source ~/Colvard/venv/bin/activate
   pip install -r ~/Colvard/BI/"Master Data/requirements.txt" -r ~/Colvard/BI/Gen2/requirements.txt
   python -m playwright install chromium
   ```
   Compare against ~/inventory/pip.txt. Report anything the laptop has that the Mac still lacks; at minimum check pandas, openpyxl, ortools, psutil, keyring, reportlab, PyMuPDF/fitz, jinja2 and playwright. Skip the Windows-only packages: pywin32, pywin32-ctypes, comtypes, pywinpty, win_unicode_console. Flag any project code that imports them.

5. Copy the runtime files git does not carry, FROM the SMB copy INTO the clone (copy, never move), keeping relative paths under the repo root:
   - `Master Data/data/production.db` and `Master Data/data/master.db`
   - `Master Data/production_plans/` and `Master Data/inputs/`
   - `Master Data/data/{loose_pack_rulings.json, call_list_flags.json, pickup_slot_assignments.json, uom_decisions.json, haccp_changes.csv, pick_sheets_manifest.json, route_sheets_manifest.json, last_deployed_pm.html}`
   - `Master Data/data/pick_sheets/` and `Master Data/data/route_sheets/`
   - `Master Data/dashboards/{invoices_this_week_data.json, invoices_this_week.json, invoices_last_week.csv, invoices_this_week.csv, invoices_next_week.csv}`
   - `Logs/{trackpod_push_latest.json, trackpod_optimize_latest.json, qbo_invoices_previous.json, qbo_invoices_last_scheduled.json, qbo_last_pull_hashes.json, qbo_invoices_diff_latest.json}`

   Afterwards, `git -C ~/Colvard/BI status --short` must show no tracked changes; report if it does. These files get re-copied fresh on cutover day; this is a rehearsal copy. **[FIX]** Before copying any `.db`, check the copy isn't mid-write: if a `-wal` file exists next to it, report it, because the copy may be inconsistent.

6. System settings (tell Frank which ones he must click himself):
   - Time zone America/New_York.
   - A fixed name: ask Frank, then `sudo scutil --set HostName colvard-mac`, and the same for LocalHostName and ComputerName.
   - On the power adapter, never sleep: `sudo pmset -c sleep 0 disksleep 0`. **[FIX]** Closing the MacBook's lid still sleeps it unless an external display, power and a keyboard are attached. Tell Frank.
   - **[FIX] Automatic login: macOS doesn't allow it while FileVault is on, and FileVault is on.** Don't turn FileVault off. Report the tradeoff to Frank:
     - **(a) Keep FileVault (recommended):** after any reboot, the jobs wait until he logs in. Use `sudo fdesetup authrestart` for planned restarts.
     - **(b) Turn FileVault off:** jobs resume unattended, but the disk, with business data and credentials, is unencrypted if the laptop is lost.
   - **[FIX] Full Disk Access for Python: don't grant it yet. Report the alternative to Frank instead.**
     - Granting FDA to the venv's Python gives every Python script full disk access.
     - The grant can also silently stop working when Homebrew upgrades Python, because the real binary's path changes.
     - The cleaner fix is to move the QuickBooks input/output folders out of `~/Desktop` (a privacy-protected folder) into `~/Colvard/` and point the config there. That needs Frank's OK; it's a code/config change for cutover.
   - Install Google Drive for desktop (`brew install --cask google-drive`, Frank signs in) and report the "My Drive" path, normally `~/Library/CloudStorage/GoogleDrive-<email>/My Drive`. Backups will go there; nothing on any E: drive.

7. Check that `~/Desktop/Python/QB_Sales_Fresh_Frozen_Input_Folder` has New Routes.xlsx, Pick_Sheet_Settings.xlsx, Pick_Sheet_Item_Decisions.csv, Trackpod.csv, Production_v_Sales.csv and "Production v Sales Charts 2025-Current.csv". Find "Master Barcode Listing (Gen 1 and Gen 2).xlsx" and "2026019 2026 Pricing.xlsx" under `~/Hard Drive Documents/Colvard Sausage/Operations/Planning/Gen2/`. Report their full Mac paths.

8. Read-only smoke checks from ~/Colvard/BI with the venv active. **[FIX] Read each script first.** If it imports or calls anything network- or credential-related (requests/httpx to QBO or Cloudflare, smtplib, wrangler, subprocess to .bat, reads of .env or token files), don't run it; report it instead. Note that `import build` executes build.py's top-level code.
   ```bash
   python "Master Data/pipeline/preflight_env.py"
   cd Gen2 && python -c "import build; print(len(build.PAGES), 'pages import OK')"
   cd "../Master Data" && python -m pytest tests/test_customer_master.py -q
   ```

9. Write a short report to ~/Colvard/mac_prep_report.md. Include:
   - versions installed
   - every path above, the hostname and the Drive path
   - the drift check (3b)
   - the FileVault/auto-login and Full Disk Access decisions waiting on Frank
   - anything that failed or that Frank must still click
   - the output of step 8

   Stop there.

---

## PART B: Colvard Intelligence (includes Pricing Studio), FIA, Claude_Discovery

Same HARD RULES. Do this after Part A. These three repos aren't on GitHub yet, so make **local clones from the SMB copy**. Cloning only reads the source repo, and you get clean Mac line endings. Once the laptop pushes them, point `origin` at GitHub.

| Repo | Copied source (data only) | Clean working copy | Laptop jobs it runs |
|---|---|---|---|
| Colvard Intelligence | `~/Hard Drive Documents/Colvard Sausage/Operations/Colvard Intelligence` | `~/Colvard/Intelligence` | Nightly QBO load (`-m src.colvard_intelligence.core nightly --wait`), Executor keep-alive (`-m src.colvard_intelligence.ops.keepalive tick`) |
| ↳ **Pricing Studio** | the same repo, subfolder `pricing_studio` | `~/Colvard/Intelligence/pricing_studio` | Studio Nightly (`python -B tools/nightly_check.py`, run from `pricing_studio`) |
| FIA | `~/Hard Drive Documents/FIA` (+ worktree `worktrees/phase2`, branch `phase2`) | `~/Colvard/FIA` + `~/Colvard/FIA-phase2` | fia-collect, fia-health (`-m fia.run collect/health`); fia-board-phase2 (collect → health → publish, run from the phase2 worktree) |
| Claude_Discovery | `~/Hard Drive Documents/Colvard Sausage/Operations/Claude_Discovery` | `~/Colvard/Discovery` | Intelligence Vendor Dashboard (`pipeline/vl_refresh_v1.py`) |

B1. **Clone locally.** Don't hardlink, so nothing is shared with the copy:
```bash
S=~/"Hard Drive Documents"
git clone --no-hardlinks "$S/Colvard Sausage/Operations/Colvard Intelligence" ~/Colvard/Intelligence
git clone --no-hardlinks "$S/FIA" ~/Colvard/FIA
git -C ~/Colvard/FIA worktree add ../FIA-phase2 phase2
git clone --no-hardlinks "$S/Colvard Sausage/Operations/Claude_Discovery" ~/Colvard/Discovery
```
- Set `user.name`/`user.email` in each, as in step 3.
- **Don't add a GitHub remote and don't push.** Colvard Intelligence still has an unresolved secret-scan hit (commit `94a165d`).

B2. **Drift check** (read-only, the same commands as 3b) on each copied source. The laptop showed uncommitted files: Intelligence 4, Discovery 202, FIA 1. List the modified tracked files, and compare each repo's `master`/`main` hash in the copy with the clone's. Report; don't fix.

B3. **Runtime files git doesn't carry.** In each copied source, list the untracked and ignored files without writing to them:
```bash
GIT_OPTIONAL_LOCKS=0 git -C "<copied source>" -c core.autocrlf=true status --short --ignored | grep -E '^(\?\?|!!)'
```
- Group the results by top-level folder, with sizes (`du -sh`).
- **Ask Frank before copying any of it** into the clones.
- Never copy `.env`, `*token*`, `*secret*` or `*credential*` files, or `.venv/`.
- Claude_Discovery's `staging/` is about 17 GB, and `vl_refresh_v1.py` mentions it. Report its size and the free disk space; don't copy it without Frank's OK.

B4. **Python.**
- Colvard Intelligence and Claude_Discovery: install their `requirements.txt` or `pyproject.toml`, if present, into `~/Colvard/venv`, and report any conflicts.
- FIA: give it its own venv, because it had one on the laptop. Run `python3.14 -m venv ~/Colvard/venv-fia`, then install from `~/inventory/pip-fia.txt` minus pywin32, pywin32-ctypes, comtypes, pywinpty and win_unicode_console. If `pip-fia.txt` is missing from `~/inventory`, report it.

B5. **Read-only checks.** Import only, run nothing. Read each module first, applying the step 8 rule:
```bash
cd ~/Colvard/Intelligence && ~/Colvard/venv/bin/python -c "import src.colvard_intelligence; print('CI import OK')"
cd ~/Colvard/Intelligence/pricing_studio && ~/Colvard/venv/bin/python -c "import ast,sys; ast.parse(open('tools/nightly_check.py').read()); print('studio parses OK')"
cd ~/Colvard/FIA && ~/Colvard/venv-fia/bin/python -c "import fia; print('FIA import OK')"
```
- **Do NOT run** `core nightly` (it pulls from QuickBooks), `keepalive tick`, `fia.run`, `nightly_check.py` or `vl_refresh_v1.py`.
- If a repo has a test suite that is clearly offline (tmp files only, no network), you may run it with `-q`; otherwise list it.

B6. **Windows-only code.** In all three clones, list files that use `win32com|pythoncom|comtypes|winreg|msvcrt|os\.startfile|C:\\|C:/`, with counts. Report only.

B7. **Append to `~/Colvard/mac_prep_report.md`:**
- for each repo: the clone path, the drift check, a runtime-file inventory with sizes, venv/package status, the B5 results and the Windows-only code counts
- the FIA worktree status

**Not covered by Part A or Part B (still to do):**
- the `~/Desktop/Python` jobs: QB Email Automation (probably Outlook via `win32com`, so it needs a rewrite), Accounts Payable (`.bat`) and Python_Daily_Backup
- LineId Snapshot (`~/ProgramData/colvard/lineid`)
