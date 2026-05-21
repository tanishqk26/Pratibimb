from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database.db import get_db
from database.models import Memory, Twin, User
from schemas.memory_schema import MemoryCreate, MemoryUpdate, MemoryOut
from core.dependencies import get_current_user

router = APIRouter(prefix="/memories", tags=["Memories"])


@router.post("", response_model=MemoryOut, status_code=status.HTTP_201_CREATED)
def create_memory(payload: MemoryCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Verify twin belongs to user
    twin = db.query(Twin).filter(Twin.id == payload.twin_id, Twin.user_id == current_user.id).first()
    if not twin:
        raise HTTPException(status_code=404, detail="Twin not found")
        
    db_memory = Memory(**payload.model_dump(), user_id=current_user.id)
    db.add(db_memory)
    db.commit()
    db.refresh(db_memory)
    return db_memory


@router.get("/twin/{twin_id}", response_model=List[MemoryOut])
def get_memories_by_twin(twin_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    twin = db.query(Twin).filter(Twin.id == twin_id, Twin.user_id == current_user.id).first()
    if not twin:
        raise HTTPException(status_code=404, detail="Twin not found")
        
    memories = db.query(Memory).filter(Memory.twin_id == twin_id).order_by(Memory.created_at.desc()).all()
    return memories


@router.put("/{memory_id}", response_model=MemoryOut)
def update_memory(memory_id: int, payload: MemoryUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_memory = db.query(Memory).filter(Memory.id == memory_id, Memory.user_id == current_user.id).first()
    if not db_memory:
        raise HTTPException(status_code=404, detail="Memory not found")
    
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_memory, key, value)
        
    db.commit()
    db.refresh(db_memory)
    return db_memory


@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_memory(memory_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_memory = db.query(Memory).filter(Memory.id == memory_id, Memory.user_id == current_user.id).first()
    if not db_memory:
        raise HTTPException(status_code=404, detail="Memory not found")
    
    db.delete(db_memory)
    db.commit()
