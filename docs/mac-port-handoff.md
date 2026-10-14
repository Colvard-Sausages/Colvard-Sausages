# Mac port: handoff for Claude Code running *on the Mac*

Paste this into Claude Code on the Mac: **"Read docs/mac-port-handoff.md in the Colvard-Sausages repo and start at step 1."**
The full background is in `docs/mac-migration-plan.md`.

## State as of 2026-10-14

| Item | State |
|---|---|
| Laptop inventory (`apps.csv`, `pip.txt`, `pip-fia.txt`, `task-actions.csv`, `tasks/*.xml`) | Done, on the laptop in `C:\Users\frank` |
| Secret scan before pushing to GitHub | Claude_Discovery and FIA clean. Colvard Intelligence has 1 hit (commit `94a165d`, an audit `.md`), not yet resolved |
| Pushing Colvard Intelligence, Claude_Discovery and FIA to private GitHub repos | **Not done** (`gh` wasn't logged in on the laptop) |
| Target GitHub owner for all code | `Colvard-Sausages`. The BI repo is to be **transferred** from `MyLiege-FJB` (plan §4). Not done |
| Copying the folders to the Mac (plan §4, Pass 1) | **Not done** |
| Mac tools (`deploy/mac/bootstrap.sh`) | **Done**: all checks passed, venv `~/colvard-venv` (2026-10-14) |

## Rules (non-negotiable)

1. **Never activate a launchd job while its Windows twin is enabled.** Doubling these causes real damage: two QBO actions, two TrackPod pushes, two emails, two Cloudflare deploys. Write the plists, but don't run `launchctl bootstrap` until Frank confirms that the Windows task is disabled.
2. **Don't manually run jobs with outside effects** (email, TrackPod, deploy, QBO Action Server, GitHub push) while Windows still runs them. Use a dry-run flag if the job has one. Otherwise ask first.
3. **Secrets** (`.env`, `*token*.json`, Claude credentials): never print, never commit, never copy anywhere else.
4. Keep the original `.bat` files next to the new `.sh` files for reference until cutover is done.

## Step 0: Work that doesn't need the laptop's files (do this while the copy is pending)

Each item is independent. **Ask Frank before each one**, because they change his Mac.

**0a. Apps.** These Homebrew cask names were verified 2026-10-14:
```bash
brew install --cask google-chrome firefox slack zoom libreoffice db-browser-for-sqlite \
  visual-studio-code google-drive vlc obs bambu-studio ultimaker-cura garmin-express \
  chrome-remote-desktop-host gcloud-cli
```
- **Microsoft 365:** install from office.com with Frank's account. The `microsoft-office` cask also exists, but it's large.
- **Printers:** try plain macOS printing (AirPrint) first. Use the Brother, Epson or HP driver downloads only if a printer isn't found. None of them has a cask.

**0b. Always-on settings.** The pipeline has daemons, so the Mac must not sleep on power:
- System Settings → Battery → Options → **Prevent automatic sleeping on power adapter when the display is off**: on.
- Or run `sudo pmset -c sleep 0 disksleep 0`. Check with `pmset -g`.
- **Decision for Frank:** FileVault is on. After any reboot, LaunchAgents don't run until he logs in, because the data volume stays locked. For planned restarts, use `sudo fdesetup authrestart`. After an unplanned one (power cut, crash), the pipeline stays down until someone logs in. The recommendation is to accept this and keep FileVault.

**0c. Logins that don't depend on laptop files:**
- `npx wrangler login` (Cloudflare)
- `gcloud auth login` (only if the pipeline uses Google Cloud)

Don't copy the token files instead.

**0d. Porting analysis from GitHub (read-only).** Only the BI repo is on GitHub so far.
- Clone it to a scratch location, **not** the final path, so it can't collide with the incoming copy: `git clone https://github.com/MyLiege-FJB/colvard-bi-system.git ~/scratch/colvard-bi-system`. If the BI repo has already been transferred, use the `Colvard-Sausages` URL.
- Then do Step 3 there, and read every `Master Data/*.bat` called by the 25 BI jobs (Step 4 table).
- Produce `~/Colvard-Sausages/docs/mac-port-report.md`. For each job, give:
  - the full command chain (vbs → bat → python)
  - its Windows-only parts
  - the proposed `.sh`
- Draft one plist template.
- **Caveat:** the laptop copy has **512 uncommitted files** that GitHub doesn't, so check every finding again against the real copy before applying it. Commit and push the report, which must contain no secrets.

**0e. Transfer route.** Two routes were offered: a USB drive, or a direct network copy into `~` (Mac File Sharing → Options → Windows File Sharing for `frankbukoski`). Confirm which one Frank is using.
- For the network route, report `ipconfig getifaddr en0` and `df -h ~ | tail -1`. At least 80 GB must be free.
- Turn File Sharing off after the copy.

## Step 1: Preconditions

- `bash deploy/mac/bootstrap.sh` ends with "All checks passed". The venv is `~/colvard-venv` (Python 3.14).
- These paths exist (copied from the laptop):
  - `~/Hard Drive Documents/Colvard Sausage/…`
  - `~/Hard Drive Documents/FIA`
  - `~/ProgramData/colvard`
  - `~/Desktop/Python`
  - `~/inventory/{task-actions.csv,tasks/,pip-fia.txt}`
  - `~/dot-claude`

  If any is missing, stop and tell Frank which one.

## Step 2: Repos

For `Claude v1`, `Colvard Intelligence`, `Claude_Discovery` and `FIA`:
- Run `git worktree repair`, then `git config core.autocrlf input`, then `git status`.
- Report the uncommitted counts. The laptop showed 512, 4, 202 and 1.
- FIA: build `.venv` with `python3.14 -m venv .venv` and install `~/inventory/pip-fia.txt` (drop any Windows-only packages).

## Step 3: Find Windows-only code (report before changing anything)

```bash
cd ~/Hard\ Drive\ Documents
grep -rIlE 'win32com|pythoncom|comtypes|winreg|msvcrt|os\.startfile|wscript|schtasks|powercfg|pywintypes' --include='*.py' --include='*.bat' --include='*.ps1' . | grep -v '/\.git/'
grep -rIliE 'c:(\\|/)' --include='*.py' --include='*.bat' --include='*.json' --include='*.toml' --include='*.yaml' --include='*.ini' . | grep -v '/\.git/' | wc -l
```
Propose one shared path config, for example a `COLVARD_ROOT` environment variable, rather than rewriting hundreds of literals by hand.

## Step 4: Port the jobs (43)

`CV1` = `~/Hard Drive Documents/Colvard Sausage/Operations/Succurre/Weekly Briefs/Claude v1`. The schedules are in `~/inventory/tasks/<Task>.xml`, in the `<Triggers>` element.

| Group | Tasks | Windows command → Mac |
|---|---|---|
| BI `.bat` jobs (25) | Daily Brief, End-of-Day Brief, Weekly Brief, Deploy Watcher, GitHub Push, Live Sync Poll, Morning Pipeline 8:45 AM/1 PM/3 PM (one `.bat` with an argument), Morning Watchdog, Nightly Screening 3 AM, Overnight × 9 (`overnight_job.bat <name>`), QBO Action Server, QBO Live Daemon, Startup Heal, TrackPod Push, Update BI Listener | `wscript run_hidden.vbs CV1/Master Data/<x>.bat [args]` → `CV1/Master Data/<x>.sh [args]` |
| BI Python (6) | Full Project Backup (`--scope daily`), Weekly Reference Backup (`--scope weekly`), Operational Backup, Maintenance, Rolling Runner (`tick`), Vendor Invoice Export (`run`) | `pythonw <script>` → `~/colvard-venv/bin/python <script>` |
| Colvard Intelligence (3) | Nightly QBO load (`-m src.colvard_intelligence.core nightly --wait`), Executor keep-alive (`-m src.colvard_intelligence.ops.keepalive tick`), Studio Nightly (`-B tools/nightly_check.py` in `pricing_studio`) | Same module or script, run from the same working directory |
| Other (9) | Intelligence Vendor Dashboard (`Claude_Discovery/pipeline/vl_refresh_v1.py`), LineId Snapshot (`~/ProgramData/colvard/lineid/lineid_snapshot.py`), Accounts Payable (`~/Desktop/Python/run_accounts_payable.bat`), QB Email Automation, Python_Daily_Backup, fia-collect, fia-health, fia-board-phase2 (3 actions: collect → health → publish; in `FIA/worktrees/phase2`, using FIA's `.venv`) | as listed |

Not ported: the Printer Health Monitor jobs (HP vendor tool), Claude Remote Control and its health check (the Mac uses the Claude app), and Sora BI Update Helper (Wrestling isn't being migrated).

**Each job gets:**
- A `.sh` wrapper that runs `set -euo pipefail`, `cd`s to the job's working directory, and exports `DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib`. Set it inside the script: macOS strips `DYLD_*` variables when launching system binaries like `/bin/bash`. Then `exec` the venv's Python. Quote every path, because they contain spaces.
- `~/Library/LaunchAgents/com.colvard.<slug>.plist`:
  - `StartCalendarInterval` taken from the XML triggers
  - `KeepAlive` only for the long-running servers (QBO Action Server, QBO Live Daemon, Update BI Listener; confirm against their XML)
  - Logs written to `~/Library/Logs/colvard/<slug>.log`
- Check the plist with `plutil -lint`. **Don't load it** (rule 1).

## Step 5: Cutover order (one group at a time, with Frank)

1. Backups and Maintenance (read-only, safest)
2. Overnight checks
3. Briefs and reports
4. Colvard Intelligence and Studio
5. FIA
6. QBO daemons and Action Server, TrackPod, Deploy, GitHub Push (outside effects; last)

For each group:
1. Frank disables the Windows tasks (`Disable-ScheduledTask -TaskName "<name>"`).
2. Run Pass 2 of the data copy for anything that group writes.
3. `launchctl bootstrap gui/$(id -u) <plist>`.
4. Watch one full cycle in the logs.
5. Report.

**Done when:** all 43 jobs run from launchd for 2 weeks with clean logs, and the Windows tasks are all disabled.
