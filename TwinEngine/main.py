import asyncio
import os
import json
import base64
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
from sarvamai import AsyncSarvamAI

from stt.sarvam_stream import SarvamSTT
from llm.gemini_engine import GeminiEngine
from tts.eleven_ws import ElevenTTS
from engine.conversation_engine import ConversationEngine

load_dotenv()

SARVAM_API_KEY     = os.getenv("SARVAM_API_KEY")
GEMINI_API_KEY     = os.getenv("GEMINI_API_KEY")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")

app = FastAPI()

@app.websocket("/ws/voice")
async def voice_websocket(websocket: WebSocket):
    await websocket.accept()
    print("[Main] WebSocket connected.")

    client = AsyncSarvamAI(api_subscription_key=SARVAM_API_KEY)
    stt = SarvamSTT(client)
    await stt.connect()

    llm = GeminiEngine(GEMINI_API_KEY)
    tts = ElevenTTS(ELEVENLABS_API_KEY, websocket)
    engine = ConversationEngine(stt, llm, tts)

    # Push-to-talk state flag — True only while user holds SPACEBAR
    _recording = False
    # Accumulated final transcript for the current PTT press
    _transcript_parts: list[str] = []
    # Last detected BCP-47 language code from Sarvam STT
    _detected_lang: str = "en-IN"
    # Background task that collects STT partials while recording
    _stt_collector_task: asyncio.Task | None = None

    # ── Wait for twin_context handshake ──────────────────────────────────────
    try:
        first = await asyncio.wait_for(websocket.receive(), timeout=5.0)
        if "text" in first:
            msg = json.loads(first["text"])
            if msg.get("type") == "twin_context":
                twin = msg.get("twin", {})
                llm.set_twin(twin)
                print(f"[Main] Twin context loaded: {twin.get('name', 'Unknown')}")

                # Apply cloned voice if the twin has one stored
                voice_id = twin.get("voice_id") or ""
                print(f"[Main] Twin voice_id: '{voice_id or 'none — using default'}'")
                if voice_id:
                    tts.set_voice(voice_id)
                else:
                    print("[Main] No cloned voice_id found — using default ElevenLabs voice.")
    except asyncio.TimeoutError:
        print("[Main] No twin context received, using default persona.")
    except Exception as e:
        print(f"[Main] Error reading twin context: {e}")

    # ── STT collector — runs only during a PTT press ─────────────────────────
    async def stt_collector():
        """Collect STT transcripts while the user is holding SPACEBAR.
        Appends unique partial/final texts to _transcript_parts.
        Updates _detected_lang with the most recent detected language.
        Stops cleanly when cancelled (on SPACEBAR release).
        """
        nonlocal _transcript_parts, _detected_lang
        try:
            while True:
                text, lang = await stt.receive()
                if text:
                    # Avoid appending exact duplicate of the last part
                    if not _transcript_parts or _transcript_parts[-1] != text:
                        _transcript_parts.append(text)
                        print(f"[Main] STT partial [{lang}]: {text}")
                    # Always update to the most recently detected language
                    _detected_lang = lang
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[Main] STT collector error: {e}")

    # ── Main message loop ────────────────────────────────────────────────────
    try:
        while True:
            data = await websocket.receive()

            # ── Text control events ──────────────────────────────────────────
            if "text" in data:
                try:
                    msg = json.loads(data["text"])
                except Exception:
                    continue

                event_type = msg.get("type")

                # ── SPACEBAR pressed: explicit interrupt + start recording ──
                if event_type == "interrupt":
                    print("[Main] PTT interrupt received — cancelling AI pipeline.")
                    _recording = True
                    _transcript_parts = []

                    # Cancel any running LLM/TTS pipeline immediately
                    await engine.barge_in()

                    # Start collecting STT transcripts
                    if _stt_collector_task and not _stt_collector_task.done():
                        _stt_collector_task.cancel()
                    _stt_collector_task = asyncio.create_task(stt_collector())

                # ── SPACEBAR released: stop recording, run pipeline ─────────
                elif event_type == "speech_end":
                    print("[Main] PTT speech_end received — processing transcript.")
                    _recording = False

                    # Stop the STT collector
                    if _stt_collector_task and not _stt_collector_task.done():
                        _stt_collector_task.cancel()
                        try:
                            await _stt_collector_task
                        except asyncio.CancelledError:
                            pass
                    _stt_collector_task = None

                    # Merge all collected transcript parts into one utterance
                    full_text = " ".join(_transcript_parts).strip()
                    lang = _detected_lang
                    _transcript_parts = []

                    if full_text:
                        print(f"[Main] Final utterance [{lang}]: {full_text}")
                        asyncio.create_task(engine.handle_transcript(full_text, lang))
                    else:
                        print("[Main] No transcript captured — ignoring.")

            # ── Binary audio frames: only forward while recording ────────────
            elif "bytes" in data:
                if _recording:
                    audio_b64 = base64.b64encode(data["bytes"]).decode("utf-8")
                    await stt.send_audio(audio_b64)

    except WebSocketDisconnect:
        print("[Main] Client disconnected.")
    except RuntimeError as e:
        if "Cannot call" in str(e):
            print("[Main] Client disconnected gracefully.")
        else:
            print(f"[Main] WS error: {e}")
    except Exception as e:
        print(f"[Main] WS error: {e}")
    finally:
        if _stt_collector_task and not _stt_collector_task.done():
            _stt_collector_task.cancel()
        await stt.close()
        await tts.cancel()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)