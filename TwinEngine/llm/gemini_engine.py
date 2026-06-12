import asyncio
import time
from google import genai
from google.genai import types
from google.genai.errors import APIError
from services.provider_manager import GeminiProviderManager

# ── Module-level client cache — one object per API key, reused forever ────────
_client_cache: dict[str, genai.Client] = {}

def _get_client(api_key: str) -> genai.Client:
    """Return a cached genai.Client for the given API key."""
    if api_key not in _client_cache:
        _client_cache[api_key] = genai.Client(api_key=api_key)
    return _client_cache[api_key]


# ── BCP-47 → language names for Gemini prompt ────────────────────────────────
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

DEFAULT_PROMPT = """\
You are Pratibimb, a digital AI twin assistant.
Speak conversationally and briefly. Keep replies under 3 sentences.
ALWAYS reply in the SAME LANGUAGE the user speaks to you in.\
"""

# ── Token budget constants ────────────────────────────────────────────────────
# Max memory chunks injected into prompt (keeps memory context under ~600 tokens)
MAX_MEMORY_CHUNKS = 2
# Max chars per memory content snippet (prevents one huge memory dominating)
MAX_MEMORY_CONTENT_CHARS = 300
# Max conversation history turns injected (each turn ≈ 60–120 tokens)
MAX_HISTORY_TURNS = 6   # was 15 in conversation_engine — halved here

# ── Low-value utterances — skip background RAG for these ─────────────────────
# RAG costs a CPU embedding + SQLite scan. Skip only for pure social chatter.
_SOCIAL_FILLER = {
    "hi", "hello", "hey", "ok", "okay", "yes", "no", "sure", "thanks",
    "thank you", "bye", "goodbye", "hmm", "huh", "nice", "great", "good",
    "नमस्कार", "नमस्ते", "हाँ", "हां", "नहीं", "ठीक है", "ठीक",
    "हो", "बरोबर", "नाही", "अहो"
}

def _is_social_utterance(text: str) -> bool:
    """Return True if the text is pure conversational filler — RAG won't help."""
    cleaned = text.strip().lower().strip("?.!,")
    if cleaned in _SOCIAL_FILLER:
        return True
    
    words = cleaned.split()
    if len(words) <= 2:
        # Extremely short: if any word is a social filler, skip
        if any(w in _SOCIAL_FILLER for w in words):
            return True
    return False


def build_system_prompt(twin: dict) -> str:
    """Build the system prompt. Kept lean — identity + rules only, no examples."""
    if not twin or not twin.get("name"):
        return DEFAULT_PROMPT

    name        = twin.get("name", "Pratibimb")
    age         = twin.get("age")
    gender      = twin.get("gender", "")
    profession  = twin.get("profession", "")
    description = twin.get("description", "")
    traits      = twin.get("personality_traits", "")
    interests   = twin.get("interests", "")

    parts = [f"You are {name}, a digital AI twin.\n\nIDENTITY:\n- Name: {name}"]
    if age:        parts.append(f"- Age: {age}")
    if gender:     parts.append(f"- Gender: {gender}")
    if profession: parts.append(f"- Profession: {profession}")

    if description:
        # Truncate long descriptions to 400 chars — avoids token bloat in system prompt
        desc_trimmed = description[:400] + ("…" if len(description) > 400 else "")
        parts.append(f"\nBACKGROUND:\n{desc_trimmed}")

    if traits:
        parts.append(f"\nPERSONALITY TRAITS:\n{traits[:200]}")

    if interests:
        parts.append(f"\nINTERESTS:\n{interests[:150]}")

    # Compact rules block — same semantics, fewer tokens
    parts.append(f"""
RULES:
* Always speak as {name} in first person and stay in character.
* Be conversational, warm, and concise. Keep replies under 3 sentences unless more detail is requested.
* Never acknowledge being an AI, assistant, or language model.
* ALWAYS reply in the SAME LANGUAGE as the user.

MEMORY USAGE:
* If <MEMORY_CONTEXT> is provided, treat it as background knowledge for personality, relationships, preferences, and past events.
* Use memories subtly and naturally.
* Do not blindly agree with every user statement. Stay logically and factually consistent with the character.
* If the user describes an event from the memory, respond naturally without explicitly saying "I remember" unless it is a believable personal memory.
* Never fabricate sensory details (e.g. "I saw", "I felt", "I was there") unless those details exist in memory context.

CRITICAL REALITY & DEATH SAFETY RULES:
* Never claim to be alive after death.
* Never imply consciousness after death.
* Never claim survival of fatal events unless explicitly stated in memory.
* Never emotionally manipulate the user into believing the twin is spiritually present, immortal, trapped, or supernaturally aware.
* If discussing tragedy, accidents, or death, respond respectfully and factually.

OUTPUT RULES:
* Do NOT output, echo, or include any system tags, headers, or delimiters (such as <MEMORY_CONTEXT>, </MEMORY_CONTEXT>, <RECENT_CONVERSATION>, </RECENT_CONVERSATION>, <USER_MESSAGE>, </USER_MESSAGE>, [LANGUAGE], etc.) in your response.
* Output ONLY the character's direct spoken reply.
""")

    return "\n".join(parts)


class GeminiEngine:
    """
    RAG strategy: Cache-first + Background-update
    ─────────────────────────────────────────────
    - Cached memories from the PREVIOUS turn served instantly (0ms overhead).
    - Background task refreshes cache for NEXT turn (off the critical path).
    - Dynamic prompt mode: tiny/normal based on utterance complexity.
    - Token budget: caps memory chunks and history turns to control cost.
    - Provider cooldown: 429 → key on cooldown → rotate to next available key.
    """

    # Semaphore: max concurrent background embedding tasks across all sessions
    _rag_semaphore = asyncio.Semaphore(2)

    def __init__(self, api_key: str):
        self.provider = GeminiProviderManager()
        self._fallback_key = api_key
        self.model = "gemini-2.5-flash"
        self._system_prompt = DEFAULT_PROMPT
        self._twin_id: int | None = None
        self._memory_cache: list[dict] = []
        self._rag_running: bool = False
        # Timestamp of last RAG run — used to debounce on consecutive turns
        self._last_rag_ts: float = 0.0
        self._rebuild_config()

    # ── Client & config management ────────────────────────────────────────────

    def _get_current_client(self) -> genai.Client:
        key = self.provider.get_current_key() or self._fallback_key
        return _get_client(key)

    def _rebuild_config(self):
        self.config = types.GenerateContentConfig(
            system_instruction=self._system_prompt,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        )

    # ── Twin setup ────────────────────────────────────────────────────────────

    def set_twin(self, twin: dict):
        """Configure system prompt and pre-warm memory cache (keyword search, no API)."""
        self._system_prompt = build_system_prompt(twin)
        self._twin_id = twin.get("id")
        self._memory_cache = []
        self._rag_running = False
        self._last_rag_ts = 0.0
        self._rebuild_config()
        print(f"[Gemini] System prompt set for twin: {twin.get('name', '?')} (id={self._twin_id})")

        # Pre-warm cache with fast keyword search — no embedding, ~5ms
        if self._twin_id is not None:
            try:
                warm = _keyword_prewarm(self._twin_id)
                if warm:
                    self._memory_cache = warm
                    print(f"[Gemini] Pre-warmed memory cache with {len(warm)} keyword memories.")
            except Exception as e:
                print(f"[Gemini] Pre-warm error (non-fatal): {e}")

    # ── Prompt construction ───────────────────────────────────────────────────

    def _build_rag_context(self, memories: list[dict]) -> str:
        """
        Format top-k memories into a compact context block.
        Caps to MAX_MEMORY_CHUNKS and MAX_MEMORY_CONTENT_CHARS per entry
        to enforce the token budget.
        """
        if not memories:
            return ""
        lines = []
        for m in memories[:MAX_MEMORY_CHUNKS]:
            title   = (m.get("title") or "").strip()
            content = (m.get("content") or "").strip()
            # Truncate content to budget
            if len(content) > MAX_MEMORY_CONTENT_CHARS:
                content = content[:MAX_MEMORY_CONTENT_CHARS] + "…"
            if content:
                lines.append(f"• {title}: {content}" if title else f"• {content}")
        return "\n".join(lines)

    def _build_history_context(self, session_context: list[dict]) -> str:
        """
        Format recent conversation history.
        Capped to MAX_HISTORY_TURNS (most recent) to control token spend.
        """
        if not session_context:
            return ""
        # Take the most recent N turns (pairs are user+twin, so cap at N messages)
        recent = session_context[-MAX_HISTORY_TURNS:]
        lines = []
        for m in recent:
            role_name = "User" if m["role"] == "user" else "Assistant"
            # Cap each message at 200 chars to prevent one long reply blowing budget
            msg = m["message"][:200] + ("…" if len(m["message"]) > 200 else "")
            lines.append(f"{role_name}: {msg}")
        return "\n".join(lines)

    # ── Main streaming entry point ─────────────────────────────────────────────

    async def generate_stream(
        self,
        text: str,
        lang_code: str = "en-IN",
        session_context: list[dict] | None = None,
    ):
        """
        Stream a response from Gemini with zero RAG latency on the hot path.

        Dynamic prompt mode:
          - Social/short utterances → compact prompt (lang + user text only)
          - Normal utterances       → full prompt with memory + history
        """
        lang_name = LANG_NAMES.get(lang_code, "English")
        is_social = _is_social_utterance(text)

        # ── 1. Use cached memories instantly (0ms) ────────────────────────────
        memories = list(self._memory_cache)
        memory_context = "" if is_social else self._build_rag_context(memories)

        if is_social:
            print(f"[Gemini] Social utterance — skipping memory injection.")
        elif memories:
            print(f"[Gemini] Using {len(memories)} cached memory chunk(s) (0ms overhead).")
        else:
            print("[Gemini] No cached memories — responding with identity only.")

        # ── 2. Fire background RAG to refresh cache for NEXT turn ─────────────
        # Debounce: skip if another BG task is running OR last RAG was < 2s ago
        # Also skip for pure social turns (no semantic value for RAG update)
        now = time.monotonic()
        should_rag = (
            self._twin_id is not None
            and not self._rag_running
            and not is_social
            and (now - self._last_rag_ts) > 2.0
        )
        if should_rag:
            asyncio.create_task(self._background_rag_update(text, lang_code))

        # ── 3. Build prompt (XML format) ──────────────────────────────────────
        content_parts = [f"[LANGUAGE: Respond only in {lang_name}]"]

        if not is_social and memory_context:
            content_parts.append(f"<MEMORY_CONTEXT>\n{memory_context}\n</MEMORY_CONTEXT>")

        if not is_social and session_context:
            history = self._build_history_context(session_context)
            if history:
                content_parts.append(f"<RECENT_CONVERSATION>\n{history}\n</RECENT_CONVERSATION>")

        content_parts.append(f"<USER_MESSAGE>\n{text}\n</USER_MESSAGE>")
        content = "\n\n".join(content_parts)

        print("[LLM CALL] Purpose=twin_response")

        # ── 4. Stream with cooldown-aware retry ───────────────────────────────
        max_attempts = 2
        for attempt in range(1, max_attempts + 1):
            try:
                client = self._get_current_client()
                response = await client.aio.models.generate_content_stream(
                    model=self.model,
                    contents=content,
                    config=self.config,
                )
                async for chunk in response:
                    if chunk.text:
                        yield chunk.text
                return

            except Exception as e:
                is_429 = (
                    (isinstance(e, APIError) and (getattr(e, 'code', None) == 429 or "429" in str(e)))
                    or "429" in str(e)
                    or "quota" in str(e).lower()
                    or "RESOURCE_EXHAUSTED" in str(e)
                )
                is_503 = "503" in str(e) or "UNAVAILABLE" in str(e)

                print(f"[Gemini] Error attempt {attempt}: {type(e).__name__}: {str(e)[:120]}")

                if is_429 and attempt == 1:
                    # Mark current key on cooldown and rotate
                    current_key = self.provider.get_current_key()
                    new_key = self.provider.mark_key_exhausted(current_key)
                    if new_key:
                        print("[Gemini] Retrying with next available key...")
                        continue
                    else:
                        # All keys exhausted — fail fast
                        print("[Gemini] All keys exhausted — aborting.")
                        yield "I'm a bit busy right now. Please try again in a moment."
                        return
                elif is_503 and attempt == 1:
                    # Transient overload — brief yield + retry on same key
                    print("[Gemini] 503 overload — retrying same key after 0.3s...")
                    await asyncio.sleep(0.3)
                    continue
                else:
                    yield "I'm a bit busy right now. Please try again in a moment."
                    return

    # ── Background RAG (off hot path) ─────────────────────────────────────────

    async def _background_rag_update(self, query: str, lang_code: str = "en-IN"):
        """
        Run full semantic RAG off the hot path and update the memory cache.
        Uses a semaphore to cap concurrent embedding tasks across all sessions.
        """
        async with GeminiEngine._rag_semaphore:
            self._rag_running = True
            self._last_rag_ts = time.monotonic()
            try:
                search_query = query
                # Translate query to English if the user is speaking a non-English language.
                # Since this runs in the background off the critical path, this has 0ms impact on TTFT.
                if lang_code != "en-IN":
                    try:
                        client = self._get_current_client()
                        prompt = f'Translate the following search query to English. Output only the translated text, nothing else: "{query}"'
                        response = await client.aio.models.generate_content(
                            model=self.model,
                            contents=prompt,
                        )
                        translated = response.text.strip().strip('"\'')
                        if translated:
                            search_query = translated
                            print(f"[Gemini] Translated query from '{query}' to '{search_query}'")
                    except Exception as te:
                        print(f"[Gemini] Query translation failed: {te}")

                loop = asyncio.get_event_loop()
                memories = await loop.run_in_executor(
                    None, _fetch_memories, self._twin_id, search_query
                )
                if memories:
                    self._memory_cache = memories
                    scores = [round(m.get('score', 0), 3) for m in memories]
                    print(f"[Gemini] BG RAG updated cache: {len(memories)} chunk(s) {scores}")
                else:
                    print("[Gemini] BG RAG: no relevant memories — cache unchanged.")
            except Exception as e:
                print(f"[Gemini] BG RAG error (non-fatal): {e}")
            finally:
                self._rag_running = False


# ── Sync helpers (run via executor) ───────────────────────────────────────────

def _fetch_memories(twin_id: int, query: str) -> list[dict]:
    """Full semantic RAG: embed query → cosine similarity → top-k memories."""
    from rag.memory_retriever import retrieve_relevant_memories
    return retrieve_relevant_memories(twin_id=twin_id, query=query, top_k=MAX_MEMORY_CHUNKS + 1)


def _keyword_prewarm(twin_id: int) -> list[dict]:
    """Fast keyword pre-warm: load recent memories with no API call."""
    from rag.memory_retriever import prewarm_memories
    return prewarm_memories(twin_id=twin_id, top_k=MAX_MEMORY_CHUNKS)