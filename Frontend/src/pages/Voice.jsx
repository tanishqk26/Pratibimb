import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mic, X, History } from 'lucide-react';
import { Room, RoomEvent, Track } from 'livekit-client';
import etherealFace from '../assets/images/ethereal_face.png';

export default function Voice() {
  const navigate = useNavigate();
  const location = useLocation();
  const [twin, setTwin] = useState(location.state?.twin || null);
  const [isReady, setIsReady] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // LiveAvatar WebRTC state
  const [avatarConnected, setAvatarConnected] = useState(false);  // LiveKit room is connected
  const [avatarVideoReady, setAvatarVideoReady] = useState(false); // Remote video track is subscribed

  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const scriptProcessorRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const playbackContextRef = useRef(null);
  const nextStartTimeRef = useRef(0);
  const isListeningRef = useRef(false);
  const scheduledSourcesRef = useRef([]);  // track active BufferSources for interrupt

  // LiveKit references
  const livekitRoomRef = useRef(null);  // Room instance
  const videoRef = useRef(null);         // <video> element for avatar stream

  const sessionIdRef = useRef(
    location.state?.sessionId ||
    (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15))
  );

  // ── Fetch latest twin data (including avatar_id) before starting ──────────
  useEffect(() => {
    const fetchLatestTwin = async () => {
      const initialTwin = location.state?.twin;
      if (!initialTwin?.id) {
        setIsReady(true);
        return;
      }
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setIsReady(true);
          return;
        }
        const res = await fetch(`http://localhost:8000/twins/${initialTwin.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const latestTwin = await res.json();
          setTwin(latestTwin);
        }
      } catch (e) {
        console.error("Error fetching latest twin:", e);
      } finally {
        setIsReady(true);
      }
    };
    fetchLatestTwin();
  }, [location.state?.twin?.id]);

  // ── Connect LiveKit room when we receive avatar session credentials ────────
  const connectLiveKit = useCallback(async (livekit_url, livekit_client_token) => {
    if (!livekit_url || !livekit_client_token) return;

    // Disconnect any existing room
    if (livekitRoomRef.current) {
      try { await livekitRoomRef.current.disconnect(); } catch (_) {}
      livekitRoomRef.current = null;
    }

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });
    livekitRoomRef.current = room;

    // ── Subscribe to incoming video/audio tracks from avatar ───────────────
    room.on(RoomEvent.TrackSubscribed, (track, _publication, _participant) => {
      console.log('[LiveKit] Track subscribed:', track.kind);
      if (track.kind === Track.Kind.Video && videoRef.current) {
        track.attach(videoRef.current);
        setAvatarVideoReady(true);
        console.log('[LiveKit] Avatar video track attached to <video> element ✓');
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind === Track.Kind.Video) {
        track.detach();
        setAvatarVideoReady(false);
      }
    });

    room.on(RoomEvent.Disconnected, () => {
      console.log('[LiveKit] Room disconnected.');
      setAvatarConnected(false);
      setAvatarVideoReady(false);
    });

    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      console.log('[LiveKit] Connection state:', state);
    });

    try {
      await room.connect(livekit_url, livekit_client_token);
      setAvatarConnected(true);
      console.log('[LiveKit] Room connected ✓');

      // Attach any already-subscribed tracks (e.g. avatar appeared before we connected)
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.trackPublications.values()) {
          if (publication.track && publication.track.kind === Track.Kind.Video && videoRef.current) {
            publication.track.attach(videoRef.current);
            setAvatarVideoReady(true);
          }
        }
      }
    } catch (err) {
      console.error('[LiveKit] Failed to connect:', err);
      setAvatarConnected(false);
    }
  }, []);

  // ── Main WebSocket + audio pipeline ──────────────────────────────────────
  useEffect(() => {
    if (!isReady) return;

    // Connect to FastAPI WebSocket Gateway
    wsRef.current = new WebSocket("ws://localhost:8001/ws/voice");

    wsRef.current.onopen = () => {
      console.log("WebSocket Connected");
      // Send the twin context immediately so backend can configure the prompt
      if (twin && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "twin_context",
          twin,
          session_id: sessionIdRef.current
        }));
      }
    };

    wsRef.current.onmessage = async (event) => {
      if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === "interrupt") {
            // Cancel all scheduled audio sources without destroying the context
            scheduledSourcesRef.current.forEach(s => { try { s.stop(); } catch(_){} });
            scheduledSourcesRef.current = [];
            if (playbackContextRef.current && playbackContextRef.current.state !== "closed") {
              nextStartTimeRef.current = playbackContextRef.current.currentTime;
            } else {
              nextStartTimeRef.current = 0;
            }

          } else if (msg.type === "avatar_session") {
            // Backend has started a LiveAvatar session and is sending LiveKit credentials
            console.log("[Voice] Avatar session received:", {
              session_id: msg.session_id,
              livekit_url: msg.livekit_url,
            });
            // Connect to LiveKit to receive the avatar video stream
            await connectLiveKit(msg.livekit_url, msg.livekit_client_token);
          } else if (msg.type === "telemetry") {
            console.log(`[TELEMETRY] Measured ${msg.metric}: ${msg.value} ms (Session: ${msg.session_id})`);
          }
        } catch (e) {
          console.error("[Voice] Message parse error:", e);
        }
      } else {
        // Binary data = PCM audio from ElevenLabs — play it in browser
        const arrayBuffer = await event.data.arrayBuffer();
        playPCMChunk(arrayBuffer);
      }
    };

    return () => {
      if (wsRef.current) wsRef.current.close();
      stopRecording();
      if (playbackContextRef.current) {
        playbackContextRef.current.close();
      }
      // Disconnect LiveKit room
      if (livekitRoomRef.current) {
        livekitRoomRef.current.disconnect().catch(() => {});
        livekitRoomRef.current = null;
      }
    };
  }, [isReady, connectLiveKit]);

  const playPCMChunk = (arrayBuffer) => {
    if (!window._firstAudioPlayedLogged) {
      window._firstAudioPlayedLogged = true;
      console.log(`[⏱ LATENCY] 2. First audio chunk received/played in browser at: ${Date.now()} ms`);
    }
    // Reuse existing AudioContext — only create if truly missing
    if (!playbackContextRef.current || playbackContextRef.current.state === "closed") {
      playbackContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      nextStartTimeRef.current = playbackContextRef.current.currentTime;
    }
    // Resume if suspended (e.g. browser autoplay policy)
    if (playbackContextRef.current.state === "suspended") {
      playbackContextRef.current.resume();
    }

    const int16Array = new Int16Array(arrayBuffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    const audioBuffer = playbackContextRef.current.createBuffer(1, float32Array.length, 16000);
    audioBuffer.getChannelData(0).set(float32Array);

    const source = playbackContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(playbackContextRef.current.destination);

    const startTime = Math.max(playbackContextRef.current.currentTime, nextStartTimeRef.current);
    source.start(startTime);
    nextStartTimeRef.current = startTime + audioBuffer.duration;

    // Track source for interrupt cancellation; auto-remove when finished
    scheduledSourcesRef.current.push(source);
    source.onended = () => {
      scheduledSourcesRef.current = scheduledSourcesRef.current.filter(s => s !== source);
    };
  };

  const startRecording = async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });

      const source = audioContextRef.current.createMediaStreamSource(stream);
      scriptProcessorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);

      scriptProcessorRef.current.onaudioprocess = (e) => {
        if (!isListeningRef.current) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
        }

        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(pcm16.buffer);
        }
      };

      source.connect(scriptProcessorRef.current);
      scriptProcessorRef.current.connect(audioContextRef.current.destination);
    } catch (err) {
      console.error("Mic error:", err);
    }
  };

  const stopRecording = () => {
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  // ── Stop all currently queued TTS playback immediately ──────────────────
  const stopPlayback = () => {
    window._firstAudioPlayedLogged = false;
    window._firstFrameLogged = false;
    scheduledSourcesRef.current.forEach(s => { try { s.stop(); } catch(_){} });
    scheduledSourcesRef.current = [];
    if (playbackContextRef.current && playbackContextRef.current.state !== "closed") {
      nextStartTimeRef.current = playbackContextRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
  };

  useEffect(() => {
    let spacePressed = false;

    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !spacePressed) {
        spacePressed = true;

        // 1. Kill any playing AI audio immediately
        stopPlayback();

        // 2. Notify backend — cancel current LLM/TTS pipeline
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'interrupt' }));
        }

        // 3. Start recording
        setIsListening(true);
        isListeningRef.current = true;
        startRecording();
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        spacePressed = false;

        // 1. Stop recording
        setIsListening(false);
        isListeningRef.current = false;
        stopRecording();

        // 2. Signal backend: user finished speaking — trigger pipeline
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'speech_end' }));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center overflow-hidden"
    >
      {/* ── Ambient radial glow ── */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06),transparent_55%)]" />

      {/* ── Outer pulsing ring while listening ── */}
      {isListening && (
        <motion.div
          className="absolute rounded-full border border-green-500/20"
          initial={{ width: 320, height: 320, opacity: 0.6 }}
          animate={{ width: 500, height: 500, opacity: 0 }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
        />
      )}

      {/* ── Main centered stack ── */}
      <div className="relative z-10 flex flex-col items-center gap-6">

        {/* Avatar + waveform overlay */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="relative group"
        >
          {/* Soft ambient blur behind avatar */}
          <div className={`absolute inset-0 rounded-full blur-3xl scale-110 transition-all duration-700 ${isListening ? 'bg-green-900/20' : 'bg-white/[0.03]'}`} />

          {/* Avatar ring */}
          <div className={`relative w-56 h-56 md:w-72 md:h-72 rounded-full border-2 p-1.5 transition-all duration-700 overflow-hidden
            ${isListening
              ? 'border-green-500/40 shadow-[0_0_48px_0px_rgba(34,197,94,0.15)]'
              : 'border-zinc-800 group-hover:border-zinc-600 shadow-[0_0_48px_0px_rgba(255,255,255,0.03)]'
            }`}
          >
            <style>{`
              @keyframes spin-slow {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
              .animate-spin-slow {
                animation: spin-slow 20s linear infinite;
              }
            `}</style>

            <div className="w-full h-full rounded-full overflow-hidden relative bg-zinc-950">

              {/* ── LiveAvatar WebRTC video element ──────────────────────── */}
              {/* Always rendered in DOM; only visible when avatar is connected */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={false}
                onPlay={() => {
                  console.log(`[⏱ LATENCY] Video playing event fired at: ${Date.now()} ms`);
                }}
                onPlaying={() => {
                  console.log(`[⏱ LATENCY] Video playing (onplaying) at: ${Date.now()} ms`);
                }}
                onLoadedData={() => {
                  console.log(`[⏱ LATENCY] Video loaded data (first frame) at: ${Date.now()} ms`);
                }}
                onTimeUpdate={() => {
                  if (videoRef.current && videoRef.current.currentTime > 0) {
                    if (!window._firstFrameLogged) {
                      window._firstFrameLogged = true;
                      console.log(`[⏱ LATENCY] 5. First avatar video frame rendered (timeupdate > 0) at: ${Date.now()} ms`);
                    }
                  }
                }}
                className={`absolute inset-0 w-full h-full object-cover rounded-full transition-opacity duration-700 ${
                  avatarVideoReady ? 'opacity-100' : 'opacity-0'
                }`}
              />

              {/* ── Fallback: twin image (shown when no live video track) ── */}
              {!avatarVideoReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <img
                    src={twin?.image_url || etherealFace}
                    className={`w-full h-full object-cover rounded-full transition-all duration-700
                      ${isListening ? 'grayscale-0 opacity-70 scale-105' : 'grayscale opacity-35'}`}
                    alt={twin?.name || "AI Avatar"}
                  />

                  {/* Spinning dashed ring — shown only when LiveKit room is connecting */}
                  {avatarConnected && !avatarVideoReady && (
                    <div className="absolute inset-4 rounded-full border-2 border-dashed border-emerald-500/20 animate-spin-slow pointer-events-none" />
                  )}

                  {/* "Live Sync Active" badge — shown when room is connected but waiting for track */}
                  {avatarConnected && !avatarVideoReady && !isListening && (
                    <div className="absolute bottom-6 flex items-center justify-center gap-1.5 bg-black/50 px-3 py-1.5 rounded-full border border-emerald-500/20 backdrop-blur-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                      <span className="text-[10px] text-emerald-400 font-mono tracking-wider uppercase">Avatar Connecting…</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Waveform overlay — centered on avatar */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center gap-1"
              animate={{ opacity: isListening ? 0.7 : 0.2 }}
              transition={{ duration: 0.4 }}
            >
              {[5, 10, 7, 14, 5, 9, 12, 6].map((h, i) => (
                <motion.div
                  key={i}
                  animate={{
                    height: isListening
                      ? [`${h * 3}px`, `${h * 7}px`, `${h * 3}px`]
                      : [`${h * 2}px`, `${h * 4}px`, `${h * 2}px`]
                  }}
                  transition={{ repeat: Infinity, duration: isListening ? 0.6 : 1.4, delay: i * 0.08, ease: "easeInOut" }}
                  className={`w-0.5 rounded-full ${isListening ? 'bg-green-400' : 'bg-white/60'}`}
                />
              ))}
            </motion.div>
          </div>
        </motion.div>

        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-center space-y-2"
        >
          <h1 className="text-5xl md:text-6xl font-light tracking-tight text-white leading-tight">
            {twin?.name || 'Pratibimb'}
          </h1>

          {/* Subtitle / profession */}
          <p className="text-sm uppercase tracking-[0.35em] text-zinc-500">
            {isListening
              ? 'Listening…'
              : twin?.profession || 'Digital Twin'}
          </p>
        </motion.div>

        {/* Interaction hint */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
          className="text-zinc-400 text-sm text-center mt-1 max-w-xs leading-relaxed"
        >
          {isListening
            ? 'Release space when done speaking.'
            : 'Hold Spacebar to speak with your twin.'}
        </motion.p>

        {/* Controls row */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="flex items-center justify-center gap-6 mt-10"
        >
          {/* Mic button */}
          <div className="flex flex-col items-center gap-2">
            <button
              className={`w-16 h-16 rounded-full border flex items-center justify-center backdrop-blur-md transition-all duration-300 hover:scale-105
                ${isListening
                  ? 'border-green-500/60 bg-green-500/10 text-green-400 shadow-[0_0_20px_rgba(34,197,94,0.2)]'
                  : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-600 hover:text-white'
                }`}
            >
              <Mic size={20} />
            </button>
            <span className="text-[10px] uppercase tracking-widest text-zinc-600">
              {isListening ? 'Active' : 'Space'}
            </span>
          </div>

          {/* End session */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => navigate('/twins')}
              className="w-16 h-16 rounded-full border border-zinc-800 bg-zinc-950/60 text-zinc-400 flex items-center justify-center backdrop-blur-md hover:border-red-500/50 hover:text-red-400 hover:scale-105 transition-all duration-300"
            >
              <X size={20} />
            </button>
            <span className="text-[10px] uppercase tracking-widest text-zinc-600">End</span>
          </div>

          {/* History */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => navigate('/twins')}
              className="w-16 h-16 rounded-full border border-zinc-800 bg-zinc-950/60 text-zinc-400 flex items-center justify-center backdrop-blur-md hover:border-zinc-600 hover:text-white hover:scale-105 transition-all duration-300"
            >
              <History size={20} />
            </button>
            <span className="text-[10px] uppercase tracking-widest text-zinc-600">History</span>
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
}
