"""
Voice cloning endpoint — wraps ElevenLabs Instant Voice Cloning (IVC) API.

Flow:
  1. Frontend uploads audio file (mp3 / wav / m4a)  → POST /voice/clone
  2. This handler streams the file to ElevenLabs /add-voice
  3. Returns { voice_id }
  4. Frontend stores voice_id in the twin profile via PUT /twins/{id}

Auth note:
  OAuth2PasswordBearer can silently fail to extract the Authorization header
  when the request body is multipart/form-data (body is consumed before the
  security dependency runs in some Starlette versions). We bypass this by
  reading the Authorization header directly via Header(...).
"""

import httpx
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Header, Form
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from core.config import settings
from core.security import decode_token
from database.db import get_db
from database import models

router = APIRouter(prefix="/voice", tags=["Voice"])

ELEVENLABS_ADD_VOICE_URL = "https://api.elevenlabs.io/v1/voices/add"

# Accepted audio MIME types
ALLOWED_TYPES = {
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
    "audio/ogg",
    "video/mp4",      # some browsers report m4a as video/mp4
}


def _get_user_from_header(
    authorization: str = Header(..., alias="Authorization"),
    db: Session = Depends(get_db),
) -> models.User:
    """
    Extract and validate the Bearer token directly from the Authorization header.
    Bypasses OAuth2PasswordBearer which can fail on multipart/form-data requests.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization header format. Expected: Bearer <token>",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization[len("Bearer "):]
    user_id = decode_token(token)
    if user_id is None:
        raise HTTPException(
            status_code=401,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(models.User).filter(models.User.id == int(user_id)).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    return user


@router.post("/clone")
async def clone_voice(
    files: list[UploadFile] = File(...),
    voice_name: str = Form(""),
    current_user: models.User = Depends(_get_user_from_header),
):
    """
    Upload a voice sample → create an ElevenLabs Professional Voice Clone (PVC).
    Note: PVC requires manual verification on the ElevenLabs dashboard to become usable.
    Returns: { "voice_id": "<eleven_voice_id>" }
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    upload_files = []
    total_len = 0
    for f in files:
        ct = (f.content_type or "").lower()
        if ct and ct not in ALLOWED_TYPES:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported file type '{ct}'. Send mp3, wav, or m4a."
            )
        
        audio_bytes = await f.read()
        total_len += len(audio_bytes)
        upload_files.append(("files", (f.filename or "voice.mp3", audio_bytes, ct or "audio/mpeg")))

    if total_len < 10_000:
        raise HTTPException(
            status_code=400,
            detail="Audio sample too short. Please upload at least 30 seconds of clean speech."
        )

    api_key = settings.elevenlabs_api_key
    if not api_key:
        raise HTTPException(status_code=500, detail="ElevenLabs API key not configured.")

    final_name = (voice_name.strip() or f"twin_voice_{current_user.id}")[:100]
    print(f"[VoiceClone] Cloning voice '{final_name}' for user={current_user.id}, {len(files)} file(s)")

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(
                "https://api.elevenlabs.io/v1/voices/add",
                headers={"xi-api-key": api_key},
                files=upload_files,
                data={
                    "name": final_name,
                    "description": f"Cloned voice for Pratibimb twin (user {current_user.id})",
                    "labels": '{"use_case": "pratibimb", "language": "multilingual"}',
                },
            )
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Could not reach ElevenLabs: {exc}")

    if resp.status_code != 200:
        error_body = resp.text[:400]
        print(f"[VoiceClone] ElevenLabs error {resp.status_code}: {error_body}")
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"ElevenLabs error: {error_body}"
        )

    voice_id = resp.json().get("voice_id")
    if not voice_id:
        raise HTTPException(status_code=502, detail="ElevenLabs returned no voice_id.")

    print(f"[VoiceClone] Created Instant voice_id={voice_id} for user={current_user.id}")
    return JSONResponse({"voice_id": voice_id})


