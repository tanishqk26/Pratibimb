import asyncio
import os
import time
import json
import base64
import uuid
import websockets
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
from sarvamai import AsyncSarvamAI

from stt.sarvam_stream import SarvamSTT
from llm.gemini_engine import GeminiEngine
from tts.eleven_ws import ElevenTTS
from engine.conversation_engine import ConversationEngine
from services.avatar import avatar_manager

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
    # STT connection is deferred until we have the twin context (for language filtering)

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

    # ── LiveAvatar state ─────────────────────────────────────────────────────
    twin_language_codes = None  # will hold parsed BCP-47 list
    twin_data = None
    avatar_ws = None            # WebSocket connection to LiveAvatar control channel
    avatar_session_id = None
    avatar_keepalive_task = None
    avatar_listener_task = None

    # ── Wait for twin_context handshake ──────────────────────────────────────
    try:
        first = await asyncio.wait_for(websocket.receive(), timeout=5.0)
        if "text" in first:
            msg = json.loads(first["text"])
            if msg.get("type") == "twin_context":
                twin = msg.get("twin", {})
                twin_data = twin
                llm.set_twin(twin)

                # Extract session_id or generate a new random UUID
                session_id = msg.get("session_id") or str(uuid.uuid4())
                engine.session_id = session_id
                print(f"[Main] Twin context loaded: {twin.get('name', 'Unknown')} (session_id={session_id})")

                # Apply cloned voice if the twin has one stored
                voice_id = twin.get("voice_id") or ""
                print(f"[Main] Twin voice_id: '{voice_id or 'none — using default'}'")
                if voice_id:
                    tts.set_voice(voice_id)
                else:
                    print("[Main] No cloned voice_id found — using default ElevenLabs voice.")

                # Parse language codes for STT filtering
                languages_str = twin.get("languages") or ""
                if languages_str.strip():
                    twin_language_codes = [c.strip() for c in languages_str.split(",") if c.strip()]
                    print(f"[Main] Twin languages: {twin_language_codes}")
                else:
                    print("[Main] No languages configured — STT will auto-detect all.")

                # ── LiveAvatar LITE Mode Session ──────────────────────────────────
                avatar_id = twin.get("avatar_id")
                if avatar_id:
                    try:
                        print(f"[Main] Starting LiveAvatar LITE session for avatar={avatar_id}")
                        session_data = await avatar_manager.create_session(avatar_id)
                        avatar_session_id    = session_data["session_id"]
                        livekit_url          = session_data["livekit_url"]
                        livekit_client_token = session_data["livekit_client_token"]
                        avatar_ws_url        = session_data.get("ws_url")

                        print(f"[Main] LiveAvatar session created: {avatar_session_id}")

                        # ── Open control WebSocket to LiveAvatar ──────────────
                        if avatar_ws_url:
                            avatar_ws = await websockets.connect(avatar_ws_url)
                            connected_event = asyncio.Event()

                            async def listen_avatar_events():
                                try:
                                    async for raw in avatar_ws:
                                        try:
                                            ev = json.loads(raw)
                                            t_now = int(time.time() * 1000)
                                            ev_type = ev.get("type") or ""
                                            print(f"[Main] LiveAvatar WS event: {ev_type} at {t_now} ms. Full event: {ev}")
                                            
                                            if ev_type == "session.state_updated" and ev.get("state") == "connected":
                                                connected_event.set()
                                            
                                            # Measure acknowledgement latency
                                            if getattr(tts, "expect_avatar_event", False):
                                                tts.expect_avatar_event = False
                                                print(f"[⏱ LATENCY] 4. First LiveAvatar acknowledgement/event '{ev_type}' at: {t_now} ms")

                                            # Log telemetry for speaking delay
                                            if ev_type == "agent.speak_started":
                                                fw_time = getattr(tts, "_first_chunk_forwarded_time", None)
                                                if fw_time:
                                                    tts._first_chunk_forwarded_time = None  # reset
                                                    delay = t_now - fw_time
                                                    print(f"[TELEMETRY] Avatar start delay: {delay} ms | session_id: {session_id} | twin_id: {twin_data.get('id') if twin_data else None}")
                                                    try:
                                                        await websocket.send_text(json.dumps({
                                                            "type": "telemetry",
                                                            "metric": "avatar_start_delay_ms",
                                                            "value": delay,
                                                            "session_id": session_id,
                                                            "twin_id": twin_data.get("id") if twin_data else None
                                                        }))
                                                    except Exception:
                                                        pass
                                        except Exception as parse_err:
                                            print(f"[Main] Error parsing LiveAvatar event: {parse_err}")
                                except Exception as ws_err:
                                    print(f"[Main] LiveAvatar WS read error/disconnect: {ws_err}")

                            # Start the listener task in the background
                            avatar_listener_task = asyncio.create_task(listen_avatar_events())

                            # Wait for session.state_updated → "connected"
                            await asyncio.wait_for(connected_event.wait(), timeout=15.0)
                            print("[Main] LiveAvatar WS state: connected ✓")

                            # Attach to TTS so every ElevenLabs chunk is forwarded as agent.speak
                            tts.set_avatar_ws(avatar_ws)

                            # Periodic keep-alive every 30 s to prevent 5-min idle timeout
                            async def _keepalive():
                                while True:
                                    await asyncio.sleep(30)
                                    try:
                                        if avatar_ws.open:
                                            await avatar_ws.send(json.dumps({
                                                "type": "session.keep_alive",
                                                "event_id": str(uuid.uuid4())
                                            }))
                                    except Exception:
                                        break

                            avatar_keepalive_task = asyncio.create_task(_keepalive())

                        # Send LiveKit room credentials to frontend so it can connect
                        await websocket.send_text(json.dumps({
                            "type": "avatar_session",
                            "session_id":           avatar_session_id,
                            "livekit_url":          livekit_url,
                            "livekit_client_token": livekit_client_token,
                        }))

                    except Exception as ae:
                        print(f"[Main] LiveAvatar session failed (will continue voice-only): {ae}")

    except asyncio.TimeoutError:
        print("[Main] No twin context received, using default persona.")
    except Exception as e:
        print(f"[Main] Error reading twin context: {e}")

    # Connect STT with the twin's language filter (or auto-detect if none set)
    await stt.connect(language_codes=twin_language_codes)

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

                    # Interrupt avatar speaking
                    if avatar_ws:
                        try:
                            await avatar_ws.send(json.dumps({"type": "agent.interrupt"}))
                            await avatar_ws.send(json.dumps({
                                "type": "agent.start_listening",
                                "event_id": str(uuid.uuid4())
                            }))
                        except Exception:
                            pass

                    # Start collecting STT transcripts
                    if _stt_collector_task and not _stt_collector_task.done():
                        _stt_collector_task.cancel()
                    _stt_collector_task = asyncio.create_task(stt_collector())

                # ── SPACEBAR released: stop recording, run pipeline ─────────
                elif event_type == "speech_end":
                    print("[Main] PTT speech_end received — processing transcript.")
                    _recording = False

                    # Transition avatar out of listening pose
                    if avatar_ws:
                        try:
                            await avatar_ws.send(json.dumps({
                                "type": "agent.stop_listening",
                                "event_id": str(uuid.uuid4())
                            }))
                        except Exception:
                            pass

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

        # Tear down LiveAvatar session
        if avatar_keepalive_task and not avatar_keepalive_task.done():
            avatar_keepalive_task.cancel()
        if avatar_listener_task and not avatar_listener_task.done():
            avatar_listener_task.cancel()
        if avatar_ws:
            try:
                await avatar_ws.close()
            except Exception:
                pass
        if avatar_session_id:
            try:
                asyncio.create_task(avatar_manager.stop_session(avatar_session_id))
            except Exception:
                pass

        # Save session if there are messages
        if engine.session_messages and twin_data and twin_data.get("id"):
            try:
                import httpx
                async with httpx.AsyncClient() as client:
                    payload = {
                        "messages": engine.session_messages,
                        "user_id": twin_data.get("user_id")
                    }
                    await client.post(
                        f"http://localhost:8000/conversations/internal/twin/{twin_data.get('id')}",
                        json=payload
                    )
                    print(f"[Main] Conversation session saved with {len(engine.session_messages)} messages.")
            except Exception as e:
                print(f"[Main] Error saving conversation session: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)