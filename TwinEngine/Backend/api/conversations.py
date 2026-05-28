import os
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database.db import get_db
from database.models import ConversationSession, ConversationMessage, Twin, User
from schemas.conversation_schema import ConversationSessionCreate, ConversationSessionOut
from core.dependencies import get_current_user
from core.config import settings

router = APIRouter(prefix="/conversations", tags=["Conversations"])

def generate_title(messages: List[dict]) -> str:
    if not messages:
        return "New Conversation"
        
    LOW_VALUE_MESSAGES = {
        "ok", "okay", "yes", "no",
        "hmm", "huh", "nice",
        "tell me more", "hello", "hi", "hey"
    }
    
    first_user_msg = None
    for m in messages:
        # payload is pydantic objects in api, so check m.role or getattr(m, 'role')
        role = getattr(m, 'role', None) or (m.get('role') if isinstance(m, dict) else None)
        message_text = getattr(m, 'message', None) or (m.get('message') if isinstance(m, dict) else None)
        
        if role == "user" and message_text:
            msg_text = message_text.strip()
            if msg_text and msg_text.lower() not in LOW_VALUE_MESSAGES:
                first_user_msg = msg_text
                break
                
    # Fallback to first user message of any kind
    if not first_user_msg:
        for m in messages:
            role = getattr(m, 'role', None) or (m.get('role') if isinstance(m, dict) else None)
            message_text = getattr(m, 'message', None) or (m.get('message') if isinstance(m, dict) else None)
            if role == "user" and message_text:
                msg_text = message_text.strip()
                if msg_text:
                    first_user_msg = msg_text
                    break

    if not first_user_msg:
        return "New Conversation"

    # Take first 5 words
    words = first_user_msg.split()
    title_words = words[:5]
    title = " ".join(title_words)
    
    # Truncate to max 40 chars
    if len(title) > 40:
        title = title[:40].strip()
        
    print(f"[Conversation] Local title generated: '{title}'")
    return title


@router.post("/internal/twin/{twin_id}", status_code=status.HTTP_201_CREATED)
def internal_save_session(twin_id: int, payload: ConversationSessionCreate, db: Session = Depends(get_db)):
    """Internal endpoint called by TwinEngine when WebSocket closes to save a session."""
    if not payload.messages:
        return {"status": "skipped", "message": "No messages to save"}
        
    twin = db.query(Twin).filter(Twin.id == twin_id).first()
    if not twin:
        raise HTTPException(status_code=404, detail="Twin not found")
        
    user_id = payload.user_id or twin.user_id
    
    # Generate title
    messages_dicts = [{"role": m.role, "message": m.message} for m in payload.messages]
    title = payload.title or generate_title(messages_dicts)
    
    # Create session
    session = ConversationSession(twin_id=twin_id, user_id=user_id, title=title)
    db.add(session)
    db.commit()
    db.refresh(session)
    
    # Add messages
    for m in payload.messages:
        db_msg = ConversationMessage(session_id=session.id, role=m.role, message=m.message)
        db.add(db_msg)
        
    db.commit()
    return {"status": "success", "session_id": session.id, "title": title}

@router.get("/twin/{twin_id}", response_model=List[ConversationSessionOut])
def get_sessions_by_twin(twin_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Verify twin belongs to user
    twin = db.query(Twin).filter(Twin.id == twin_id, Twin.user_id == current_user.id).first()
    if not twin:
        raise HTTPException(status_code=404, detail="Twin not found")
        
    sessions = db.query(ConversationSession).filter(ConversationSession.twin_id == twin_id).order_by(ConversationSession.created_at.desc()).all()
    
    # For each session, fetch messages
    for session in sessions:
        messages = db.query(ConversationMessage).filter(ConversationMessage.session_id == session.id).order_by(ConversationMessage.created_at.asc()).all()
        session.messages = messages
        
    return sessions

@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = db.query(ConversationSession).filter(ConversationSession.id == session_id, ConversationSession.user_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    db.delete(session)
    db.commit()
    
@router.delete("/twin/{twin_id}/all", status_code=status.HTTP_204_NO_CONTENT)
def delete_all_sessions(twin_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    twin = db.query(Twin).filter(Twin.id == twin_id, Twin.user_id == current_user.id).first()
    if not twin:
        raise HTTPException(status_code=404, detail="Twin not found")
        
    db.query(ConversationSession).filter(ConversationSession.twin_id == twin_id).delete()
    db.commit()
