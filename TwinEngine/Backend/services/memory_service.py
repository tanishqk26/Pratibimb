import threading
from sqlalchemy.orm import Session
from database.db import SessionLocal
from database.models import Memory
from services.embedding_service import get_embedding, chunk_text

# Locks dictionary to ensure single concurrent indexing job per twin
_twin_locks = {}
_lock_access = threading.Lock()

def get_lock_for_twin(twin_id: int) -> threading.Lock:
    """
    Get or create a threading Lock for a twin to prevent concurrent indexing.
    """
    with _lock_access:
        if twin_id not in _twin_locks:
            _twin_locks[twin_id] = threading.Lock()
        return _twin_locks[twin_id]

def index_pending_memories_job(twin_id: int):
    """
    Background worker that runs in a background thread.
    Acquires the lock for the given twin, fetches pending/failed memories,
    chunks long memories safely, generates embeddings, and updates DB records.
    """
    lock = get_lock_for_twin(twin_id)
    if not lock.acquire(blocking=False):
        print(f"[MemoryService] Indexing already in progress for twin {twin_id}. Skipping.")
        return
        
    try:
        print(f"[MemoryService] Starting indexing job for twin {twin_id}")
        db: Session = SessionLocal()
        try:
            # 1. Fetch pending and failed memories
            memories = db.query(Memory).filter(
                Memory.twin_id == twin_id,
                Memory.indexing_status.in_(["pending", "failed", "not_synced"])
            ).all()
            
            if not memories:
                print(f"[MemoryService] No pending or failed memories to index for twin {twin_id}")
                return
                
            # 2. Mark all as "indexing" to prevent concurrent modification
            for m in memories:
                m.indexing_status = "indexing"
            db.commit()
            
            # 3. Process each memory
            for m in memories:
                try:
                    content_str = m.content or ""
                    chunks = chunk_text(content_str)
                    
                    if len(chunks) > 1:
                        print(f"[MemoryService] Memory {m.id} is long ({len(content_str.split())} words). Chunking into {len(chunks)} parts.")
                        # Save chunks as new memory rows
                        chunked_memories = []
                        for idx, chunk_content in enumerate(chunks):
                            new_m = Memory(
                                user_id=m.user_id,
                                twin_id=m.twin_id,
                                title=f"{m.title} (Part {idx + 1})",
                                content=chunk_content,
                                is_indexed=False,
                                indexing_status="indexing"
                            )
                            db.add(new_m)
                            chunked_memories.append(new_m)
                            
                        # Delete the original memory
                        db.delete(m)
                        db.commit()
                        
                        # Generate embeddings for the chunks
                        for cm in chunked_memories:
                            try:
                                emb = get_embedding(cm.content)
                                cm.embedding = emb
                                cm.is_indexed = True
                                cm.indexing_status = "indexed"
                            except Exception as chunk_err:
                                print(f"[MemoryService] Error indexing chunk: {chunk_err}")
                                cm.indexing_status = "failed"
                                cm.is_indexed = False
                        db.commit()
                        
                    else:
                        # Index normally as a single memory row
                        emb = get_embedding(content_str)
                        m.embedding = emb
                        m.is_indexed = True
                        m.indexing_status = "indexed"
                        db.commit()
                        
                except Exception as item_err:
                    print(f"[MemoryService] Failed to index memory {m.id}: {item_err}")
                    try:
                        db.rollback()
                        fresh_m = db.query(Memory).filter(Memory.id == m.id).first()
                        if fresh_m:
                            fresh_m.indexing_status = "failed"
                            fresh_m.is_indexed = False
                            db.commit()
                    except Exception as rollback_err:
                        print(f"[MemoryService] Rollback update failed: {rollback_err}")
                        
            print(f"[MemoryService] Indexing job completed for twin {twin_id}")
        except Exception as e:
            print(f"[MemoryService] Global error during indexing for twin {twin_id}: {e}")
            db.rollback()
        finally:
            db.close()
    finally:
        lock.release()


def index_single_memory_job(memory_id: int):
    """
    Background worker that indexes a single memory by its ID.
    Used for the per-card Sync button in the frontend.
    """
    print(f"[DEBUG:index_single] ▶ START index_single_memory_job(memory_id={memory_id})")
    db: Session = SessionLocal()
    try:
        m = db.query(Memory).filter(Memory.id == memory_id).first()
        if not m:
            print(f"[DEBUG:index_single] ✗ Memory {memory_id} NOT FOUND in DB. Aborting.")
            return

        print(f"[DEBUG:index_single] Found memory id={m.id}, title='{m.title}', current_status='{m.indexing_status}', content_len={len(m.content or '')}")

        # Ensure status is indexing (API endpoint already sets it, but be safe)
        if m.indexing_status != "indexing":
            m.indexing_status = "indexing"
            db.commit()
            print(f"[DEBUG:index_single] Updated status to 'indexing'")

        content_str = m.content or ""
        chunks = chunk_text(content_str)
        print(f"[DEBUG:index_single] Content chunked into {len(chunks)} part(s)")

        if len(chunks) > 1:
            print(f"[DEBUG:index_single] Memory {m.id} is long. Chunking into {len(chunks)} parts.")
            chunked_memories = []
            for idx, chunk_content in enumerate(chunks):
                new_m = Memory(
                    user_id=m.user_id,
                    twin_id=m.twin_id,
                    title=f"{m.title} (Part {idx + 1})",
                    content=chunk_content,
                    is_indexed=False,
                    indexing_status="indexing"
                )
                db.add(new_m)
                chunked_memories.append(new_m)

            db.delete(m)
            db.commit()

            for cm in chunked_memories:
                try:
                    print(f"[DEBUG:index_single] Generating embedding for chunk '{cm.title}'...")
                    emb = get_embedding(cm.content)
                    cm.embedding = emb
                    cm.is_indexed = True
                    cm.indexing_status = "indexed"
                    print(f"[DEBUG:index_single] ✓ Chunk '{cm.title}' embedded, vector length={len(emb) if emb else 0}")
                except Exception as chunk_err:
                    print(f"[DEBUG:index_single] ✗ Error indexing chunk '{cm.title}': {chunk_err}")
                    cm.indexing_status = "failed"
                    cm.is_indexed = False
            db.commit()
            print(f"[DEBUG:index_single] Committed all chunks for memory {memory_id}")
        else:
            print(f"[DEBUG:index_single] Generating embedding for memory {m.id}...")
            emb = get_embedding(content_str)
            print(f"[DEBUG:index_single] ✓ Embedding generated, vector length={len(emb) if emb else 0}")
            m.embedding = emb
            m.is_indexed = True
            m.indexing_status = "indexed"
            db.commit()
            print(f"[DEBUG:index_single] ✓ Committed memory {m.id} with status='indexed'")

        # Verify the final state
        db.refresh(m) if db.object_session(m) else None
        final_m = db.query(Memory).filter(Memory.id == memory_id).first()
        if final_m:
            print(f"[DEBUG:index_single] ✓ VERIFY: memory {memory_id} final status='{final_m.indexing_status}', is_indexed={final_m.is_indexed}")
        else:
            print(f"[DEBUG:index_single] ✓ VERIFY: memory {memory_id} was chunked (original deleted)")

        print(f"[DEBUG:index_single] ✓ DONE index_single_memory_job(memory_id={memory_id})")
    except Exception as e:
        print(f"[DEBUG:index_single] ✗ EXCEPTION in index_single_memory_job(memory_id={memory_id}): {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        try:
            db.rollback()
            fresh_m = db.query(Memory).filter(Memory.id == memory_id).first()
            if fresh_m:
                fresh_m.indexing_status = "failed"
                fresh_m.is_indexed = False
                db.commit()
                print(f"[DEBUG:index_single] Set memory {memory_id} to 'failed' after exception")
        except Exception as rollback_err:
            print(f"[DEBUG:index_single] ✗ Rollback also failed: {rollback_err}")
    finally:
        db.close()
        print(f"[DEBUG:index_single] DB session closed for memory_id={memory_id}")

