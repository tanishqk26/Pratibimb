from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database.db import get_db
from schemas.user_schema import UserCreate, UserLogin, UserOut, TokenOut, UserUpdate
from services.user_service import create_user, authenticate_user, update_user
from core.dependencies import get_current_user
from database.models import User

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", response_model=UserOut, status_code=201)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    return create_user(db, payload)


@router.post("/login", response_model=TokenOut)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    token = authenticate_user(db, payload)
    return TokenOut(access_token=token)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserOut)
def update_me(payload: UserUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return update_user(db, current_user, payload)
