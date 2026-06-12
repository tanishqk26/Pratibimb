from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class TwinBase(BaseModel):
    name: str
    age: Optional[int] = None
    gender: Optional[str] = None
    profession: Optional[str] = None
    description: Optional[str] = None
    personality_traits: Optional[str] = None
    interests: Optional[str] = None
    image_url: Optional[str] = None
    voice_type: Optional[str] = None
    voice_url: Optional[str] = None
    voice_id: Optional[str] = None
    languages: Optional[str] = None       # comma-separated BCP-47 codes
    avatar_provider: Optional[str] = None
    avatar_id: Optional[str] = None


class TwinCreate(TwinBase):
    pass


class TwinUpdate(TwinBase):
    name: Optional[str] = None


class TwinOut(TwinBase):
    id: int
    user_id: int
    created_at: datetime

    model_config = {"from_attributes": True}
