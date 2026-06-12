import httpx
import logging
from typing import Dict, Any
from services.avatar.models import AvatarException

logger = logging.getLogger("pratibimb.avatar")

LIVEAVATAR_API_BASE = "https://api.liveavatar.com/v1"


class LiveAvatarProvider:
    def __init__(self, api_key: str):
        self.api_key = api_key

    async def create_session(self, avatar_id: str) -> Dict[str, Any]:
        """
        Real LiveAvatar LITE Mode session startup — two calls:
          1. POST /v1/sessions/token  (X-API-KEY auth) → session_token
          2. POST /v1/sessions/start  (Bearer session_token) → livekit credentials + ws_url

        Returns dict with keys:
          session_id, livekit_url, livekit_client_token, ws_url
        """
        if not self.api_key:
            raise AvatarException("LIVEAVATAR_API_KEY is not set")

        headers_api = {
            "Content-Type": "application/json",
            "X-API-KEY": self.api_key,
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            # ── Step 1: Create session token ──────────────────────────────
            logger.info(f"[LiveAvatar] Creating LITE session token for avatar={avatar_id}")
            token_res = await client.post(
                f"{LIVEAVATAR_API_BASE}/sessions/token",
                headers=headers_api,
                json={"mode": "LITE", "avatar_id": avatar_id},
            )
            if token_res.status_code not in (200, 201):
                body = token_res.text
                logger.error(f"[LiveAvatar] Token creation failed {token_res.status_code}: {body}")
                raise AvatarException(f"LiveAvatar token creation failed: {token_res.status_code} — {body}")

            raw = token_res.json()
            token_data = raw.get("data") or raw
            session_token = token_data["session_token"]
            logger.info(f"[LiveAvatar] Session token obtained, session_id={token_data.get('session_id')}")

            # ── Step 2: Start session ─────────────────────────────────────
            start_res = await client.post(
                f"{LIVEAVATAR_API_BASE}/sessions/start",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {session_token}",
                },
                json={},
            )
            if start_res.status_code not in (200, 201):
                body = start_res.text
                logger.error(f"[LiveAvatar] Session start failed {start_res.status_code}: {body}")
                raise AvatarException(f"LiveAvatar session start failed: {start_res.status_code} — {body}")

            raw = start_res.json()
            start_data = raw.get("data") or raw
            logger.info(f"[LiveAvatar] Session started: {start_data.get('session_id')}")

            return {
                "session_id":           start_data["session_id"],
                "livekit_url":          start_data["livekit_url"],
                "livekit_client_token": start_data["livekit_client_token"],
                "ws_url":               start_data.get("ws_url"),
            }

    async def stop_session(self, session_id: str) -> bool:
        """Cleanly terminate an active LITE session."""
        logger.info(f"[LiveAvatar] Stopping session: {session_id}")
        if not self.api_key:
            return True
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.delete(
                    f"{LIVEAVATAR_API_BASE}/sessions/{session_id}",
                    headers={"X-API-KEY": self.api_key},
                )
                return response.status_code in (200, 204)
        except Exception as e:
            logger.warning(f"[LiveAvatar] Exception stopping session {session_id}: {e}")
        return True
