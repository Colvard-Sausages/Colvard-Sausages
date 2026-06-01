"""
qbo_client.py — QuickBooks Online HTTP client with OAuth2 token management.

Handles:
  - Access-token refresh (1-hour lifetime) using a long-lived refresh_token (100-day rotating)
  - Auto-retry on 401 (refresh + retry once)
  - Exponential backoff on 429 / 5xx
  - Sandbox vs production base URL selection
  - Token persistence (refresh_token rotates on every use; we MUST persist the new one)

Credentials are read from environment variables on first call:
  QBO_CLIENT_ID
  QBO_CLIENT_SECRET
  QBO_REFRESH_TOKEN        (initial value; rotates and is persisted to QBO_TOKEN_FILE)
  QBO_REALM_ID             (the QBO Company ID, 17 digits)
  QBO_ENVIRONMENT          ("sandbox" | "production", default "production")
  QBO_TOKEN_FILE           (path; default ./.qbo_tokens.json — keep out of git)

Why a file for tokens: refresh_tokens ROTATE on every use. If we only read from
env, we'd lose access after the first refresh. The file is the source of truth
after first run; env is the bootstrap.
"""
from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

log = logging.getLogger("colvard.qbo")

_OAUTH_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
_API_BASE = {
    "sandbox": "https://sandbox-quickbooks.api.intuit.com",
    "production": "https://quickbooks.api.intuit.com",
}
_MINOR_VERSION = 70  # QBO API minor version; safe modern default


@dataclass
class QboCreds:
    client_id: str
    client_secret: str
    realm_id: str
    environment: str
    token_file: Path

    @classmethod
    def from_env(cls) -> "QboCreds":
        missing = [
            k for k in ("QBO_CLIENT_ID", "QBO_CLIENT_SECRET", "QBO_REALM_ID")
            if not os.environ.get(k)
        ]
        if missing:
            raise RuntimeError(
                f"Missing required QBO env vars: {missing}. "
                "Register an app at developer.intuit.com to get them."
            )
        return cls(
            client_id=os.environ["QBO_CLIENT_ID"],
            client_secret=os.environ["QBO_CLIENT_SECRET"],
            realm_id=os.environ["QBO_REALM_ID"],
            environment=os.environ.get("QBO_ENVIRONMENT", "production"),
            token_file=Path(os.environ.get("QBO_TOKEN_FILE", ".qbo_tokens.json")),
        )


@dataclass
class TokenSet:
    access_token: str
    refresh_token: str
    access_expires_at: float  # epoch seconds
    refresh_expires_at: float


class QboTokenStore:
    """File-backed token persistence.

    Concurrency note: this implementation assumes a single sync worker per
    realm. If you ever run two, wrap reads/writes with a file lock (fcntl).
    """

    def __init__(self, path: Path):
        self.path = path

    def load(self) -> TokenSet | None:
        if not self.path.exists():
            return None
        try:
            data = json.loads(self.path.read_text())
            return TokenSet(
                access_token=data["access_token"],
                refresh_token=data["refresh_token"],
                access_expires_at=data["access_expires_at"],
                refresh_expires_at=data["refresh_expires_at"],
            )
        except (json.JSONDecodeError, KeyError) as e:
            log.warning("token file %s unreadable, will re-bootstrap: %s", self.path, e)
            return None

    def save(self, tokens: TokenSet) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        # Write to a temp file then atomic-rename so partial writes don't corrupt
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(json.dumps({
            "access_token": tokens.access_token,
            "refresh_token": tokens.refresh_token,
            "access_expires_at": tokens.access_expires_at,
            "refresh_expires_at": tokens.refresh_expires_at,
        }))
        # 0600 so other users on the host can't read it
        try:
            os.chmod(tmp, 0o600)
        except OSError:
            pass
        tmp.replace(self.path)


class QboClient:
    def __init__(self, creds: QboCreds | None = None, http: httpx.Client | None = None):
        self.creds = creds or QboCreds.from_env()
        self.store = QboTokenStore(self.creds.token_file)
        self.http = http or httpx.Client(timeout=30.0)
        self._tokens: TokenSet | None = None
        self._base = _API_BASE[self.creds.environment]

    # ── Token lifecycle ────────────────────────────────────────────────────
    def _bootstrap_from_env(self) -> TokenSet:
        rt = os.environ.get("QBO_REFRESH_TOKEN")
        if not rt:
            raise RuntimeError(
                "No tokens on disk and QBO_REFRESH_TOKEN is unset. "
                "After OAuth handshake, set QBO_REFRESH_TOKEN once to bootstrap."
            )
        # Refresh immediately to get an access_token and rotate the refresh_token
        return self._exchange_refresh(rt)

    def _exchange_refresh(self, refresh_token: str) -> TokenSet:
        log.info("exchanging refresh_token at %s", _OAUTH_TOKEN_URL)
        resp = self.http.post(
            _OAUTH_TOKEN_URL,
            auth=(self.creds.client_id, self.creds.client_secret),
            data={"grant_type": "refresh_token", "refresh_token": refresh_token},
            headers={"Accept": "application/json"},
        )
        if resp.status_code != 200:
            raise RuntimeError(f"OAuth refresh failed: {resp.status_code} {resp.text[:300]}")
        body = resp.json()
        now = time.time()
        tokens = TokenSet(
            access_token=body["access_token"],
            refresh_token=body["refresh_token"],
            # access_token lifetime: typ. 3600s; subtract 60s safety
            access_expires_at=now + body.get("expires_in", 3600) - 60,
            # refresh_token lifetime: typ. ~100 days
            refresh_expires_at=now + body.get("x_refresh_token_expires_in", 100 * 86400) - 86400,
        )
        self.store.save(tokens)
        return tokens

    def _ensure_token(self) -> TokenSet:
        if self._tokens is None:
            self._tokens = self.store.load() or self._bootstrap_from_env()
        if time.time() >= self._tokens.access_expires_at:
            self._tokens = self._exchange_refresh(self._tokens.refresh_token)
        return self._tokens

    # ── HTTP with retry/backoff/refresh-on-401 ─────────────────────────────
    def _request(
        self, method: str, path: str, *, params: dict | None = None,
        json_body: dict | None = None, max_attempts: int = 5,
    ) -> httpx.Response:
        attempt = 0
        backoff = 1.0
        while True:
            attempt += 1
            tokens = self._ensure_token()
            url = f"{self._base}{path}"
            headers = {
                "Authorization": f"Bearer {tokens.access_token}",
                "Accept": "application/json",
            }
            if json_body is not None:
                headers["Content-Type"] = "application/json"

            resp = self.http.request(
                method, url, params=params, json=json_body, headers=headers
            )

            # 401: try a forced refresh once, then retry
            if resp.status_code == 401 and attempt == 1:
                log.info("got 401, forcing token refresh")
                self._tokens = self._exchange_refresh(tokens.refresh_token)
                continue

            # 429 / 5xx: backoff and retry
            if resp.status_code in (429, 500, 502, 503, 504) and attempt < max_attempts:
                # Respect Retry-After if present
                ra = resp.headers.get("Retry-After")
                wait = float(ra) if ra else backoff
                log.warning("status %s; backing off %.1fs (attempt %d)", resp.status_code, wait, attempt)
                time.sleep(wait)
                backoff = min(backoff * 2, 30.0)
                continue

            return resp

    # ── High-level QBO operations ──────────────────────────────────────────
    def query(self, qbo_sql: str) -> dict[str, Any]:
        """Run a QBO SQL query. Returns the parsed response body."""
        path = f"/v3/company/{self.creds.realm_id}/query"
        resp = self._request(
            "GET", path,
            params={"query": qbo_sql, "minorversion": str(_MINOR_VERSION)},
        )
        if resp.status_code != 200:
            raise RuntimeError(f"QBO query failed: {resp.status_code} {resp.text[:500]}")
        return resp.json()

    def cdc(self, entities: list[str], changed_since: str) -> dict[str, Any]:
        """QBO Change Data Capture endpoint."""
        path = f"/v3/company/{self.creds.realm_id}/cdc"
        resp = self._request(
            "GET", path,
            params={
                "entities": ",".join(entities),
                "changedSince": changed_since,
                "minorversion": str(_MINOR_VERSION),
            },
        )
        if resp.status_code != 200:
            raise RuntimeError(f"QBO CDC failed: {resp.status_code} {resp.text[:500]}")
        return resp.json()

    def get_invoice(self, invoice_id: str) -> dict[str, Any]:
        path = f"/v3/company/{self.creds.realm_id}/invoice/{invoice_id}"
        resp = self._request("GET", path, params={"minorversion": str(_MINOR_VERSION)})
        if resp.status_code != 200:
            raise RuntimeError(f"QBO get_invoice failed: {resp.status_code} {resp.text[:500]}")
        return resp.json()
