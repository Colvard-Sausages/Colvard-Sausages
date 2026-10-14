# Container for the invoices dashboard API + sync.
# Works on any host that runs Docker — including a small box behind your
# existing Cloudflare (via Cloudflare Tunnel). This is "Path A" from the
# session handoff: keep the Python stack, let Cloudflare front it.
FROM python:3.12-slim

WORKDIR /app

# Deps first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY api/ ./api/
COPY dashboards/ ./dashboards/
COPY schema/ ./schema/
COPY scripts/ ./scripts/

# master.db is provided at runtime via a mounted volume (see docker-compose).
# Credentials come from the environment / .env, never baked into the image.
ENV COLVARD_DB_PATH=/data/master.db \
    QBO_TOKEN_FILE=/data/.qbo_tokens.json

EXPOSE 8765

# Default: serve the page + API. The sync runs as a separate service
# (see docker-compose.yml) so the web process stays responsive.
CMD ["python3", "-m", "uvicorn", "api.invoices_api:app", "--host", "0.0.0.0", "--port", "8765"]
