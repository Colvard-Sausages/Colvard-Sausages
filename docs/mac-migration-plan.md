# Windows laptop → Mac migration plan (Colvard)

Built from the laptop inventory taken 2026-10-13 (`apps.csv`, `pip.txt`, `npm.txt`, `runtimes.txt`, `tasks\*.xml`).
Labels: **[fact]** verified, **[inf]** inference, **[judg]** judgment call.

---

## 0. Ground rules

- **Do not wipe the laptop** until the Mac has run every job cleanly for ~2 weeks. Some of this code exists only there. **[fact]** None of it is on GitHub.
- **Never run the same job on both machines.** For each job, disable it on Windows (`Disable-ScheduledTask -TaskName "<name>"`), then enable it on the Mac. Running both would mean double deploys, double QBO actions, double TrackPod pushes and double emails.
- **Credentials:** move them on the USB drive only, never through a cloud drive. Wipe the USB afterwards. Prefer logging in again on the Mac (`npx wrangler login`, `gh auth login`, `gcloud auth login`, Google OAuth).

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
| **Always-on duties** | Daemons: QBO Live Daemon, QBO Action Server, Live Sync Poll, Rolling Runner, Update BI Listener | A MacBook sleeps when the lid closes. Keep it on power and change the Energy settings, or run `caffeinate`. This replaces "Executor keep-alive". **[judg]** Long term, these belong on an always-on box or in Cloudflare. |
| "BI" | **[fact]** Power BI isn't installed. BI is your own pipeline ("Update BI Listener", "Sora BI Update Helper"). | No blocker |

---

## 2. Install on the Mac

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

**Skip:** Visual C++ redistributables, HP system tools, Apple Mobile Device Support, iTunes, QuickTime, iCloud Outlook (all built into macOS), Edge WebView2, PC Health Check, Realtek, Garmin USB drivers. "Claude" and "Cloudflare" show the publisher `Google\Chrome`, so they're Chrome web-app shortcuts **[inf]**. Just re-add them from Chrome.

---

## 3. Scheduled jobs to port (Windows Task Scheduler → macOS launchd)

**[fact]** 47 custom jobs. Vendor jobs (Apple, Epson, Firefox, HP, Zoom, SoftLanding, WarrantyChecker, PC Health) are **not** ported.

- **Pipeline/BI (8):** Morning Pipeline 8:45 AM / 1 PM / 3 PM, Morning Watchdog, Rolling Runner, Update BI Listener, Sora BI Update Helper, Startup Heal
- **QuickBooks (6):** QBO Live Daemon, QBO Action Server, Live Sync Poll, Nightly QBO load, Overnight QBO Reports, QB Email Automation
- **Overnight checks (9):** Archive Audit, CF Bindings, D1 Budget, KV Secret Scan, Live Probe, Parity Sweep, Restore Drill, Test Metrics, Nightly Screening 3 AM
- **Briefs and reports (5):** Daily Brief, End-of-Day Brief, Weekly Brief, Intelligence Vendor Dashboard, Vendor Invoice Export
- **Operations (5):** Accounts Payable, TrackPod Push, LineId Snapshot, Deploy Watcher, Studio Nightly
- **Backups and git (6):** Full Project Backup, Operational Backup, Weekly Reference Backup, Python_Daily_Backup, GitHub Push, Maintenance
- **Other (8):** fia-collect, fia-health, fia-board-phase2, Claude Remote Control, Claude Remote Control Health, Executor keep-alive, Printer Health Monitor, Printer Health Monitor Logon

**Next step:** on the laptop, export what each job actually runs:
```powershell
Get-ScheduledTask | ? TaskPath -notlike '\Microsoft\*' | % { $t=$_; $t.Actions | % { [pscustomobject]@{Task=$t.TaskName; Exe=$_.Execute; Args=$_.Arguments; Dir=$_.WorkingDirectory} } } | Export-Csv task-actions.csv -NoTypeInformation
Import-Csv task-actions.csv | ? Task -notmatch 'Firefox|HP|Epson|Zoom|SoftLanding|Warranty|Apple|S-1-5|PC Health' | Format-List | Out-String -Width 300
```
The output is the final list of folders, interpreters and scripts.

---

## 4. Copy to the USB drive (formatted exFAT)

1. Stop the jobs first: `Disable-ScheduledTask` on each one, or temporarily pause the pipeline.
2. **Folders:** Colvard Intelligence, Studio, `Master Data`, `C:\ProgramData\colvard`, every `Dir` from `task-actions.csv`, `%USERPROFILE%\.claude` (CLAUDE.md, rulings, memory), the PowerShell profile, and the inventory files plus the `tasks\` folder.
3. **SQLite:** `sqlite3 X.db ".backup X-copy.db"` for each database. **DuckDB:** copy each file only while nothing has it open.
4. **Exclude:** `node_modules`, `.venv`/`venv`, `__pycache__`. They contain Windows programs and get rebuilt on the Mac.

---

## 5. Porting work on the Mac (Claude Code can do this locally)

- `C:\…` paths and backslashes → Mac paths, preferably moved into one config file
- `.bat` / `.ps1` / `.cmd` wrappers → shell scripts with Unix (LF) line endings
- Task Scheduler XML → `launchd` plists in `~/Library/LaunchAgents`
- `powercfg` / keep-awake → `caffeinate` or the Energy settings
- `win32com` / `comtypes` code → rewrite (for example, Outlook automation becomes Gmail/SMTP via `yagmail`)
- Port one job group at a time. Disable it on Windows, enable it on the Mac, and watch one full cycle before moving on.
