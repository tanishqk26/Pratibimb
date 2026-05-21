from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database.db import get_db
from database.models import Twin, User
from schemas.twin_schema import TwinCreate, TwinUpdate, TwinOut
from core.dependencies import get_current_user

router = APIRouter(prefix="/twins", tags=["Twins"])


@router.post("", response_model=TwinOut, status_code=status.HTTP_201_CREATED)
def create_twin(payload: TwinCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_twin = Twin(**payload.model_dump(), user_id=current_user.id)
    db.add(db_twin)
    db.commit()
    db.refresh(db_twin)
    return db_twin


@router.get("", response_model=List[TwinOut])
def get_twins(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    twins = db.query(Twin).filter(Twin.user_id == current_user.id).all()
    return twins


@router.get("/{twin_id}", response_model=TwinOut)
def get_twin(twin_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    twin = db.query(Twin).filter(Twin.id == twin_id, Twin.user_id == current_user.id).first()
    if not twin:
        raise HTTPException(status_code=404, detail="Twin not found")
    return twin


@router.put("/{twin_id}", response_model=TwinOut)
def update_twin(twin_id: int, payload: TwinUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_twin = db.query(Twin).filter(Twin.id == twin_id, Twin.user_id == current_user.id).first()
    if not db_twin:
        raise HTTPException(status_code=404, detail="Twin not found")
    
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_twin, key, value)
        
    db.commit()
    db.refresh(db_twin)
    return db_twin


@router.delete("/{twin_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_twin(twin_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_twin = db.query(Twin).filter(Twin.id == twin_id, Twin.user_id == current_user.id).first()
    if not db_twin:
        raise HTTPException(status_code=404, detail="Twin not found")
    
    db.delete(db_twin)
    db.commit()
