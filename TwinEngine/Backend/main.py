from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from database.db import create_tables
from api import auth, twins, memories, voice
from utils.logger import get_logger

logger = get_logger("pratibimb.main")

app = FastAPI(
    title="Pratibimb API",
    description="Backend for the Pratibimb AI digital twin platform.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(twins.router)
app.include_router(memories.router)
app.include_router(voice.router)

@app.on_event("startup")
def on_startup():
    logger.info("Creating database tables if they don't exist…")
    create_tables()
    logger.info("✅ Pratibimb API ready.")


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "service": "pratibimb-api"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)