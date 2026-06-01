# QBO connection — 5 steps you actually have to do

Everything in this repo is ready to run against QuickBooks Online. These five steps are the part only you can do (Intuit's identity/2FA enforces it). Total time: ~20–30 minutes.

When you're done, the page will reflect QBO changes within 60 seconds (or <5s if you add the webhook in step 6).

---

## Step 1 — Create the Intuit Developer app (5 min)

1. Open **https://developer.intuit.com** on your laptop or phone.
2. Sign in (or sign up) with the same Intuit account you use for QuickBooks Online.
3. Top right → **Dashboard** → **Create an app**.
4. Choose **QuickBooks Online and Payments**. Name it `Colvard Dashboards`.
5. Skip the Payments scope. Tick only **com.intuit.quickbooks.accounting**.
6. After creation, click **Keys & credentials** in the left nav.
7. On the **Production** tab (not Development), copy these two and paste them into the box below — keep this file local, do NOT commit it:

   ```
   QBO_CLIENT_ID=<paste production client id>
   QBO_CLIENT_SECRET=<paste production client secret>
   ```

> If you'd rather test against sandbox first, copy the **Development** keys and set `QBO_ENVIRONMENT=sandbox` later.

---

## Step 2 — Add the redirect URI (1 min)

In the same app's **Keys & credentials** page:

1. Under **Redirect URIs**, click **Add URI**.
2. Paste exactly: `https://developer.intuit.com/v2/OAuth2Playground/RedirectUrl`
3. Save.

This lets Intuit's OAuth Playground (next step) hand a token back to you.

---

## Step 3 — Get the refresh_token and realm_id (5 min)

1. Open **https://developer.intuit.com/app/developer/playground**
2. Top of the page, pick **Production** (or **Sandbox** if you chose that above).
3. **Scope:** check `com.intuit.quickbooks.accounting`. Leave the others off.
4. Click **Get authorization code**.
5. A QuickBooks login window opens — sign in, then click **Connect** and pick **Colvard & Company LLC** when prompted.
6. You're bounced back to the Playground with a code shown. Click **Get tokens**.
7. Two values appear: **Refresh Token** and **Realm ID** (the Realm ID is a 17-digit number).

   ```
   QBO_REFRESH_TOKEN=<paste refresh token>
   QBO_REALM_ID=<paste 17-digit realm id>
   ```

The refresh_token is good for ~100 days from this moment, **and it rotates on every use**. After the first sync run, the version stored in `.qbo_tokens.json` is the canonical one; the env value is only the bootstrap.

---

## Step 4 — Run the first backfill (5 min)

On whatever host will run sync (your laptop is fine for now; move to a server later):

```bash
cd /path/to/Colvard-Sausages
pip install fastapi 'uvicorn[standard]' httpx
export QBO_CLIENT_ID=...
export QBO_CLIENT_SECRET=...
export QBO_REFRESH_TOKEN=...
export QBO_REALM_ID=...
export QBO_ENVIRONMENT=production   # or 'sandbox' if you used dev keys
export COLVARD_DB_PATH=/path/to/master.db

python3 -m api.sync.cli backfill --since 2026-01-01
python3 -m api.sync.cli status
```

The `status` command should show `full_sync_count=1` and a non-null `last_cdc_cursor_utc`. If it does, you're live.

---

## Step 5 — Cron the incremental pull (3 min)

Pick one of these — whichever your sync host supports.

**Cron (every minute):**
```cron
* * * * *  cd /path/to/Colvard-Sausages && /usr/bin/python3 -m api.sync.cli cdc >> /var/log/colvard-sync.log 2>&1
```

**systemd timer (preferred — observable):** create `/etc/systemd/system/colvard-sync.service` and `colvard-sync.timer`. Template:

```ini
# colvard-sync.service
[Unit]
Description=Colvard QBO invoice sync

[Service]
Type=oneshot
EnvironmentFile=/etc/colvard/qbo.env
WorkingDirectory=/path/to/Colvard-Sausages
ExecStart=/usr/bin/python3 -m api.sync.cli cdc
```

```ini
# colvard-sync.timer
[Unit]
Description=Run Colvard sync every minute

[Timer]
OnBootSec=30s
OnUnitActiveSec=60s
Unit=colvard-sync.service

[Install]
WantedBy=timers.target
```

```
sudo systemctl enable --now colvard-sync.timer
```

---

## Step 6 (optional) — Webhook for <5s latency

Polling gets you to ≤60s. If you want closer to real-time, you need a public HTTPS URL that Intuit can POST to.

1. Provision a TLS endpoint that reaches your sync host. (Caddy, nginx + Let's Encrypt, Cloudflare Tunnel — any of them.)
2. In the Intuit Developer app → **Webhooks** → **Add endpoint**: `https://YOUR-HOST/webhook/qbo`. Subscribe to **Invoice** events only.
3. Copy the **Verifier Token** Intuit shows you:
   ```
   QBO_WEBHOOK_VERIFIER_TOKEN=<paste>
   ```
4. Restart `invoices_api.py` so the webhook router auto-mounts (it checks for `QBO_WEBHOOK_VERIFIER_TOKEN` at import time).

The 60s cron stays running as a reconciliation layer — it catches webhook deliveries that QBO drops or that fail signature verify.

---

## If something goes wrong

- `python3 -m api.sync.cli status` always shows the cursor, last 10 log entries, and totals.
- `python3 scripts/test_sync_logic.py && python3 scripts/test_qbo_client.py` re-runs the 21 tests if you suspect a code regression.
- The `invoice_sync_log` table has every action (insert / update / skip_stale / soft_delete / error) — the easiest place to find out why a specific invoice didn't land.

Drop the error message into the PR thread and I'll debug it.
