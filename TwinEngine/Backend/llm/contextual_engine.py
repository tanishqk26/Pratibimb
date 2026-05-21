import asyncio
from typing import Optional

import google.generativeai as genai
from google.api_core.exceptions import ResourceExhausted, ServiceUnavailable

from services.vector_service import retrieve_context
from services.conversation_service import get_history, save_message
from schemas.conversation_schema import ConversationMessageCreate
from database.models import ConversationRole

MAX_RETRIES   = 3
RETRY_DELAY   = 2.0
HISTORY_LIMIT = 10


class ContextualGeminiEngine:

    def __init__(self, api_key: str, avatar_id: int, db, user_id: int,
                 personality: Optional[str] = None):
        self.avatar_id   = avatar_id
        self.db          = db
        self.user_id     = user_id
        self.personality = personality or "You are a helpful AI assistant."
        genai.configure(api_key=api_key)
        self._model = genai.GenerativeModel("gemini-2.5-flash")

    async def generate(self, user_text: str) -> str:
        prompt = await self._build_prompt(user_text)
        reply  = await self._call_gemini(prompt)
        if reply:
            asyncio.create_task(self._persist(user_text, reply))
        return reply

    async def _build_prompt(self, user_text: str) -> str:
        memories = await asyncio.get_event_loop().run_in_executor(
            None, lambda: retrieve_context(self.avatar_id, user_text, top_k=5)
        )
        history = await asyncio.get_event_loop().run_in_executor(
            None, lambda: get_history(self.db, self.avatar_id, self.user_id, HISTORY_LIMIT)
        )
        parts = [f"[Personality]\n{self.personality}\n"]
        if memories:
            parts.append("[Relevant memories about you]")
            parts.extend(f"- {m}" for m in memories)
            parts.append("")
        if history:
            parts.append("[Recent conversation]")
            for turn in history:
                label = "User" if turn.role == ConversationRole.user else "You"
                parts.append(f"{label}: {turn.message}")
            parts.append("")
        parts.append(f"User: {user_text}")
        parts.append("Respond conversationally and briefly (under 3 sentences).")
        return "\n".join(parts)

    async def _call_gemini(self, prompt: str) -> str:
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: self._model.generate_content(prompt, stream=False)
                )
                return response.text
            except ResourceExhausted:
                if attempt == MAX_RETRIES:
                    return "Sorry, I've hit my usage limit. Please try again in a moment."
                await asyncio.sleep(RETRY_DELAY * attempt)
            except ServiceUnavailable:
                if attempt == MAX_RETRIES:
                    return "I'm having trouble reaching my brain right now."
                await asyncio.sleep(RETRY_DELAY * attempt)
            except Exception as e:
                print(f"[ContextualGemini] Error: {e}")
                return "Something went wrong on my end."

    async def _persist(self, user_text: str, reply: str):
        try:
            save_message(self.db, self.avatar_id, self.user_id,
                         ConversationMessageCreate(role=ConversationRole.user, message=user_text))
            save_message(self.db, self.avatar_id, self.user_id,
                         ConversationMessageCreate(role=ConversationRole.ai, message=reply))
        except Exception as e:
            print(f"[ContextualGemini] Persist error: {e}")
