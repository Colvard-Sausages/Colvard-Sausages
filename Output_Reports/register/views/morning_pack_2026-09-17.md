# Morning pack — 2026-09-17

Generated 2026-09-17 ~02:40 UTC by session `claude/overnight-remediation-09-16-tlw34v`.
Full preflight evidence: `docs/handoff/overnight_2026-09-16.md`.

---

## A. Warnings, what landed, what was skipped

### ⚠ THE RUN DID NOT EXECUTE. Read this first.

The overnight plan targets a Windows laptop with a Cloudflare pipeline, a rolling test runner,
Gen 2 fixtures, a register tree and four sibling sessions. **This session ran in an ephemeral
Linux cloud container holding one repository — `Colvard-Sausages/Colvard-Sausages`, 28 files, a
QuickBooks invoice dashboard.** None of the targets exist here, and `list_repos` confirms no
other repository is reachable from this session. Evidence table: handoff §1.

- **Battery / keep-awake:** not applicable, and **nothing was started**. The laptop is a
  different machine; `SetThreadExecutionState` from this container cannot affect it. No
  `powercfg` change was made, so no morning restore is owed. Neither path (task or fallback)
  was used.
- **Reverts made:** none. No commit from any session was touched.
- **Deploys, Pages deletions, D1/KV writes, secrets, daemons:** none — consistent with the
  hard rules, and moot regardless.

### What landed

| Phase | Artifact | Sha |
|---|---|---|
| 0 | `docs/handoff/overnight_2026-09-16.md` | see PR |
| 5 | `Output_Reports/register/views/morning_pack_2026-09-17.md` (this file) | see PR |

Base: `0b6a4e9`. Branch: `claude/overnight-remediation-09-16-tlw34v`. Docs only — no code changed.

### Skipped, with reason

All 38 numbered steps. Grouped:

| Steps | Reason |
|---|---|
| 0.1 keep-awake | No Windows host; container cannot hold the laptop awake |
| 0.2–0.3 runner status, pipeline lease, siblings | No runner, no lease file, no sibling processes |
| 0.4 s1260 note | s1260 does not exist here; writing it would be a note to nobody |
| 0.5–0.6 detection, seed subagents | All four source sets absent (closure register, bug logs, due-out ledger, s1262 findings) |
| 1.1–1.3 AUTH_PASS removal | `grep -r AUTH_PASS` → **0 hits repo-wide**; no Functions, no Workers, no `_middleware.js` |
| 1.4 Pages cleanup tool | No Pages project attached to this repo; tool would have no target |
| 1.5 safe_commit fixes | `tools/safe_commit.py` does not exist |
| 1.6 06:30 deploy question | No pipeline code to read; cannot be answered from evidence |
| 1.7 delete gen2.failed-1404 | Path is on `C:\`; no such drive |
| 2.1–2.9 runner work | No receipts, no Gen 2 fixtures, no `test_cloud_mirror`, no ledger |
| 2.10 Defender / suite pause | Windows-only; not inspectable from here |
| 3.1–3.2 register tooling + seeding | Nothing to seed; building the tool with zero rows is speculative scaffolding |
| 3.3 `docs/rulings.md` | **Deliberate refusal** — see SD-2 |
| 4.1–4.2 worktree pool | `C:\ProgramData` paths; container worktrees are discarded at session end anyway |
| 5.1–5.2 03:00 receipt, safety check, deploy dry-run | No nightly run, no receipt, no `deploy_now` |

### SESSION DEFAULTS — Frank to confirm

- **SD-1** No keep-awake started (void from a cloud container). Nothing to undo.
- **SD-2** `docs/rulings.md` **not** written. Transcribing ~60 rulings (R1–R8, B1–B23, D1–D13,
  L1, P3, P3b, G1, T1, S1, S2) from prompt text into the repo would manufacture an audit trail
  with no verifiable source. A ruling register whose only provenance is the prompt that asks for
  it is worse than no register.
- **SD-3** No register rows were marked FIXED-LIVE / FIXED-UNSHIPPED, and today's closures
  (s1262 C0–C7, s1268, F-build-1, PUSH_KEY rotation, SESSION_SECRET, gen2 restore) were **not**
  recorded. Sha evidence for each is unreachable from here.
- **SD-4** Installed `fastapi`, `uvicorn[standard]`, `httpx` at the pinned `requirements.txt`
  versions to run the tests. Container-local; no repo change.
- **SD-5** The PR for this branch is based on `claude/laptop-connection-status-4lzgd`, not
  `main`, so its diff is the two docs rather than a duplicate of PR #1's 28 files.
- **SD-6** Ballot below is built only from evidence in this repository, not from the prompt's
  issue list.

### Siblings still active

None observable. No other session, process or claim file was present in this container at any
point (checked 02:23 and 02:40 UTC). Whatever s1200 / s1260 / s1264 are, they run elsewhere and
this run neither saw nor touched them — including s1260's files, which remain untouched.

---

## B. Health

Pipeline health (03:00 receipt, nightly sha, runner status/alert, `deploy_now --dry-run`,
06:30 expectations) is **unavailable** — none of those systems are reachable. Substituting the
health that *is* measurable, from this repository:

| Signal | Result |
|---|---|
| `scripts/test_sync_logic.py` | **5/5 tests, 13 assertions, green** (idempotent upsert, SyncToken ordering, soft-delete/restore, webhook signature, re-backfill safety) |
| `scripts/test_qbo_client.py` | **11/11 green** (5xx retry/backoff, pagination, CDC round trip, 404 handling, read-only verb guard, entity allowlist) |
| Deps | Installed at pinned versions; no drift from `requirements.txt` |
| `main` branch | One commit (`4981194`, README only). All feature work is unmerged. |
| PR #1 | Open, **draft**, `mergeable_state: clean`, 28 files, +3726, 10 commits, last touched 2026-06-02 — **~3.5 months idle** |
| CI (`.github/workflows/test.yml`) | Triggers on `pull_request` and push to `main` only. Pushes to `claude/*` branches get no CI unless a PR is open. |

### Frank's checks this morning

The prompt's three checks (Deployments page after 06:50, a Production Manager save, console
windows at 07:00) all belong to the pipeline environment and cannot be prepared or predicted
from here. The check that actually matters: **answer Q1 below.** Until the pipeline's location
and an execution path are established, no overnight session can do this work.

---

## C. FRANK BALLOT

Grouped by risk order: blocker → security → data loss → silent failure → rest.
Every row cites evidence in this repo. Nothing is inferred from the overnight prompt.

**Q1 — BLOCKER. Where does the Colvard pipeline actually live, and how should overnight runs reach it?**
The overnight plan is unrunnable from a cloud container: it needs a Windows host, a local
scheduler and sibling processes.
- **A (recommended)** — Run these sessions on the laptop itself (Claude Code CLI locally), and
  keep cloud sessions for repository work only. *Evidence: every Phase 0–4 target is a local
  Windows path or a local daemon; none survive the container boundary.*
- **B** — Push the pipeline code to a GitHub repo this session can reach, and re-scope the plan
  to code-only steps (security fixes, tests, register tooling), dropping keep-awake, runner,
  worktree-pool and deploy steps.
- **C** — ACCEPTED-RISK: keep the pipeline unreachable from cloud sessions and stop scheduling
  overnight cloud runs against it.
*Closes if chosen:* unblocks Phases 1–5; every other row in this ballot is downstream of it.

**Q2 — SECURITY / DATA LOSS. The QBO token store has no lock. Two sync workers ever running at once will lose the refresh token and lock Colvard out of QuickBooks.**
QBO rotates `refresh_token` on every token call; the file store is atomic-write but unlocked.
*Evidence: `api/sync/qbo_client.py:96`; `docs/invoices-sync-design.md:114` ("⚠ Not protected"); `:62`.*
- **A (recommended)** — Add `fcntl.flock` around token read/write in `qbo_client.py`. ~1 h,
  test: two processes refresh concurrently, both end with a valid token.
- **B** — Enforce singleton at deploy time only (systemd `Type=oneshot` + the existing timer, or
  `flock` in the unit). Zero code, but the guard lives outside the repo and a stray manual
  `cli loop` still breaks it.
- **C** — ACCEPTED-RISK with a review date. *Not recommended:* recovery means a manual
  re-authorization through Intuit's OAuth playground, and the failure is silent until the next
  refresh.
*Closes if chosen:* the single unprotected row in the sync design's failure-mode table.

**Q3 — SILENT FAILURE. Voided invoices are detected by a string convention, not an API flag.**
An invoice voided in QuickBooks may keep showing as live on the dashboard.
*Evidence: `docs/invoices-sync-design.md:95` — QBO exposes no clean VoidStatus.*
- **A (recommended)** — Add the defense-in-depth rule the design doc already proposes:
  `TotalAmt == 0 AND Balance == 0 AND PrivateNote contains "Voided"`. ~1 h with a fixture test.
- **B** — Leave as is; accept that a void with an edited PrivateNote is missed.
- **C** — ACCEPTED-RISK, review at go-live.

**Q4 — SILENT FAILURE. `GroupLineDetail` (item bundles) is captured flat, not exploded.**
If Colvard ever starts using bundles, line detail silently under-reports.
*Evidence: PR #1 "Honest gaps"; the audit says Colvard isn't using bundles today.*
- **A (recommended)** — ACCEPTED-RISK + a guard: log a warning when a `GroupLineDetail` line is
  seen, so adoption surfaces immediately instead of silently. ~30 min.
- **B** — Implement full expansion now (~4 h for an unused feature).
- **C** — Leave silent.

**Q5 — PR #1 has been an open draft for ~3.5 months and `main` still holds only the initial commit.**
All 3,726 lines of invoice work are unmerged; CI does not run on `claude/*` pushes without a PR.
*Evidence: PR #1 created 2026-06-01, updated 2026-06-02, `mergeable_state: clean`; `main` = `4981194`.*
- **A (recommended)** — Mark ready and merge to `main`. 16/16 tests green; the remaining gaps
  (Q2–Q4) are tracked and none block a read-only dashboard.
- **B** — Merge only after Q2's lock lands.
- **C** — Keep unmerged pending QBO credentials.
*Closes if chosen:* CI starts running on `main`; later branches stop diverging from a one-commit base.

**Q6 — The seven schema open questions are all still on defaults.**
QBO-vs-Desktop, week boundary, bucket-by date, recurring templates, single realm, sub-customer
depth, tax-inclusive pricing. *Evidence: `docs/invoices-schema-design.md:87-98`.*
- **A (recommended)** — Confirm all seven defaults in one pass; they are each labelled
  "reasonable but worth confirming" and only #2 and #3 are visible to users.
- **B** — Confirm #2 (week boundary) and #3 (bucket-by date) only; defer the rest to v2.
- **C** — Defer all; revisit at go-live.

**Q7 — `customer.parent_id` and item SKU are stubs.** Populated by a customer/item sync not in
PR #1. *Evidence: PR #1 "Honest gaps".* — **A (recommended)** ACCEPTED-RISK until the dashboard
is in real use; **B** build the customer/item sync now (~1 day).

*Rows 8–15: none. This repository does not contain fifteen open risks; padding the ballot with
prompt-derived items would defeat its purpose.*

**Not on the ballot, because they have no target here:** the Pages deletion command (no Pages
project), the D8 bundle land/discard list (no worktrees), and Q1's go-live condition as the
prompt framed it. If those belong to the pipeline repo, they return once Q1 above is answered.

---

## D. CLOSURE PLAN

One single-class session per item, ordered by risk.

### S-A — Token-store lock (Q2). Effort: ~1 h. Class: data loss.
Closes when: two processes refreshing concurrently both end with a valid token, proven by a test
that fails without the lock.
```
MODE: single-fix session, write-authorized in api/sync/ only.
QUESTION: does concurrent refresh lose the QBO refresh_token?
DO: add fcntl.flock (exclusive, blocking) around token read+write in api/sync/qbo_client.py.
TEST: new test in scripts/test_qbo_client.py that forks two refreshes against a shared token
      file; break-prove it by removing the lock and showing red, then restore.
DO NOT: touch webhook.py, invoices_sync.py, or any deployment unit file.
STOP WHEN: the new test passes, the existing 11 still pass, and the change is pushed.
OUTPUT: sha, test name, before/after of the break-proof.
```

### S-B — Void detection depth (Q3). Effort: ~1 h. Class: silent failure.
Closes when: a fixture invoice with `TotalAmt==0, Balance==0, PrivateNote~"Voided"` is marked
voided, and one with a non-zero balance is not.
```
MODE: single-fix session, write-authorized in api/sync/invoices_sync.py and scripts/.
QUESTION: are voided invoices reliably detected?
DO: add the TotalAmt/Balance/PrivateNote rule from docs/invoices-sync-design.md:95 alongside the
    existing convention; update the doc to say it shipped.
TEST: two fixtures (true void, false positive) in scripts/test_sync_logic.py; break-prove.
DO NOT: change status derivation in the API or the page.
STOP WHEN: 7/7 sync-logic tests green and pushed.
OUTPUT: sha, both fixture names.
```

### S-C — GroupLineDetail warning (Q4-A). Effort: ~30 min. Class: silent failure.
Closes when: a bundle line emits one warning per invoice and the flat capture is unchanged.

### S-D — Land PR #1 (Q5-A). Effort: ~15 min + review. Class: process.
Closes when: `main` contains the invoice feature and CI has run green on `main`.

### S-E — Confirm schema defaults (Q6). Effort: ~30 min, Frank-answered.
Closes when: all seven answers are written into `docs/invoices-schema-design.md` and the
"open questions" heading becomes "confirmed decisions".

---

## E. Counts

| Metric | Value |
|---|---|
| Ballot rows (FRANK-DECISION) | 7 — 1 blocker, 1 security/data-loss, 2 silent-failure, 3 other |
| Closure rows (SESSION) | 5 (S-A … S-E) |
| Filed today | 12 |
| Closed today | 0 |
| Register rows compiled | 0 — source registers unreachable (SD-3) |
| Parity orphans | Not computable: zero of the four source sets exists in this session |
| Plan steps executed / skipped | 0 / 38 |
| Disk freed | 0 bytes — no worktree pool, no `C:\ProgramData` |
| Tests run | 16, all green |
| Code changed | None. Docs only. |
