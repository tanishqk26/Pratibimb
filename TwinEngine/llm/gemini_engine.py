import asyncio
from google import genai
from google.genai import types
from google.genai.errors import APIError
from services.provider_manager import GeminiProviderManager

MAX_RETRIES = 3
RETRY_DELAY = 0.5

# BCP-47 codes Sarvam returns → natural language names for Gemini
LANG_NAMES: dict[str, str] = {
    "hi-IN": "Hindi",
    "mr-IN": "Marathi",
    "en-IN": "English",
    "ta-IN": "Tamil",
    "te-IN": "Telugu",
    "kn-IN": "Kannada",
    "ml-IN": "Malayalam",
    "gu-IN": "Gujarati",
    "pa-IN": "Punjabi",
    "bn-IN": "Bengali",
    "od-IN": "Odia",
}

DEFAULT_PROMPT = """
You are Pratibimb, a digital AI twin assistant.
Speak conversationally and briefly.
Keep replies under 3 sentences.
ALWAYS reply in the SAME LANGUAGE the user speaks to you in.
"""

def build_system_prompt(twin: dict) -> str:
    if not twin or not twin.get("name"):
        return DEFAULT_PROMPT

    name        = twin.get("name", "Pratibimb")
    age         = twin.get("age")
    gender      = twin.get("gender", "")
    profession  = twin.get("profession", "")
    description = twin.get("description", "")
    traits      = twin.get("personality_traits", "")
    interests   = twin.get("interests", "")

    prompt = f"""You are {name}, a digital AI twin.

IDENTITY:
- Name: {name}
"""
    if age:       prompt += f"- Age: {age}\n"
    if gender:    prompt += f"- Gender: {gender}\n"
    if profession:prompt += f"- Profession: {profession}\n"

    if description:
        prompt += f"\nBACKGROUND:\n{description}\n"

    if traits:
        prompt += f"\nPERSONALITY TRAITS:\n{traits}\n"

    if interests:
        prompt += f"\nINTERESTS:\n{interests}\n"

    prompt += f"""
RULES:
- Always speak as {name} in the first person.
- Stay in character at all times.
- Be conversational, warm, and concise.
- Keep replies under 3 sentences unless asked for detail.
- Never break character or refer to yourself as an AI or language model.
- ALWAYS reply in the SAME LANGUAGE the user speaks to you in.
  If the user writes in Hindi, reply in Hindi.
  If the user writes in Marathi, reply in Marathi.
  If the user writes in English, reply in English.
- When [MEMORY CONTEXT] is provided, use it naturally — it represents things you remember about yourself. Speak as if you genuinely recall those memories.
"""
    return prompt


class GeminiEngine:
    """
    RAG strategy: Cache-first + Background-update
    ─────────────────────────────────────────────
    On every turn:
      1. Serve cached memories from the PREVIOUS turn instantly (0ms).
      2. Fire a background task to run the full semantic RAG for THIS query.
      3. The background task updates _memory_cache so the NEXT turn gets
         fresh, semantically relevant memories.

    On set_twin():
      - Pre-warm the cache with a fast keyword search (no API call, < 5ms)
        so even the very first question has basic memory context.

    Net effect: LLM first-token latency is back to ~2s regardless of how long
    the Gemini embedding API takes (it runs completely off the critical path).
    """

    # Class-level counter for background embedding tasks
    _pending_tasks = 0

    def __init__(self, api_key):
        self.provider = GeminiProviderManager()
        current_key = self.provider.get_current_key() or api_key
        self.client = genai.Client(api_key=current_key)
        self.model = "gemini-2.5-flash"
        self._system_prompt = DEFAULT_PROMPT
        self._twin_id: int | None = None
        self._memory_cache: list[dict] = []      # warm memories from last turn
        self._rag_running: bool = False           # guard against concurrent BG tasks
        self._rebuild_config()

    def _rebuild_config(self):
        self.config = types.GenerateContentConfig(
            system_instruction=self._system_prompt
        )

    def set_twin(self, twin: dict):
        """Configure system prompt and pre-warm memory cache (keyword search, no API)."""
        self._system_prompt = build_system_prompt(twin)
        self._twin_id = twin.get("id")
        self._memory_cache = []   # reset for new session
        self._rag_running = False
        self._rebuild_config()
        print(f"[Gemini] System prompt set for twin: {twin.get('name', '?')} (id={self._twin_id})")

        # Pre-warm cache with fast keyword search — no embedding API call, ~5ms
        if self._twin_id is not None:
            try:
                warm = _keyword_prewarm(self._twin_id)
                if warm:
                    self._memory_cache = warm
                    print(f"[Gemini] Pre-warmed memory cache with {len(warm)} keyword memories.")
            except Exception as e:
                print(f"[Gemini] Pre-warm error (non-fatal): {e}")

    def _build_rag_context(self, memories: list[dict]) -> str:
        """Format retrieved memories into a structured context block."""
        if not memories:
            return ""
        lines = ["[MEMORY CONTEXT — things you remember about yourself]"]
        for m in memories:
            title   = m.get("title", "").strip()
            content = m.get("content", "").strip()
            if content:
                lines.append(f"• {title}: {content}" if title else f"• {content}")
        lines.append("[END OF MEMORY CONTEXT]")
        return "\n".join(lines)

    async def generate_stream(self, text: str, lang_code: str = "en-IN", session_context: list[dict] = None):
        """
        Stream a response from Gemini.

        ZERO RAG latency on the hot path:
          - Cached memories are used instantly (updated by the previous turn's BG task).
          - A new background task is fired to refresh the cache for the next turn.
        """
        lang_name = LANG_NAMES.get(lang_code, "English")

        # ── 1. Use cached memories instantly (0ms) ────────────────────────────
        memories = list(self._memory_cache)
        memory_context = self._build_rag_context(memories)

        if memories:
            print(f"[Gemini] Using {len(memories)} cached memory chunk(s) (0ms overhead).")
        else:
            print("[Gemini] No cached memories yet — responding with identity only.")

        # ── 2. Fire background RAG to refresh cache for NEXT turn ─────────────
        if self._twin_id is not None and not self._rag_running:
            asyncio.create_task(self._background_rag_update(text))

        # ── 3. Build prompt and start streaming immediately ───────────────────
        content_parts = [f"[LANGUAGE INSTRUCTION: Respond only in {lang_name}]"]
        if memory_context:
            content_parts.append(memory_context)
            
        if session_context:
            context_lines = ["[CONVERSATION HISTORY — context from the current session]"]
            for m in session_context:
                role_name = "User" if m["role"] == "user" else "Assistant"
                context_lines.append(f"{role_name}: {m['message']}")
            context_lines.append("[END OF CONVERSATION HISTORY]")
            content_parts.append("\n".join(context_lines))

        content_parts.append(text)
        content = "\n\n".join(content_parts)

        # ── Request Purpose Logging ──
        print("[LLM CALL] Purpose=twin_response")

        max_attempts = 2  # Max ONE retry after rotation
        for attempt in range(1, max_attempts + 1):
            try:
                # Always use current key from provider manager
                current_key = self.provider.get_current_key()
                self.client = genai.Client(api_key=current_key)

                response = await self.client.aio.models.generate_content_stream(
                    model=self.model,
                    contents=content,
                    config=self.config
                )
                async for chunk in response:
                    if chunk.text:
                        yield chunk.text
                return

            except Exception as e:
                is_429 = False
                if isinstance(e, APIError):
                    if getattr(e, 'code', None) == 429 or "429" in str(e):
                        is_429 = True
                elif "429" in str(e) or "quota" in str(e).lower() or "limit" in str(e).lower():
                    is_429 = True

                print(f"[Gemini] Error on attempt {attempt}: {e}")

                if is_429 and attempt == 1:
                    # Rotate the API key and retry once
                    self.provider.rotate_key()
                    continue
                else:
                    # Return graceful fallback response
                    yield "I'm currently overloaded. Please try again shortly."
                    return

    async def _background_rag_update(self, query: str):
        """
        Background task: run full semantic RAG (embedding API + cosine similarity)
        and update the memory cache for the NEXT turn.

        Runs completely off the hot path — does not block LLM streaming.
        """
        if GeminiEngine._pending_tasks >= 2:
            print("[Embedding] Queue full, skipping embedding")
            return

        GeminiEngine._pending_tasks += 1
        self._rag_running = True
        try:
            loop = asyncio.get_event_loop()
            memories = await loop.run_in_executor(
                None, _fetch_memories, self._twin_id, query
            )
            if memories:
                self._memory_cache = memories
                print(f"[Gemini] BG RAG done — cache updated with {len(memories)} memory chunk(s) "
                      f"(scores: {[m['score'] for m in memories]}).")
            else:
                print("[Gemini] BG RAG found no relevant memories — cache unchanged.")
        except Exception as e:
            print(f"[Gemini] BG RAG error (non-fatal): {e}")
        finally:
            self._rag_running = False
            GeminiEngine._pending_tasks = max(0, GeminiEngine._pending_tasks - 1)


# ── Sync helpers (called via run_in_executor) ─────────────────────────────────

def _fetch_memories(twin_id: int, query: str) -> list[dict]:
    """Full semantic RAG: embed query → cosine similarity → top-k memories."""
    from rag.memory_retriever import retrieve_relevant_memories
    return retrieve_relevant_memories(twin_id=twin_id, query=query, top_k=5)


def _keyword_prewarm(twin_id: int) -> list[dict]:
    """Fast keyword pre-warm: load recent memories for a twin with no API call."""
    from rag.memory_retriever import prewarm_memories
    return prewarm_memories(twin_id=twin_id, top_k=5)