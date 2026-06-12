import asyncio
import json
import base64
import time
import uuid
import array
import websockets

# ElevenLabs default multilingual voice (George) – used as fallback when the
# twin has no cloned voice_id yet.
DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"


def _resample_16k_to_24k(pcm_bytes: bytes) -> bytes:
    """
    Resample PCM 16-bit mono from 16 kHz to 24 kHz via linear interpolation.
    Pure Python — no numpy required.
    Ratio is exactly 3:2, so for n input samples → (n*3)//2 output samples.
    """
    samples_in = array.array('h', pcm_bytes)
    n_in = len(samples_in)
    n_out = (n_in * 3) // 2
    out = array.array('h', [0] * n_out)
    for i in range(n_out):
        src = i * 2.0 / 3.0
        idx = int(src)
        frac = src - idx
        if idx + 1 < n_in:
            val = int(samples_in[idx] * (1.0 - frac) + samples_in[idx + 1] * frac)
        else:
            val = samples_in[min(idx, n_in - 1)]
        out[i] = max(-32768, min(32767, val))
    return bytes(out)


class ElevenTTS:
    def __init__(self, api_key: str, ws_client, voice_id: str = DEFAULT_VOICE_ID):
        self.api_key  = api_key
        self.ws_client = ws_client
        self.voice_id  = voice_id

        # Per-session state (reset on every new TTS session)
        self._ws          = None   # active ElevenLabs WS
        self._recv_task   = None   # background audio-receiver coroutine
        self._cancelled   = False  # interrupt flag

        # LiveAvatar control WebSocket (set by main.py after session creation)
        self._avatar_ws   = None

        # ── Phase 1: Instrumentation ──────────────────────────────────────
        self._session_start = None  # when start_session() was called
        self._first_audio   = None  # when first audio byte arrived from ElevenLabs

    # ── Voice configuration ───────────────────────────────────────────────────

    def set_voice(self, voice_id: str):
        """Switch to a cloned voice. Call before start_session()."""
        if voice_id:
            self.voice_id = voice_id
            print(f"[TTS] Voice set to cloned voice: {voice_id}")

    def set_avatar_ws(self, ws):
        """Attach the LiveAvatar control WebSocket for audio forwarding."""
        self._avatar_ws = ws

    # ── Internal helpers ────────────────────────────────────────────────────

    async def _open(self):
        """Open a fresh ElevenLabs WebSocket and send the BOS handshake."""
        url = (
            f"wss://api.elevenlabs.io/v1/text-to-speech/{self.voice_id}/stream-input"
            f"?model_id=eleven_turbo_v2_5&output_format=pcm_16000"
        )
        self._ws = await websockets.connect(
            url,
            additional_headers={"xi-api-key": self.api_key}
        )

        # ── Phase 4: Aggressive chunk schedule ────────────────────────────
        # BEFORE: [120, 160, 250, 290] — waits for 120 chars before first audio.
        # AFTER:  [50, 90, 120, 150]   — starts generating at 50 chars.
        # This alone cuts ~200-400ms from first-audio latency.
        bos = {
            "text": " ",
            "voice_settings": {
                "stability": 0.45,
                "similarity_boost": 0.85,
                "style": 0.15,
                "use_speaker_boost": True
            },
            "generation_config": {
                "chunk_length_schedule": [50, 90, 120, 150]
            }
        }
        await self._ws.send(json.dumps(bos))

    async def _close(self):
        """Cleanly close ElevenLabs WS and cancel the receiver task."""
        if self._recv_task and not self._recv_task.done():
            self._recv_task.cancel()
            try:
                await self._recv_task
            except (asyncio.CancelledError, Exception):
                pass
        self._recv_task = None

        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
        self._ws = None

    async def _send_avatar_speak(self, pcm_16k: bytes, is_first: bool = False):
        """Resample to 24 kHz and forward as agent.speak to LiveAvatar."""
        if not self._avatar_ws:
            return
        try:
            if is_first:
                t_resample_start = int(time.time() * 1000)
            pcm_24k = _resample_16k_to_24k(pcm_16k)
            encoded = base64.b64encode(pcm_24k).decode("utf-8")
            if is_first:
                t_resample_end = int(time.time() * 1000)
                print(f"[⏱ LATENCY] Resampling and Base64 encoding took: {t_resample_end - t_resample_start} ms")
            
            await self._avatar_ws.send(json.dumps({
                "type": "agent.speak",
                "audio": encoded
            }))
            if is_first:
                t3 = int(time.time() * 1000)
                self._first_chunk_forwarded_time = t3
                print(f"[⏱ LATENCY] 3. First audio chunk forwarded to LiveAvatar at: {t3} ms")
                self.expect_avatar_event = True
        except Exception as e:
            # Don't let avatar errors affect the main audio pipeline
            print(f"[TTS] Avatar speak forward error: {e}")

    async def _receive_audio(self):
        """Receive PCM audio chunks from ElevenLabs and forward to the browser."""
        speak_event_id = str(uuid.uuid4())
        try:
            async for message in self._ws:
                if self._cancelled:
                    break
                data = json.loads(message)
                if data.get("audio"):
                    chunk = base64.b64decode(data["audio"])

                    is_first = False
                    if self._is_first_chunk_of_turn:
                        self._is_first_chunk_of_turn = False
                        is_first = True
                        t1 = int(time.time() * 1000)
                        print(f"[⏱ LATENCY] 1. ElevenLabs first audio chunk received at: {t1} ms")

                    try:
                        await self.ws_client.send_bytes(chunk)
                        if is_first:
                            t2 = int(time.time() * 1000)
                            print(f"[⏱ LATENCY] 2. First audio chunk sent to browser at: {t2} ms")
                    except Exception:
                        break  # browser disconnected

                    # Forward to LiveAvatar (fire-and-forget, non-blocking)
                    if self._avatar_ws:
                        asyncio.create_task(self._send_avatar_speak(chunk, is_first))

                if data.get("isFinal"):
                    # Signal end of this speaking turn to LiveAvatar
                    if self._avatar_ws:
                        try:
                            await self._avatar_ws.send(json.dumps({
                                "type": "agent.speak_end",
                                "event_id": speak_event_id
                            }))
                        except Exception:
                            pass
                    break
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[TTS] Receive error: {e}")

    # ── Public API ───────────────────────────────────────────────────────────

    async def speak(self, text: str):
        """Send a text chunk to the current TTS session."""
        if self._cancelled or self._ws is None:
            return
        try:
            payload = {"text": text + " ", "try_trigger_generation": True}
            await self._ws.send(json.dumps(payload))
        except Exception as e:
            print(f"[TTS] Send error: {e}")

    async def start_session(self):
        """Open a fresh ElevenLabs connection and start receiving audio."""
        self._cancelled = False
        self._first_audio = None
        self._is_first_chunk_of_turn = True
        self.expect_avatar_event = False
        self._first_chunk_forwarded_time = None
        self._session_start = time.perf_counter()
        await self._open()
        _open_done = time.perf_counter()
        print(f"[⏱ TTS] WebSocket connect: {(_open_done - self._session_start)*1000:.0f}ms")
        self._recv_task = asyncio.create_task(self._receive_audio())

    async def flush(self):
        """Signal EOS to ElevenLabs and wait for all audio to be received."""
        if self._ws is None:
            return
        try:
            await self._ws.send(json.dumps({"text": ""}))  # EOS
            if self._recv_task:
                await self._recv_task   # wait for isFinal
        except Exception:
            pass
        await self._close()

    async def cancel(self):
        """Interrupt: immediately stop generating and playing audio."""
        self._cancelled = True
        await self._close()

        # Tell the browser to flush its playback queue
        try:
            await self.ws_client.send_text(json.dumps({"type": "interrupt"}))
        except Exception:
            pass