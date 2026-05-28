import asyncio
import re
import time
from services.memory_service import RedisMemoryService

class ConversationEngine:

    def __init__(self, stt, llm, tts):
        self.stt = stt
        self.llm = llm
        self.tts = tts

        self._active_task: asyncio.Task | None = None
        self._lock = asyncio.Lock()
        self.session_messages = []
        self.session_id = None
        self.memory_service = RedisMemoryService()

    def is_speaking(self) -> bool:
        """True if a pipeline task is currently running."""
        return (
            self._active_task is not None
            and not self._active_task.done()
        )

    async def barge_in(self):
        """
        Explicit PTT interrupt: called when user presses SPACEBAR.
        Cancels the active LLM/TTS pipeline and clears queued audio.
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

    async def _process_stream(self, text: str, lang_code: str = "en-IN"):
        buffer = ""
        full_ai_text = ""
        # ── Phase 3: Clause-level chunking ─────────────────────────────────
        # Flush on sentence-enders AND mid-sentence pauses (commas, dashes).
        # This sends shorter text to TTS much sooner.
        clause_pattern = re.compile(r'([.!?;:,\u2014—–-])')
        # Fallback: flush after N chars even without punctuation
        MAX_BUFFER_CHARS = 80

        _first_tts_send = None   # timestamp of first tts.speak() call
        _first_llm_token = None  # timestamp of first LLM token
        _pipeline_start = time.perf_counter()
        _chunks_sent = 0

        try:
            session_context = []
            if self.session_id:
                try:
                    session_context = await self.memory_service.fetch_session_context(self.session_id, limit=15)
                except Exception as e:
                    print(f"[Engine] Failed to fetch session context: {e}")

            # Fallback to local in-memory messages if Redis/DB returned nothing (e.g. Redis is down 
            # or it's a new session whose messages aren't saved/cached yet).
            # Note: self.session_messages[-1] is the current user text query we are processing now,
            # so we exclude it to only pass previous message history as context.
            if not session_context and self.session_messages:
                session_context = self.session_messages[:-1]

            # ── Parallel TTS connect + LLM start ──────────────────────────
            # Start ElevenLabs WS connect concurrently with LLM request.
            # Saves ~250ms.  Staleness guard: if LLM takes >3s we reconnect.
            llm_stream = self.llm.generate_stream(text, lang_code, session_context=session_context)
            tts_future = asyncio.ensure_future(self.tts.start_session())
            _tts_connect_time = time.perf_counter()

            print(f"Pratibimb (Streaming):", end=" ")

            async for chunk in llm_stream:
                # Record first LLM token time
                if _first_llm_token is None:
                    _first_llm_token = time.perf_counter()
                    print(f"\n[⏱ LLM first token: {(_first_llm_token - _pipeline_start)*1000:.0f}ms]")

                    # Ensure TTS session is ready
                    await tts_future

                    # Staleness guard: if LLM took >3s, WS was idle too long
                    idle_time = _first_llm_token - _tts_connect_time
                    if idle_time > 3.0:
                        print(f"[TTS] WS idle {idle_time:.1f}s — reconnecting fresh.")
                        await self.tts.cancel()
                        await self.tts.start_session()

                buffer += chunk
                full_ai_text += chunk
                print(chunk, end="", flush=True)

                # ── Clause-level flushing logic ────────────────────────────
                should_flush = False
                flush_text = ""

                # Split at FIRST punctuation — send shortest clause to TTS ASAP
                match = clause_pattern.search(buffer)
                if match:
                    split_idx = match.end()
                    flush_text = buffer[:split_idx].strip()
                    buffer = buffer[split_idx:]
                    should_flush = bool(flush_text)

                # Fallback: buffer too long without any punctuation
                elif len(buffer) >= MAX_BUFFER_CHARS:
                    # Find last space to avoid mid-word split
                    last_space = buffer.rfind(' ', 0, MAX_BUFFER_CHARS)
                    if last_space > 0:
                        flush_text = buffer[:last_space].strip()
                        buffer = buffer[last_space:]
                    else:
                        flush_text = buffer.strip()
                        buffer = ""
                    should_flush = bool(flush_text)

                if should_flush and flush_text:
                    if _first_tts_send is None:
                        _first_tts_send = time.perf_counter()
                        print(f"\n[⏱ First TTS send: {(_first_tts_send - _pipeline_start)*1000:.0f}ms]")
                    await self.tts.speak(flush_text)
                    _chunks_sent += 1

            # Flush remaining buffer
            if buffer.strip():
                await self.tts.speak(buffer.strip())
                _chunks_sent += 1

            await self.tts.flush()
            print()  # Newline

            # ── Phase 1: Timing summary ────────────────────────────────────
            _pipeline_end = time.perf_counter()
            total = (_pipeline_end - _pipeline_start) * 1000
            llm_latency = ((_first_llm_token - _pipeline_start) * 1000) if _first_llm_token else 0
            tts_latency = ((_first_tts_send - _pipeline_start) * 1000) if _first_tts_send else 0
            print(f"[⏱ Pipeline] total={total:.0f}ms | LLM-first-token={llm_latency:.0f}ms | first-TTS-send={tts_latency:.0f}ms | chunks={_chunks_sent}")
            
            return full_ai_text

        except asyncio.CancelledError:
            print("[Engine] Stream interrupted.")
            raise
        except Exception as e:
            print(f"[Engine] Pipeline error: {e}")

    async def handle_transcript(self, text: str, lang_code: str = "en-IN"):
        async with self._lock:
            # In PTT mode barge_in() is always called before this method,
            # so no concurrent pipeline should be running. Guard for safety.
            if self._active_task and not self._active_task.done():
                self._active_task.cancel()
                await self.tts.cancel()
            self._active_task = asyncio.current_task()

        try:
            print(f"\nUser [{lang_code}]: {text}")
            self.session_messages.append({"role": "user", "message": text})
            
            # Non-blocking async save of User message to Redis
            if self.session_id:
                asyncio.create_task(self.memory_service.save_message(self.session_id, "user", text))

            ai_text = await self._process_stream(text, lang_code)
            if ai_text:
                self.session_messages.append({"role": "twin", "message": ai_text})
                
                # Non-blocking async save of Twin response to Redis
                if self.session_id:
                    asyncio.create_task(self.memory_service.save_message(self.session_id, "twin", ai_text))

        except asyncio.CancelledError:
            print("[Engine] Pipeline cancelled by PTT interrupt.")
        except Exception as e:
            print(f"[Engine] Pipeline error: {e}")
        finally:
            async with self._lock:
                self._active_task = None