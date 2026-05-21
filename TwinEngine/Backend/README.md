# Pratibimb Backend

Production-grade backend for the Pratibimb AI Digital Twin platform.

## Architecture

```
User → Auth (JWT)
     └── Avatars
           ├── Memory (ChromaDB vector store)
           ├── Conversations (PostgreSQL)
           ├── Files (local disk → ElevenLabs voice clone)
           └── Voice Pipeline (untouched)
                  Mic → Sarvam STT → Gemini LLM → ElevenLabs TTS → Speaker
```

## Project Structure

```
backend/
├── app/
│   ├── main.py                    # FastAPI app entry point
│   ├── core/
│   │   ├── config.py              # Pydantic settings (reads .env)
│   │   ├── security.py            # bcrypt + JWT helpers
│   │   └── dependencies.py        # FastAPI dependency injection
│   ├── database/
│   │   ├── db.py                  # SQLAlchemy engine + session
│   │   └── models.py              # ORM models (User, Avatar, Memory, …)
│   ├── schemas/                   # Pydantic request/response models
│   ├── api/                       # FastAPI routers
│   │   ├── auth.py                # /auth/signup  /auth/login  /auth/me
│   │   ├── avatars.py             # /avatars  CRUD
│   │   ├── memory.py              # /avatars/{id}/memory  + semantic search
│   │   ├── conversations.py       # /avatars/{id}/conversations
│   │   └── upload.py             # /upload/{id}  + /upload/{id}/clone-voice
│   ├── services/                  # Business logic layer
│   ├── vector/
│   │   └── chroma_store.py        # ChromaDB per-avatar collections
│   └── utils/logger.py
├── llm/
│   └── contextual_engine.py       # Memory-enriched Gemini wrapper (non-breaking)
├── uploads/                       # File storage root
├── requirements.txt
└── .env.example
```

## Prerequisites

- Python 3.11+
- PostgreSQL 14+
- `ffmpeg` (required by pydub for audio decoding)

## Setup

### 1. Clone and install

```bash
cd backend
python -m venv venv
source venv/bin/activate         # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and fill in your keys
```

Required values in `.env`:

| Key | Description |
|-----|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | Random string for JWT signing |
| `GEMINI_API_KEY` | Google AI Studio key |
| `SARVAM_API_KEY` | Sarvam AI subscription key |
| `ELEVENLABS_API_KEY` | ElevenLabs API key |

### 3. Create the database

```bash
# PostgreSQL
createdb pratibimb
# Tables are auto-created on first startup via SQLAlchemy
```

### 4. Run the API server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs available at: http://localhost:8000/docs

---

## API Reference

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/signup` | Register a new user |
| POST | `/auth/login` | Login → returns JWT |
| GET | `/auth/me` | Get current user |

### Avatars

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/avatars` | Create an avatar |
| GET | `/avatars` | List your avatars |
| GET | `/avatars/{id}` | Get one avatar |
| PATCH | `/avatars/{id}` | Update avatar |
| DELETE | `/avatars/{id}` | Delete avatar + all data |

### Memory

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/avatars/{id}/memory` | Add a memory (auto-embedded) |
| GET | `/avatars/{id}/memory` | List all memories |
| POST | `/avatars/{id}/memory/search` | Semantic search |
| DELETE | `/avatars/{id}/memory/{mid}` | Remove a memory |

### Conversations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/avatars/{id}/conversations` | Save a message |
| GET | `/avatars/{id}/conversations` | Get history (last 50) |
| DELETE | `/avatars/{id}/conversations` | Clear history |

### Files & Voice

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/upload/{avatar_id}` | Upload file (voice/image/doc/video) |
| GET | `/upload/{avatar_id}` | List avatar files |
| DELETE | `/upload/{avatar_id}/{file_id}` | Delete a file |
| POST | `/upload/{avatar_id}/clone-voice` | Upload samples + clone ElevenLabs voice |

---

## Integrating Memory into the Voice Pipeline

Replace `GeminiEngine` with `ContextualGeminiEngine` in `main.py`:

```python
# main.py — only these lines change
from app.database.db import SessionLocal
from llm.contextual_engine import ContextualGeminiEngine

db      = SessionLocal()
avatar  = db.query(Avatar).filter(Avatar.id == AVATAR_ID).first()

llm = ContextualGeminiEngine(
    api_key=GEMINI_API_KEY,
    avatar_id=avatar.id,
    db=db,
    user_id=USER_ID,
    personality=avatar.personality,
)
```

Everything else in `main.py` stays unchanged. The voice pipeline continues to call `llm.generate(text)` with no modification.

---

## Avatar Onboarding Flow

1. `POST /auth/signup` → get token
2. `POST /avatars` → create avatar (returns `avatar_id`)
3. `POST /avatars/{id}/memory` × N → add personality knowledge
4. `POST /upload/{avatar_id}/clone-voice` → upload voice samples → ElevenLabs clones voice → `voice_id` auto-saved
5. Start voice pipeline with `ContextualGeminiEngine`

---

## Future: Migrate to Pinecone

Replace `app/vector/chroma_store.py` with a Pinecone implementation that exposes the same `store_memory()` / `search_memory()` interface. No other files need to change.
