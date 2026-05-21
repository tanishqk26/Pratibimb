import asyncio
import json
import base64
import websockets

# ElevenLabs default multilingual voice (George) – used as fallback when the
# twin has no cloned voice_id yet.
DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"


class ElevenTTS:
    def __init__(self, api_key: str, ws_client, voice_id: str = DEFAULT_VOICE_ID):
        self.api_key  = api_key
        self.ws_client = ws_client
        self.voice_id  = voice_id

        # Per-session state (reset on every new TTS session)
        self._ws          = None   # active ElevenLabs WS
        self._recv_task   = None   # background audio-receiver coroutine
        self._cancelled   = False  # interrupt flag

    # ── Voice configuration ───────────────────────────────────────────────────

    def set_voice(self, voice_id: str):
        """Switch to a cloned voice. Call before start_session()."""
        if voice_id:
            self.voice_id = voice_id
            print(f"[TTS] Voice set to cloned voice: {voice_id}")

    # ── Internal helpers ────────────────────────────────────────────────────

    async def _open(self):
        """Open a fresh ElevenLabs WebSocket and send the BOS handshake."""
        url = (
            f"wss://api.elevenlabs.io/v1/text-to-speech/{self.voice_id}/stream-input"
            f"?model_id=eleven_multilingual_v2&output_format=pcm_16000"
        )
        self._ws = await websockets.connect(
            url,
            additional_headers={"xi-api-key": self.api_key}
        )

        bos = {
            "text": " ",
            "voice_settings": {
                "stability": 0.45,
                "similarity_boost": 0.85,
                "style": 0.15,
                "use_speaker_boost": True
            },
            "generation_config": {
                "chunk_length_schedule": [120, 160, 250, 290]
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

    async def _receive_audio(self):
        """Receive PCM audio chunks from ElevenLabs and forward to the browser."""
        try:
            async for message in self._ws:
                if self._cancelled:
                    break
                data = json.loads(message)
                if data.get("audio"):
                    chunk = base64.b64decode(data["audio"])
                    try:
                        await self.ws_client.send_bytes(chunk)
                    except Exception:
                        break  # browser disconnected
                if data.get("isFinal"):
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
        await self._open()
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