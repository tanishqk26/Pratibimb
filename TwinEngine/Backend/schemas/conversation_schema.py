from datetime import datetime
from pydantic import BaseModel
from typing import List, Optional

class ConversationMessageBase(BaseModel):
    role: str
    message: str

class ConversationMessageCreate(ConversationMessageBase):
    pass

class ConversationMessageOut(ConversationMessageBase):
    id: int
    session_id: int
    created_at: datetime

    model_config = {"from_attributes": True}

class ConversationSessionBase(BaseModel):
    title: Optional[str] = None

class ConversationSessionCreate(ConversationSessionBase):
    messages: List[ConversationMessageCreate]
    user_id: Optional[int] = None

class ConversationSessionOut(ConversationSessionBase):
    id: int
    twin_id: int
    user_id: int
    created_at: datetime
    messages: List[ConversationMessageOut] = []

    model_config = {"from_attributes": True}
