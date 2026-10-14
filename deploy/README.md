# Deploying the invoices dashboard

Three ways to run this in production. All assume your QuickBooks credentials are
in a `.env` file (see `../.env.example`). Pick the one that fits your infra.

The deployment-path decision (whether this lives behind your existing Cloudflare
or elsewhere) is discussed in `../docs/SESSION-HANDOFF.md` §5.

---

## Option 1 — Docker (simplest; works anywhere)

```bash
cp .env.example .env          # fill in QuickBooks values
docker compose up -d          # starts web (:8765) + 60s sync
# one-time seed of the database:
docker compose run --rm sync python3 -m api.sync.cli backfill --since 2026-01-01
```

Page is at `http://<host>:8765`. To put it behind your existing Cloudflare,
point a **Cloudflare Tunnel** at `localhost:8765` — no open inbound ports
needed. Your `invoices.html` then loads under your normal dashboard domain.

## Option 2 — systemd (no Docker)

```bash
sudo mkdir -p /opt && sudo cp -r . /opt/Colvard-Sausages
cd /opt/Colvard-Sausages && pip install -r requirements.txt
sudo mkdir -p /etc/colvard && sudo cp .env /etc/colvard/qbo.env

# web service
sudo cp deploy/colvard-web.service /etc/systemd/system/
sudo systemctl enable --now colvard-web.service

# 60s sync timer
sudo cp deploy/systemd/colvard-sync.* /etc/systemd/system/
sudo systemctl enable --now colvard-sync.timer

# one-time seed
python3 -m api.sync.cli backfill --since 2026-01-01
```

Check it: `systemctl status colvard-web` and `python3 -m api.sync.cli status`.

## Option 3 — Cloudflare-native (Path B, not yet built)

If you'd rather not run a server at all, the invoices feature can be rebuilt on
**Cloudflare Workers + D1 + Cron Triggers**. The SQLite schema is ~95% portable
to D1. This is a separate build, tracked as an open decision in the handoff doc.
Tell Claude "go Path B" to scaffold it.

---

## Wiring into the existing dashboards

However you host it, add a **Sales** group to the dashboard nav that links
`invoices.html` alongside `executive.html`, `customer.html`, and
`distributor.html`. The page uses same-origin relative paths to `/api/*`, so
serve it from the same domain as the API (or set up a path rewrite in
Cloudflare).
