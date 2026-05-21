import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'motion/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mic, X, History } from 'lucide-react';
import etherealFace from '../assets/images/ethereal_face.png';

export default function Voice() {
  const navigate = useNavigate();
  const location = useLocation();
  const twin = location.state?.twin || null;

  const [isListening, setIsListening] = useState(false);

  
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const scriptProcessorRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const playbackContextRef = useRef(null);
  const nextStartTimeRef = useRef(0);
  const isListeningRef = useRef(false);

  useEffect(() => {
    // Connect to FastAPI WebSocket Gateway
    wsRef.current = new WebSocket("ws://localhost:8001/ws/voice");

    wsRef.current.onopen = () => {
      console.log("WebSocket Connected");
      // Send the twin context immediately so backend can configure the prompt
      if (twin && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "twin_context", twin }));
      }
    };

    wsRef.current.onmessage = async (event) => {
      if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "interrupt") {
            if (playbackContextRef.current) {
              playbackContextRef.current.close();
              playbackContextRef.current = null;
            }
            nextStartTimeRef.current = 0;
          }
        } catch (e) {}
      } else {
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
    };
  }, []);

  const playPCMChunk = (arrayBuffer) => {
    if (!playbackContextRef.current || playbackContextRef.current.state === "closed") {
      playbackContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      nextStartTimeRef.current = playbackContextRef.current.currentTime;
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
    if (playbackContextRef.current) {
      try {
        playbackContextRef.current.close();
      } catch (_) {}
      playbackContextRef.current = null;
    }
    nextStartTimeRef.current = 0;
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

        {/* 1. Neural status chip */}
      
        {/* 2. Avatar + waveform overlay */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="relative group"
        >
          {/* Soft ambient blur behind avatar */}
          <div className={`absolute inset-0 rounded-full blur-3xl scale-110 transition-all duration-700 ${isListening ? 'bg-green-900/20' : 'bg-white/[0.03]'}`} />

          {/* Avatar ring */}
          <div className={`relative w-56 h-56 md:w-72 md:h-72 rounded-full border-2 p-1.5 transition-all duration-700
            ${isListening
              ? 'border-green-500/40 shadow-[0_0_48px_0px_rgba(34,197,94,0.15)]'
              : 'border-zinc-800 group-hover:border-zinc-600 shadow-[0_0_48px_0px_rgba(255,255,255,0.03)]'
            }`}
          >
            <img
              src={twin?.image_url || etherealFace}
              className={`w-full h-full object-cover rounded-full transition-all duration-700
                ${isListening ? 'grayscale-0 opacity-70' : 'grayscale opacity-35 group-hover:opacity-50'}`}
              alt={twin?.name || "AI Avatar"}
            />

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

        {/* 3. Heading */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-center space-y-2"
        >
          <h1 className="text-5xl md:text-6xl font-light tracking-tight text-white leading-tight">
            {twin?.name || 'Pratibimb'}
          </h1>

          {/* 4. Subtitle / profession */}
          <p className="text-sm uppercase tracking-[0.35em] text-zinc-500">
            {isListening
              ? 'Listening…'
              : twin?.profession || 'Digital Twin'}
          </p>
        </motion.div>

        {/* 5. Interaction hint */}
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

        {/* 6. Controls row */}
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
              onClick={() => navigate('/memory')}
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
