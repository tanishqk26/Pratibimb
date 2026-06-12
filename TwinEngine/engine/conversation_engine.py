import asyncio
import re
import time
from services.memory_service import RedisMemoryService

# ── Compile regex once at module load — not per-call ─────────────────────────
# Flushes TTS at sentence enders AND mid-sentence clause breaks.
_CLAUSE_PATTERN = re.compile(r'([.!?;:,\u2014\u2013-])')

# Chars buffered before forcing a TTS flush even without punctuation
_MAX_BUFFER_CHARS = 60

# Session context limit passed to the LLM — capped here too as a safety net
_MAX_CONTEXT_MESSAGES = 10

_XML_BLOCK_RE = re.compile(r'<(MEMORY_CONTEXT|RECENT_CONVERSATION|USER_MESSAGE)[^>]*>.*?</\1>', re.DOTALL | re.IGNORECASE)
_XML_TAG_RE = re.compile(r'<[^>]+>')
_BRACKET_RE = re.compile(r'\[[^\]]+\]')

def sanitize_text(text: str) -> str:
    """
    Lightweight sanitizer to strip XML blocks/tags, square-bracket system tags,
    timing/debug logs, and headers. Preserves Unicode and conversational text.
    """
    if not text:
        return ""
    # 1. Remove XML blocks with their content (e.g. <MEMORY_CONTEXT>...</MEMORY_CONTEXT>)
    text = _XML_BLOCK_RE.sub("", text)
    # 2. Remove any remaining XML tags (e.g. <MEMORY_CONTEXT> or </MEMORY_CONTEXT>)
    text = _XML_TAG_RE.sub("", text)
    # 3. Remove square-bracket tags/headers (e.g. [LANGUAGE: ...], [⏱ ...], [/MEMORY ...])
    text = _BRACKET_RE.sub("", text)
    return text.strip()


class ConversationEngine:

    def __init__(self, stt, llm, tts):
        self.stt = stt
        self.llm = llm
        self.tts = tts

        self._active_task: asyncio.Task | None = None
        self._lock = asyncio.Lock()
        self.session_messages: list[dict] = []
        self.session_id: str | None = None
        self.memory_service = RedisMemoryService()

        # In-process session context cache — avoids Redis round-trip on every turn
        # when the message was just added this turn (mirrors session_messages)
        self._context_cache: list[dict] = []

    # ── State helpers ─────────────────────────────────────────────────────────

    def is_speaking(self) -> bool:
        """True if a pipeline task is currently running."""
        return self._active_task is not None and not self._active_task.done()

    # ── Barge-in (PTT interrupt) ──────────────────────────────────────────────

    async def barge_in(self):
        """
        Explicit PTT interrupt: cancel the active LLM/TTS pipeline immediately.
        Called when user presses SPACEBAR.
        """
        print("[Engine] PTT interrupt — stopping AI pipeline.")
        async with self._lock:
            await self.tts.cancel()
            task = self._active_task
            if task and not task.done():
                task.cancel()
                try:
                    await asyncio.shield(task)
                except (asyncio.CancelledError, Exception):
                    pass
            self._active_task = None

    # ── Core streaming pipeline ───────────────────────────────────────────────

    async def _process_stream(self, text: str, lang_code: str = "en-IN"):
        buffer = ""
        full_ai_text = ""

        _first_tts_send = None
        _first_llm_token = None
        _pipeline_start = time.perf_counter()
        _chunks_sent = 0

        try:
            # ── Parallel: fetch session context AND start TTS connect concurrently ──
            # Previously: context fetch was awaited BEFORE starting TTS or LLM.
            # Now: all three start in parallel — context arrives just in time for
            # prompt construction which happens after the first LLM token anyway.
            tts_future = asyncio.ensure_future(self.tts.start_session())
            context_future = asyncio.ensure_future(self._fetch_context_safe())
            _tts_connect_time = time.perf_counter()

            # ── Use local in-memory cache immediately as a fast-path fallback ──
            # This covers the common case (Redis/DB may lag). The awaited result
            # will be a superset or equal — GeminiEngine receives whichever
            # arrives first via generate_stream().
            local_context = self.session_messages[:-1][-_MAX_CONTEXT_MESSAGES:]

            # Start LLM stream with local context immediately — don't wait for Redis
            llm_stream = self.llm.generate_stream(text, lang_code, session_context=local_context)

            print("Pratibimb (Streaming):", end=" ")

            async for chunk in llm_stream:
                # ── First token received ──────────────────────────────────────
                if _first_llm_token is None:
                    _first_llm_token = time.perf_counter()
                    print(f"\n[⏱ LLM first token: {(_first_llm_token - _pipeline_start)*1000:.0f}ms]")

                    # TTS session must be ready before first speak()
                    await tts_future

                    # Staleness guard: if LLM was slow, WS may have timed out (ElevenLabs closes idle connections after 20s)
                    idle_time = _first_llm_token - _tts_connect_time
                    if idle_time > 15.0:
                        print(f"[TTS] WS idle {idle_time:.1f}s — reconnecting.")
                        await self.tts.cancel()
                        # Await the reconnect to ensure connection is fully established before sending text
                        await self.tts.start_session()

                buffer += chunk
                full_ai_text += chunk
                print(chunk, end="", flush=True)

                # ── Clause-level flushing ─────────────────────────────────────
                should_flush = False
                flush_text = ""

                match = _CLAUSE_PATTERN.search(buffer)
                if match:
                    split_idx = match.end()
                    flush_text = buffer[:split_idx].strip()
                    buffer = buffer[split_idx:]
                    should_flush = bool(flush_text)
                elif len(buffer) >= _MAX_BUFFER_CHARS:
                    last_space = buffer.rfind(' ', 0, _MAX_BUFFER_CHARS)
                    if last_space > 0:
                        flush_text = buffer[:last_space].strip()
                        buffer = buffer[last_space:]
                    else:
                        flush_text = buffer.strip()
                        buffer = ""
                    should_flush = bool(flush_text)

                if should_flush and flush_text:
                    sanitized_flush = sanitize_text(flush_text)
                    if sanitized_flush:
                        if _first_tts_send is None:
                            _first_tts_send = time.perf_counter()
                            print(f"\n[⏱ First TTS send: {(_first_tts_send - _pipeline_start)*1000:.0f}ms]")
                        await self.tts.speak(sanitized_flush)
                        _chunks_sent += 1

            # Flush remaining buffer
            if buffer.strip():
                sanitized_flush = sanitize_text(buffer.strip())
                if sanitized_flush:
                    await self.tts.speak(sanitized_flush)
                    _chunks_sent += 1

            await self.tts.flush()
            print()

            # Cancel context future if it's still pending (we don't need it now)
            if not context_future.done():
                context_future.cancel()

            # Timing summary
            _pipeline_end = time.perf_counter()
            total_ms        = (_pipeline_end - _pipeline_start) * 1000
            llm_latency_ms  = ((_first_llm_token - _pipeline_start) * 1000) if _first_llm_token else 0
            tts_latency_ms  = ((_first_tts_send  - _pipeline_start) * 1000) if _first_tts_send  else 0
            print(
                f"[⏱ Pipeline] total={total_ms:.0f}ms | "
                f"LLM-first-token={llm_latency_ms:.0f}ms | "
                f"first-TTS-send={tts_latency_ms:.0f}ms | "
                f"chunks={_chunks_sent}"
            )

            return sanitize_text(full_ai_text)

        except asyncio.CancelledError:
            print("[Engine] Stream interrupted.")
            raise
        except Exception as e:
            print(f"[Engine] Pipeline error: {e}")

    # ── Context fetch (safe, with local fallback) ─────────────────────────────

    async def _fetch_context_safe(self) -> list[dict]:
        """Fetch session context from Redis/DB. Never raises — returns [] on error."""
        if not self.session_id:
            return []
        try:
            result = await self.memory_service.fetch_session_context(
                self.session_id, limit=_MAX_CONTEXT_MESSAGES
            )
            return result
        except Exception as e:
            print(f"[Engine] Context fetch error (non-fatal): {e}")
            return []

    # ── Public transcript handler ─────────────────────────────────────────────

    async def handle_transcript(self, text: str, lang_code: str = "en-IN"):
        async with self._lock:
            # Safety guard — in PTT mode barge_in() already cancelled
            if self._active_task and not self._active_task.done():
                self._active_task.cancel()
                await self.tts.cancel()
            self._active_task = asyncio.current_task()

        try:
            print(f"\nUser [{lang_code}]: {text}")
            self.session_messages.append({"role": "user", "message": text})

            # Non-blocking async save to Redis
            if self.session_id:
                asyncio.create_task(
                    self.memory_service.save_message(self.session_id, "user", text)
                )

            ai_text = await self._process_stream(text, lang_code)

            if ai_text:
                self.session_messages.append({"role": "twin", "message": ai_text})
                if self.session_id:
                    asyncio.create_task(
                        self.memory_service.save_message(self.session_id, "twin", ai_text)
                    )

        except asyncio.CancelledError:
            print("[Engine] Pipeline cancelled by PTT interrupt.")
        except Exception as e:
            print(f"[Engine] Pipeline error: {e}")
        finally:
            async with self._lock:
                self._active_task = None