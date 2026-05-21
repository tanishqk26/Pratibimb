import asyncio
import re

class ConversationEngine:

    def __init__(self, stt, llm, tts):
        self.stt = stt
        self.llm = llm
        self.tts = tts

        self._active_task: asyncio.Task | None = None
        self._lock = asyncio.Lock()

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
        sentence_end_pattern = re.compile(r'([.!?;:])')

        try:
            # Open a fresh ElevenLabs WebSocket for this response
            await self.tts.start_session()

            print(f"Pratibimb (Streaming):", end=" ")
            async for chunk in self.llm.generate_stream(text, lang_code):
                buffer += chunk
                print(chunk, end="", flush=True)

                match = list(sentence_end_pattern.finditer(buffer))
                if match:
                    last_punct = match[-1]
                    split_idx = last_punct.end()
                    sentence = buffer[:split_idx].strip()
                    buffer = buffer[split_idx:]
                    
                    if sentence:
                        await self.tts.speak(sentence)
            
            # Flush remaining buffer
            if buffer.strip():
                await self.tts.speak(buffer.strip())
                
            await self.tts.flush()
            print() # Newline
            
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
            await self._process_stream(text, lang_code)

        except asyncio.CancelledError:
            print("[Engine] Pipeline cancelled by PTT interrupt.")
        except Exception as e:
            print(f"[Engine] Pipeline error: {e}")
        finally:
            async with self._lock:
                self._active_task = None