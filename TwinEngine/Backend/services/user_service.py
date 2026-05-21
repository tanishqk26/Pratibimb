from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from database import models
from core.security import hash_password, verify_password, create_access_token
from schemas.user_schema import UserCreate, UserLogin


def create_user(db: Session, payload: UserCreate) -> models.User:
    if db.query(models.User).filter(models.User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered.")
    user = models.User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, payload: UserLogin) -> str:
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return create_access_token(str(user.id))

from schemas.user_schema import UserUpdate

def update_user(db: Session, user: models.User, payload: UserUpdate) -> models.User:
    if payload.name is not None:
        user.name = payload.name
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)
    
    db.commit()
    db.refresh(user)
    return user
