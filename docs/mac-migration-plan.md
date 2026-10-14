# Windows laptop → Mac migration plan (Colvard)

Built from the laptop inventory taken 2026-10-13 (`apps.csv`, `pip.txt`, `npm.txt`, `runtimes.txt`, `tasks\*.xml`).
Labels: **[fact]** verified, **[inf]** inference, **[judg]** judgment call.

---

## 0. Ground rules

- **Do not wipe the laptop** until the Mac has run every job cleanly for ~2 weeks. Three of the four code repos exist **only** there **[fact]**:
  | Repo (laptop folder) | GitHub remote | Uncommitted files | Worktrees |
  |---|---|---|---|
  | `Claude v1` (BI pipeline) | `MyLiege-FJB/colvard-bi-system`, moving to `Colvard-Sausages` (§4) | 512 | 14 (7 locked) |
  | `Colvard Intelligence` (incl. pricing_studio) | **none** | 4 | 0 |
  | `Claude_Discovery` | **none** | 202 | 1 |
  | `FIA` | **none** | 1 | 1 (`phase2`) |
- **Never run the same job on both machines.** For each job, disable it on Windows (`Disable-ScheduledTask -TaskName "<name>"`), then enable it on the Mac. Running both would mean double deploys, double QBO actions, double TrackPod pushes and double emails.
- **Credentials:** they travel only inside the direct laptop→Mac network copy (§4), never through a cloud drive. Prefer logging in again on the Mac (`npx wrangler login`, `gh auth login`, `gcloud auth login`, Google OAuth).

---

## 1. Blockers and decisions

| Issue | Evidence | Action |
|---|---|---|
| **The Mac needs Python 3.14, not 3.15** | **[fact]** PyPI has no 3.15 Mac wheels for `duckdb`, `ortools`, `Bottleneck`, `brotli`, `PyYAML`. The laptop's default Python is 3.14. | Install python.org **3.14.8** alongside 3.15. Build every venv with `python3.14 -m venv`. |
| Windows-only Python packages | **[fact]** `pywin32`, `pywin32-ctypes`, `comtypes`, `pywinpty`, `win_unicode_console` don't exist on macOS | Any script that imports `win32com`, `pythoncom`, `comtypes`, `winreg` or `msvcrt` must be rewritten. Likely suspects: QB Email Automation and Outlook/Excel automation. |
| `xlwings` | **[fact]** On the Mac it needs Excel for Mac and behaves differently | Re-test every xlwings script |
| Visual Studio Community | **[fact]** No Mac version (VS for Mac was retired in 2024) | Use VS Code |
| .NET 8/10 + ASP.NET Core hosting bundle | Something on the laptop needs it **[inf]** | Find out what. .NET itself runs on the Mac; IIS hosting doesn't. |
| Kofax PaperPort, Greenshot, orca | Windows-only | Replace with Preview or Epson ScanSmart; ⌘⇧5; `pip install kaleido` |
| **Always-on duties** | Daemons: QBO Live Daemon, QBO Action Server, Live Sync Poll, Rolling Runner, Update BI Listener | A MacBook sleeps when the lid closes. Keep it on power and change the Energy settings, or run `caffeinate`. **[judg]** Long term, these belong on an always-on box or in Cloudflare. |
| "BI" | **[fact]** Power BI isn't installed. BI is your own pipeline ("Update BI Listener", "Sora BI Update Helper"). | No blocker |
| **VBScript wrapper** | **[fact]** 26 jobs launch through `wscript.exe run_hidden.vbs <x>.bat`. VBScript and `.bat` don't exist on macOS. | Each `.bat` becomes a `.sh`. launchd already runs jobs without a window, so `run_hidden.vbs` is simply dropped. |
| **FIA uses its own venv + git worktree** | **[fact]** `FIA\.venv\Scripts\pythonw.exe`, `FIA\worktrees\phase2` | Freeze that venv separately (§4). After the move, run `git worktree repair`, because worktree links store absolute Windows paths. |

---

## 2. Install on the Mac

**Automated:** `bash deploy/mac/bootstrap.sh` does everything in this section except the GUI apps, and checks the result. **[fact]** Every one of the 244 pinned packages has a Mac arm64 / Python 3.14 wheel, or (`ttkwidgets`) is pure Python. All 11 Homebrew formulas have Apple Silicon builds. Porting instructions for Claude Code on the Mac: `docs/mac-port-handoff.md`.

**Runtimes**
- Python **3.14.8** from python.org. 3.15 is already installed.
- Node.js **24 LTS** from nodejs.org. It matches the laptop's 24.15.0. No global npm packages to move.
- Homebrew (brew.sh), then:
  ```bash
  brew install tesseract poppler ghostscript graphviz zbar pango cairo ffmpeg gh
  ```
  These are the system libraries behind `pytesseract`, `pdf2image`, `pyzbar`, `weasyprint`, `CairoSVG`, `moviepy` and the graph rendering.
- Google Cloud SDK: use the installer from cloud.google.com/sdk.

**Python packages.** The laptop's global set has about 230 packages. Copy `pip.txt` to the Mac, then:
```bash
grep -viE '^(pywin32|pywin32-ctypes|comtypes|pywinpty|win_unicode_console)==' pip.txt > pip-mac.txt
python3.14 -m venv ~/colvard-venv && source ~/colvard-venv/bin/activate
pip install -r pip-mac.txt
python -m playwright install chromium
```
`pip.txt` only covers the default Python 3.14. If any scheduled job calls Python 3.12 or 3.13, or a project venv, freeze that environment too.

**Apps with Mac versions:** Chrome, Firefox, Slack, Zoom, Google Drive, Microsoft 365, LibreOffice, VLC, OBS Studio, DB Browser for SQLite, GitHub CLI, Bambu Studio, UltiMaker Cura, Garmin Express, Chrome Remote Desktop, Brother iPrint&Scan, Epson drivers and ScanSmart, HP Smart (for the LaserJet M28-M31), PaperCut Mobility Print, Vysor, ApowerMirror, Claude desktop.

**Skip:** Visual C++ redistributables, HP system tools, Apple Mobile Device Support, iTunes, QuickTime, iCloud Outlook (all built into macOS), Edge WebView2, PC Health Check, Realtek, Garmin USB drivers. "Claude" (publisher `Google\Chrome`) is a Chrome web-app shortcut **[inf]**; the Mac has the real Claude desktop app. For "Cloudflare 1.0" (publisher Cloudflare), check what it is on the laptop: WARP, or a web-app shortcut?

---

## 3. What lives where (from `task-actions.csv`, 2026-10-13)

**[fact]** Every custom job runs from one of these roots. `CV1` = `C:\Hard Drive Documents\Colvard Sausage\Operations\Succurre\Weekly Briefs\Claude v1`.

| Root on laptop | What it is | Jobs | How they run |
|---|---|---|---|
| `CV1\Master Data` (+ `pipeline\`) | **BI pipeline**: briefs, morning pipeline, QBO daemons, overnight checks, deploys | 28 | 25 via `run_hidden.vbs` + `.bat`; 3 run Python directly (Full, Weekly and Operational backup) |
| `CV1\tools` | Rolling Runner, Maintenance, Vendor Invoice Export | 3 | Python 3.14 directly |
| `Operations\Colvard Intelligence` | **Colvard Intelligence** (`src.colvard_intelligence`): Nightly QBO load, keep-alive | 2 | `python -m` |
| `Operations\Colvard Intelligence\pricing_studio` | **Studio** (pricing studio): Studio Nightly | 1 | `python -B tools\nightly_check.py` |
| `Operations\Claude_Discovery` | Intelligence Vendor Dashboard | 1 | Python directly |
| `C:\ProgramData\colvard\lineid` | LineId Snapshot | 1 | Python directly |
| `C:\Users\frank\Desktop\Python` | Accounts Payable (`.bat`), QB Email Automation, Python_Daily_Backup | 3 | mixed |
| `C:\Hard Drive Documents\Wrestling\Road_to_Fargo_2027` | Sora BI Update Helper (`helper_server.py`) | 1 | Python directly |
| `C:\Hard Drive Documents\FIA` (+ `worktrees\phase2`) | fia-collect, fia-health, fia-board-phase2 | 3 | its own `.venv` |

**43 jobs to port.**
- **Replaced:** Claude Remote Control and its health check, both in `Documents\WindowsPowerShell`. The Mac's Claude desktop app takes their place.
- **Dropped:** the 2 "Printer Health Monitor" jobs (HP vendor tool), plus all the Apple/Epson/Firefox/HP/Zoom/SoftLanding/Warranty jobs.

**Mac layout [judg]:** mirror the roots under your home folder so only the path prefix changes:
`C:\Hard Drive Documents\…` → `~/Hard Drive Documents/…`, `C:\ProgramData\colvard` → `~/ProgramData/colvard`, `C:\Users\frank\Desktop\Python` → `~/Desktop/Python`.

---

## 4. Copy laptop → Mac over the home network (no USB drive)

**[decided 2026-10-14] There is no USB drive.** The laptop copies straight into the Mac's home folder over the local network, using Mac File Sharing (SMB).

**Before Pass 1, push the three repos that have no remote to new *private* GitHub repos [judg].** This gives you an off-machine backup, which you don't have today. First check what's in their history, because pushing publishes it to GitHub. In PowerShell, inside each repo:
```powershell
git log --all --name-only --format= | sort -Unique | sls '\.env$|token|secret|credential|\.pem$'
```
**Home for all Colvard code: the `Colvard-Sausages` GitHub owner (decided 2026-10-14).**

*New repos (laptop, after `gh auth login` as `Frank-Bukoski`, who can push to `Colvard-Sausages`):* if nothing sensitive shows up, run this in each repo folder:
```powershell
gh repo create Colvard-Sausages/<name> --private --source . --remote origin; if ($?) { git push origin --all }
```
Names: `colvard-intelligence`, `colvard-claude-discovery`, `fia`. **[judg]** If FIA isn't Colvard business, give it its own home instead.

*Existing BI repo (`MyLiege-FJB/colvard-bi-system`):* use a **transfer**, not a copy. A transfer keeps history, issues and PRs, and GitHub redirects the old URL **[fact]**.
1. On github.com, signed in as the account that owns `MyLiege-FJB`: open the repo → **Settings → General → Danger Zone → Transfer ownership** → new owner `Colvard-Sausages`. That account must be allowed to create repos in `Colvard-Sausages`; if it isn't, invite it there first.
2. On the laptop, in `Claude v1`, run `git remote set-url origin https://github.com/Colvard-Sausages/colvard-bi-system.git`. The redirect would work, but it breaks if anything is ever created at the old name.
3. Check afterwards **[inf]**:
   - Cloudflare Pages: if a project is Git-connected to this repo, reconnect it. Its GitHub-app access was granted to `MyLiege-FJB`, not the new owner. Projects deployed with `wrangler pages deploy` aren't affected.
   - Repo **Settings → Secrets and variables**.
   - Any deploy keys.

Uncommitted files and worktrees travel with the folder copy either way; don't bulk-commit 512 unknown files just to move them.

**Two passes [judg]:**
- **Pass 1, now:** copy everything while jobs keep running. Good enough for code, configs and history.
- **Pass 2, at cutover:** disable the jobs on the laptop, then re-copy only the data files (SQLite/DuckDB/JSON state).

The daemons hold databases open, so a live copy of the *data* isn't trustworthy.

**On the laptop (PowerShell). First check the size and freeze the FIA venv:**
```powershell
"{0:N1} GB" -f ((gci 'C:\Hard Drive Documents' -Recurse -File -ErrorAction SilentlyContinue | measure Length -Sum).Sum/1GB)
& "C:\Hard Drive Documents\FIA\.venv\Scripts\python.exe" -m pip freeze > pip-fia.txt
```

**Scope (decided 2026-10-13):** from `Hard Drive Documents`, only `Colvard Sausage` (47.4 GB) and `FIA` (5.7 GB, smaller without `.venv`). The 4 folders outside it are still required, because jobs run from them. `Wrestling` (27.1 GB), `UMA` (6.1 GB) and the personal folders stay on the laptop. **Archive them to an external drive or cloud storage before the laptop is wiped.** Excluding `Wrestling` retires the *Sora BI Update Helper* job (`Road_to_Fargo_2027`, 0.2 GB).

**Mac first (Terminal):**
```bash
df -h ~ | tail -1            # "Avail" must be ≥ 80G. Stop if not.
ipconfig getifaddr en0       # the Mac's IP, for the laptop
caffeinate -dims &           # keep the Mac awake during the copy
```
Then go to System Settings → General → Sharing → **File Sharing: on** → ⓘ → **Options** → under *Windows File Sharing*, tick `frankbukoski` and enter the Mac password.

**Pass 1, laptop (PowerShell).** Replace `<IP>`. `net use` asks for the **Mac** password.
```powershell
net use M: \\<IP>\frankbukoski /user:frankbukoski
$x = '/XD','.venv','venv','node_modules','__pycache__','/R:1','/W:1','/NFL','/NDL','/NP','/MT:8'
robocopy "C:\Hard Drive Documents\Colvard Sausage" "M:\Hard Drive Documents\Colvard Sausage" /E @x /LOG:M:\copy-colvard.txt
robocopy "C:\Hard Drive Documents\FIA" "M:\Hard Drive Documents\FIA" /E @x /LOG:M:\copy-fia.txt
robocopy "C:\ProgramData\colvard" "M:\ProgramData\colvard" /E @x
robocopy "C:\Users\frank\Desktop\Python" "M:\Desktop\Python" /E @x
robocopy "C:\Users\frank\.claude" "M:\dot-claude" /E @x
robocopy "C:\Users\frank\Documents\WindowsPowerShell" "M:\WindowsPowerShell" /E @x
robocopy "C:\Users\frank" "M:\inventory" apps.csv pip.txt pip-fia.txt npm.txt runtimes.txt task-actions.csv
robocopy "C:\Users\frank\tasks" "M:\inventory\tasks" /E
```
- Everything lands directly where the handoff expects it: `~/Hard Drive Documents`, `~/ProgramData/colvard`, `~/Desktop/Python`, `~/dot-claude`, `~/inventory`. There's nothing to drag afterwards.
- `robocopy` handles paths longer than 260 characters. Exit codes 0–7 mean success; 8 or higher means failure (check the log in `~/copy-*.txt`).
- About 53 GB, roughly 30–90 minutes over Wi-Fi **[inf]**. Ethernet is faster.
- Keep the `.git` folders. `.venv`, `node_modules` and `__pycache__` are Windows builds that get rebuilt on the Mac.
- **Secrets** (`.env`, token JSONs, `.claude` credentials) travel only over this direct LAN copy.
- **Afterwards:** on the laptop, run `net use M: /delete`. On the Mac, turn File Sharing off, then end `caffeinate` with `kill %1` or by closing that Terminal tab.
- **Pass 2 at cutover** uses the same `net use` + `robocopy`, limited to that group's data files.

---

## 5. Porting work on the Mac (Claude Code can do this locally)

- `C:\…` paths and backslashes → Mac paths, preferably moved into one config file
- `.bat` / `.ps1` / `.cmd` wrappers → shell scripts with Unix (LF) line endings. Quote every path, because `Hard Drive Documents` contains spaces.
- `C:\…` prefixes → find them all with `grep -rIliE 'c:(\\|/)' ~/Hard\ Drive\ Documents --include='*.py' --include='*.bat' --include='*.json' --include='*.toml'`
- Task Scheduler XML → `launchd` plists in `~/Library/LaunchAgents`
- `powercfg` / keep-awake → `caffeinate` or the Energy settings
- FIA: rebuild `.venv` from `pip-fia.txt`.
- Every repo: run `git worktree repair`, then `git config core.autocrlf input`. The files carry Windows line endings, and without that setting every file can show as modified **[inf]**. Prune worktrees whose branches are merged.
- `win32com` / `comtypes` code → rewrite (for example, Outlook automation becomes Gmail/SMTP via `yagmail`)
- Port one job group at a time. Disable it on Windows, enable it on the Mac, and watch one full cycle before moving on.
