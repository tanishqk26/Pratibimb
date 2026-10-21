from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):

    database_url: str = "sqlite:///./pratibimb.db"

    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080  # 7 days

    # Comma-separated list of allowed origins, e.g.
    #   CORS_ORIGINS=https://pratibimb.vercel.app,http://localhost:5173
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    gemini_api_key: str = ""
    sarvam_api_key: str = ""
    elevenlabs_api_key: str = ""
    openai_api_key: str = ""
    liveavatar_api_key: str = ""

    upload_dir: str = "uploads"
    max_upload_size_mb: int = 50

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
