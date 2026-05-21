from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey

from database.db import Base


def _now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, index=True)
    name          = Column(String(255), nullable=True)
    email         = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    created_at    = Column(DateTime(timezone=True), default=_now)

class Twin(Base):
    __tablename__ = "twins"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    age = Column(Integer, nullable=True)
    gender = Column(String(50), nullable=True)
    profession = Column(String(255), nullable=True)
    description = Column(String, nullable=True)
    personality_traits = Column(String, nullable=True)
    interests = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    voice_type = Column(String(50), nullable=True)
    voice_url = Column(String, nullable=True)
    voice_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)


class Memory(Base):
    __tablename__ = "memories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    twin_id = Column(Integer, ForeignKey("twins.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    content = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)
