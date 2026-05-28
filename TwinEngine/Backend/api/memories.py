from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session

from database.db import get_db
from database.models import Memory, Twin, User
from schemas.memory_schema import MemoryCreate, MemoryUpdate, MemoryOut
from core.dependencies import get_current_user
from services.memory_service import index_pending_memories_job, index_single_memory_job

router = APIRouter(prefix="/memories", tags=["Memories"])


@router.post("", response_model=MemoryOut, status_code=status.HTTP_201_CREATED)
def create_memory(payload: MemoryCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Verify twin belongs to user
    twin = db.query(Twin).filter(Twin.id == payload.twin_id, Twin.user_id == current_user.id).first()
    if not twin:
        raise HTTPException(status_code=404, detail="Twin not found")
        
    db_memory = Memory(**payload.model_dump(), user_id=current_user.id, is_indexed=False, indexing_status="not_synced")
    print(f"[DEBUG:memories] Created memory id={db_memory.id} with indexing_status='not_synced'")
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
    content_changed = "content" in update_data and update_data["content"] != db_memory.content
    
    for key, value in update_data.items():
        setattr(db_memory, key, value)
        
    if content_changed:
        db_memory.is_indexed = False
        db_memory.indexing_status = "not_synced"
        db_memory.embedding = None
        print(f"[DEBUG:memories] Memory {memory_id} content changed — reset to 'not_synced'")
        
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


@router.post("/twin/{twin_id}/index", status_code=status.HTTP_202_ACCEPTED)
def trigger_indexing(
    twin_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify twin belongs to user
    twin = db.query(Twin).filter(Twin.id == twin_id, Twin.user_id == current_user.id).first()
    if not twin:
        raise HTTPException(status_code=404, detail="Twin not found")
        
    # Trigger background task
    background_tasks.add_task(index_pending_memories_job, twin_id)
    return {"status": "indexing", "message": "Indexing triggered in background."}


@router.post("/{memory_id}/index", status_code=status.HTTP_202_ACCEPTED)
def trigger_single_memory_indexing(
    memory_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Trigger indexing for a single memory (per-card Sync button)."""
    db_memory = db.query(Memory).filter(Memory.id == memory_id, Memory.user_id == current_user.id).first()
    if not db_memory:
        raise HTTPException(status_code=404, detail="Memory not found")

    # Mark as indexing so frontend shows spinner
    db_memory.indexing_status = "indexing"
    db_memory.is_indexed = False
    db.commit()
    print(f"[DEBUG:memories] Triggered single-memory index for memory_id={memory_id}, set status='indexing'")

    background_tasks.add_task(index_single_memory_job, memory_id)
    return {"status": "indexing", "message": f"Indexing memory {memory_id} in background."}
