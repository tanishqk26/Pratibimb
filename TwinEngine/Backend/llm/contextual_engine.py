"""
ContextualGeminiEngine — HTTP-layer RAG chat engine for Pratibimb.

Builds a rich prompt from:
  1. Twin identity / personality system prompt (loaded from DB)
  2. Relevant memories retrieved via cosine-similarity RAG
  3. The current user message

Note: Conversation history persistence is not yet wired (no conversation table).
"""

import asyncio
from typing import Optional

from google import genai
from google.genai.errors import APIError

from services.vector_service import retrieve_relevant_memories
from database.models import Twin

MAX_RETRIES   = 3
RETRY_DELAY   = 2.0


def _build_twin_system_prompt(twin: Optional[Twin]) -> str:
    """Build a rich identity + rules system prompt from the Twin DB record."""
    if twin is None:
        return "You are Pratibimb, a helpful AI digital twin assistant. Be conversational and concise."

    name       = twin.name or "Pratibimb"
    profession = twin.profession or ""
    gender     = twin.gender or ""
    age        = twin.age
    desc       = twin.description or ""
    traits     = twin.personality_traits or ""
    interests  = twin.interests or ""

    parts = [f"You are {name}, a digital AI twin."]
    parts.append("\nIDENTITY:")
    parts.append(f"- Name: {name}")
    if age:        parts.append(f"- Age: {age}")
    if gender:     parts.append(f"- Gender: {gender}")
    if profession: parts.append(f"- Profession: {profession}")
    if desc:       parts.append(f"\nBACKGROUND:\n{desc}")
    if traits:     parts.append(f"\nPERSONALITY TRAITS:\n{traits}")
    if interests:  parts.append(f"\nINTERESTS:\n{interests}")

    parts.append(f"""
RULES:
- Always speak as {name} in the first person.
- Stay in character at all times.
- Be conversational, warm, and concise.
- Keep replies under 3 sentences unless asked for detail.
- Never break character or refer to yourself as an AI or language model.
- When [MEMORY CONTEXT] is provided, use it naturally — speak as if you genuinely recall those memories.
""")
    return "\n".join(parts)


class ContextualGeminiEngine:

    def __init__(self, api_key: str, avatar_id: int, db, user_id: int,
                 personality: Optional[str] = None):
        self.avatar_id   = avatar_id
        self.db          = db
        self.user_id     = user_id
        self.client = genai.Client(api_key=api_key)
        self.model_name = "gemini-2.5-flash"

        # Load the full twin record for a richer system prompt
        twin_record = db.query(Twin).filter(Twin.id == avatar_id).first()
        if twin_record:
            self._system_prompt = _build_twin_system_prompt(twin_record)
            print(f"[ContextualGemini] Loaded twin '{twin_record.name}' (id={avatar_id})")
        else:
            self._system_prompt = personality or "You are a helpful AI assistant."
            print(f"[ContextualGemini] Twin {avatar_id} not found — using generic prompt.")

    async def generate(self, user_text: str) -> str:
        prompt = await self._build_prompt(user_text)
        return await self._call_gemini(prompt)

    async def _build_prompt(self, user_text: str) -> str:
        # ── 1. Retrieve relevant memories via RAG ─────────────────────────────
        memories = await asyncio.get_event_loop().run_in_executor(
            None, lambda: retrieve_relevant_memories(
                self.db, self.avatar_id, user_text, top_k=5
            )
        )

        # ── 2. Assemble prompt ────────────────────────────────────────────────
        parts = [f"[System Persona]\n{self._system_prompt}\n"]

        # RAG memory context block
        if memories:
            parts.append("[MEMORY CONTEXT — things you remember about yourself]")
            for m in memories:
                if m.content:
                    label = f"• {m.title}: " if m.title else "• "
                    parts.append(f"{label}{m.content}")
            parts.append("[END OF MEMORY CONTEXT]\n")
            print(f"[ContextualGemini] Injected {len(memories)} memory chunk(s) into prompt.")
        else:
            print("[ContextualGemini] No relevant memories found for this query.")

        # Current user message
        parts.append(f"User: {user_text}")
        parts.append(
            "Respond conversationally and briefly (under 3 sentences). "
            "Use your memories naturally if relevant to the question."
        )

        return "\n".join(parts)

    async def _call_gemini(self, prompt: str) -> str:
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = await self.client.aio.models.generate_content(
                    model=self.model_name,
                    contents=prompt
                )
                return response.text
            except APIError as e:
                if e.code == 429:
                    if attempt == MAX_RETRIES:
                        return "Sorry, I've hit my usage limit. Please try again in a moment."
                elif e.code == 503:
                    if attempt == MAX_RETRIES:
                        return "I'm having trouble reaching my brain right now."
                else:
                    print(f"[ContextualGemini] APIError: {e}")
                    return "Something went wrong on my end."
                await asyncio.sleep(RETRY_DELAY * attempt)
            except Exception as e:
                print(f"[ContextualGemini] Error: {e}")
                return "Something went wrong on my end."
