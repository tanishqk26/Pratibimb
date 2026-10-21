// Centralized API endpoints. Override via Vite env vars at build time:
//   VITE_API_URL=https://your-api.onrender.com
//   VITE_WS_URL=wss://your-voice.onrender.com
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8001';

// Voice cloning requires a paid ElevenLabs plan. Set VITE_VOICE_CLONE_ENABLED=false
// in production to show a "paid feature — disabled in demo" banner instead.
export const VOICE_CLONE_ENABLED =
  (import.meta.env.VITE_VOICE_CLONE_ENABLED ?? 'true') !== 'false';
