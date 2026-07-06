<div align="center">

# 🪞 Pratibimb

### *Your AI-Powered Digital Twin*

**Create, train, and converse with a lifelike AI replica of yourself — powered by real-time voice, memory-aware intelligence, and animated avatars.**

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Google Gemini](https://img.shields.io/badge/Gemini-AI-4285F4?style=flat-square&logo=google&logoColor=white)](https://ai.google.dev/)
[![ElevenLabs](https://img.shields.io/badge/ElevenLabs-TTS-000000?style=flat-square)](https://elevenlabs.io/)
[![Sarvam AI](https://img.shields.io/badge/Sarvam-STT-FF5722?style=flat-square)](https://www.sarvam.ai/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

---

</div>

## 📖 What is Pratibimb?

**Pratibimb** (Hindi: *प्रतिबिम्ब* — "reflection") is a full-stack AI digital twin platform that lets you build a personalized AI alter-ego that **thinks, speaks, and remembers like you**.

Feed it memories. Give it your voice. Watch it come alive.

> *"A clinical-precision reflection of your digital existence — engineered for intelligence, order, and effortless control."*

---

## ✨ Key Features

| Feature | Description |
|---|---|
| 🎙️ **Real-Time Voice Conversation** | Push-to-talk pipeline — speak to your twin, hear it respond in milliseconds |
| 🧠 **RAG-Powered Memory** | Semantic vector search (cosine similarity) retrieves the most relevant memories per query |
| 🗣️ **Voice Cloning** | Upload voice samples → ElevenLabs clones your voice → twin speaks in *your* voice |
| 🌐 **Multilingual (11 Indian Languages)** | Sarvam AI STT + Gemini LLM detect and respond in Hindi, Marathi, Tamil, Telugu, Kannada, Malayalam, Gujarati, Punjabi, Bengali, Odia & English |
| 🎭 **Animated Live Avatar** | Real-time animated avatar via LiveAvatar provider with WebSocket control |
| 💬 **Persistent Chat History** | Full conversation history across sessions — twin remembers what you discussed |
| 🔐 **Secure Auth** | JWT-based authentication with bcrypt password hashing |
| 🗂️ **Memory Manager** | Add, edit, search, and delete memories from a rich dashboard UI |

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   FRONTEND  (React 19 + Vite)               │
│   Landing → Auth → Dashboard → Twin Workspace → Memories    │
│           TailwindCSS  ·  Framer Motion  ·  Lucide Icons    │
└───────────────────────┬─────────────────────────────────────┘
                        │  REST API + WebSocket
┌───────────────────────▼─────────────────────────────────────┐
│           BACKEND — Pratibimb REST API (FastAPI)             │
│                                                             │
│   /auth  /twins  /memories  /voice  /conversations           │
│   SQLAlchemy ORM  ·  SQLite  ·  JWT Auth                    │
│   Gemini Embeddings  ·  Cosine-Similarity Vector Store      │
└───────────────────────┬─────────────────────────────────────┘
                        │  Shared DB + WebSocket
┌───────────────────────▼─────────────────────────────────────┐
│           TWIN ENGINE — Real-Time Voice Pipeline             │
│                                                             │
│  Mic Input                                                  │
│    └──▶  Sarvam STT  (streaming speech-to-text)             │
│              └──▶  RAG Memory Retriever (cosine sim)        │
│                        └──▶  Gemini LLM  (contextual)       │
│                                  └──▶  ElevenLabs TTS       │
│                                            └──▶  Speaker    │
│                                                             │
│  LiveAvatar ◀── WebSocket ── Avatar Manager                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

### Backend
| Layer | Technology |
|---|---|
| API Framework | FastAPI + Uvicorn |
| ORM / Database | SQLAlchemy + SQLite |
| Authentication | JWT (`python-jose`) + bcrypt (`passlib`) |
| LLM | Google Gemini (`google-genai`) |
| Speech-to-Text | Sarvam AI — 11 Indian languages, streaming |
| Text-to-Speech | ElevenLabs WebSocket streaming |
| Embeddings | Google Gemini Text Embeddings |
| Vector Search | Custom cosine similarity over SQLite vectors |
| Avatar | LiveAvatar WebSocket provider |
| Validation | Pydantic v2 |

### Frontend
| Layer | Technology |
|---|---|
| Framework | React 19 |
| Build Tool | Vite 7 |
| Routing | React Router DOM v7 |
| Animations | Framer Motion (`motion`) |
| Icons | Lucide React |
| Styling | TailwindCSS v4 |

---

## 📁 Project Structure

```
Pratibimb/
├── Frontend/                          # React 19 + Vite SPA
│   └── src/
│       ├── pages/
│       │   ├── Landing.jsx            # Hero + features landing page
│       │   ├── Auth.jsx               # Login / Sign up
│       │   ├── Dashboard.jsx          # Twin overview dashboard
│       │   ├── Twins.jsx              # Manage all twins
│       │   ├── TwinWorkspace.jsx      # Chat + Memories + Profile + Settings
│       │   ├── Memory.jsx             # Memory management UI
│       │   ├── Voice.jsx              # Voice cloning & audio upload
│       │   └── Profile.jsx            # User profile
│       ├── Components/                # Reusable UI components
│       └── routes/                    # App routing
│
└── TwinEngine/                        # Python AI engine (monorepo)
    ├── Backend/                       # Pratibimb REST API
    │   ├── main.py                    # FastAPI app entry point
    │   ├── api/                       # Route handlers
    │   │   ├── auth.py                # /auth/* endpoints
    │   │   ├── twins.py               # /twins/* CRUD
    │   │   ├── memories.py            # /memories/* + embeddings
    │   │   ├── conversations.py       # /conversations/*
    │   │   └── voice.py               # /voice/* + ElevenLabs clone
    │   ├── core/                      # Config, security, DI
    │   ├── database/                  # SQLAlchemy ORM models + engine
    │   ├── schemas/                   # Pydantic request/response models
    │   ├── services/
    │   │   ├── memory_service.py      # Memory CRUD + embedding pipeline
    │   │   ├── vector_service.py      # Cosine similarity vector search
    │   │   ├── embedding_service.py   # Gemini embedding wrapper
    │   │   └── avatar/                # LiveAvatar provider integration
    │   └── utils/                     # Logger, helpers
    │
    ├── main.py                        # WebSocket voice pipeline entry
    ├── llm/
    │   └── gemini_engine.py           # Memory-enriched Gemini LLM wrapper
    ├── rag/
    │   └── memory_retriever.py        # RAG cosine similarity retriever
    ├── stt/
    │   └── sarvam_stream.py           # Sarvam AI streaming STT
    ├── tts/
    │   └── eleven_ws.py               # ElevenLabs WebSocket TTS
    ├── engine/
    │   └── conversation_engine.py     # Orchestrates STT → LLM → TTS
    └── services/
        └── avatar/                    # Avatar WebSocket manager
```

---

## 🚀 Getting Started

### Prerequisites

- Python **3.11+**
- Node.js **18+**
- API keys for: **Google Gemini**, **Sarvam AI**, **ElevenLabs**

---

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/Pratibimb.git
cd Pratibimb
```

---

### 2. Backend Setup

```bash
cd TwinEngine/Backend

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate           # Windows
# source venv/bin/activate      # macOS / Linux

# Install dependencies
pip install -r requirements.txt
```

Create a `.env` file in `TwinEngine/Backend/`:

```env
SECRET_KEY=your-super-secret-jwt-key
GEMINI_API_KEY=your-google-gemini-api-key
DATABASE_URL=sqlite:///./pratibimb.db
```

Start the REST API:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

> API docs available at: [http://localhost:8000/docs](http://localhost:8000/docs)

---

### 3. TwinEngine (Voice Pipeline) Setup

```bash
cd TwinEngine

pip install sarvamai google-genai python-dotenv fastapi uvicorn websockets
```

Create a `.env` file in `TwinEngine/`:

```env
SARVAM_API_KEY=your-sarvam-api-key
GEMINI_API_KEY=your-google-gemini-api-key
ELEVENLABS_API_KEY=your-elevenlabs-api-key
```

Start the voice WebSocket engine:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

---

### 4. Frontend Setup

```bash
cd Frontend

npm install
npm run dev
```

> App available at: [http://localhost:5173](http://localhost:5173)

---

## 🔌 API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/signup` | Register a new user |
| `POST` | `/auth/login` | Login → returns JWT |
| `GET` | `/auth/me` | Get current authenticated user |

### Twins
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/twins` | Create a new digital twin |
| `GET` | `/twins` | List all your twins |
| `GET` | `/twins/{id}` | Get a specific twin |
| `PATCH` | `/twins/{id}` | Update twin details |
| `DELETE` | `/twins/{id}` | Delete twin + all associated data |

### Memories
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/memories` | Add a memory (auto-embedded via Gemini) |
| `GET` | `/memories` | List memories for a twin |
| `PATCH` | `/memories/{id}` | Update a memory |
| `DELETE` | `/memories/{id}` | Delete a memory |

### Conversations
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/conversations` | Save a conversation message |
| `GET` | `/conversations` | Retrieve conversation history |
| `DELETE` | `/conversations/{id}` | Clear a conversation |

### Voice
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/voice/upload/{twin_id}` | Upload voice samples |
| `POST` | `/voice/clone/{twin_id}` | Trigger ElevenLabs voice clone |
| `WebSocket` | `/ws/voice` | Real-time bidirectional voice channel |

---

## 🧠 How the RAG Memory System Works

```
1. Memory Added
   └── Text embedded via Google Gemini Embeddings
         └── Float vector stored in SQLite alongside memory text

2. User Speaks
   └── Query embedded in real-time
         └── Cosine similarity computed across all twin's memory vectors
               └── Top-K most relevant memories retrieved

3. Response Generation
   └── Relevant memories injected into Gemini system prompt
         └── Gemini generates a deeply personal, context-aware reply
               └── Smart filter: social filler (greetings, "ok", "yes") skips RAG to reduce latency
```

This gives every conversation a **personal, memory-grounded feel** — no generic AI responses.

---

## 🌐 Multilingual Voice Support

Pratibimb supports **11 Indian languages** via Sarvam AI's streaming STT. The system auto-detects the spoken language and instructs Gemini to respond in the **same language**.

| Language | BCP-47 Code |
|---|---|
| Hindi | `hi-IN` |
| English | `en-IN` |
| Marathi | `mr-IN` |
| Tamil | `ta-IN` |
| Telugu | `te-IN` |
| Kannada | `kn-IN` |
| Malayalam | `ml-IN` |
| Gujarati | `gu-IN` |
| Punjabi | `pa-IN` |
| Bengali | `bn-IN` |
| Odia | `od-IN` |

---

## 🖼️ User Journey

```
1. Sign Up / Log In
        ↓
2. Create a Digital Twin    (name, personality, supported languages)
        ↓
3. Add Memories             (experiences, knowledge, facts about yourself)
        ↓
4. Clone Your Voice         (upload audio samples → ElevenLabs trains a clone)
        ↓
5. Start Talking            (hold SPACEBAR → speak → twin responds in your voice)
        ↓
6. Review & Manage          (browse all conversations and memories in the dashboard)
```

---

## 🔒 Security

- Passwords hashed with **bcrypt** (`passlib`)
- Auth via **signed JWT tokens** (`python-jose`)
- All API routes require authentication — twins, memories, and conversations are **strictly scoped to the owner**
- CORS configured for local dev — restrict `allow_origins` in production

---

## 🗺️ Roadmap

- [ ] PostgreSQL migration for production deployments
- [ ] Pinecone / Weaviate vector store for scalable retrieval
- [ ] PDF & document ingestion into memory
- [ ] Multi-twin sharing & collaboration
- [ ] Mobile app (React Native)
- [ ] Cloud deployment (Railway / Render / Vercel)

---

## 👤 Author

Built with ❤️ by **Tanishq**

---

<div align="center">

*"A reflection so real, it knows you better than you know yourself."*

⭐ **Star this repo** if you find it interesting!

</div>
