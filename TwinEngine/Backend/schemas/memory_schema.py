from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class MemoryBase(BaseModel):
    title: str
    content: Optional[str] = None


class MemoryCreate(MemoryBase):
    twin_id: int


class MemoryUpdate(MemoryBase):
    title: Optional[str] = None


class MemoryOut(MemoryBase):
    id: int
    user_id: int
    twin_id: int
    created_at: datetime

    model_config = {"from_attributes": True}
