import os
import logging

from core.config import settings
from services.avatar.models import AvatarException
from services.avatar.liveavatar_provider import LiveAvatarProvider

logger = logging.getLogger("pratibimb.avatar")


class AvatarManager:
    def __init__(self):
        self.api_key = getattr(settings, "liveavatar_api_key", "") or os.getenv("LIVEAVATAR_API_KEY", "")
        self.provider: LiveAvatarProvider = LiveAvatarProvider(self.api_key)

    async def create_session(self, avatar_id: str) -> dict:
        """
        Create a real LiveAvatar LITE Mode session.
        Returns: { session_id, livekit_url, livekit_client_token, ws_url }
        """
        return await self.provider.create_session(avatar_id)

    async def stop_session(self, session_id: str) -> bool:
        """Terminate an active LiveAvatar session."""
        return await self.provider.stop_session(session_id)


avatar_manager = AvatarManager()
