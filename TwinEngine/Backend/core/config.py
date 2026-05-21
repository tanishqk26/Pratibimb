from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):

    database_url: str = "sqlite:///./pratibimb.db"

    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080  # 7 days

    gemini_api_key: str = ""
    sarvam_api_key: str = ""
    elevenlabs_api_key: str = ""

    upload_dir: str = "uploads"
    max_upload_size_mb: int = 50

    chroma_persist_dir: str = ".chroma"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
