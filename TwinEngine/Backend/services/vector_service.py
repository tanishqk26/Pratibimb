"""
vector_service.py — RAG retrieval for the Backend (HTTP API layer).

For SQLite: performs cosine similarity in Python over stored embeddings.
For PostgreSQL (pgvector): uses the native cosine_distance ordering.
"""

import json
import math
from typing import Optional

from sqlalchemy.orm import Session
from database.models import Memory
from services.embedding_service import get_embedding


# ── Cosine similarity (pure Python, no numpy) ─────────────────────────────────

def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot   = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(y * y for y in b))
    if mag_a == 0.0 or mag_b == 0.0:
        return 0.0
    return dot / (mag_a * mag_b)


def _parse_embedding(raw) -> Optional[list[float]]:
    """
    Parse an embedding stored in SQLite.
    SQLite has no native vector type — we store JSON arrays or plain floats.
    """
    if raw is None:
        return None
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode("utf-8", errors="ignore")
    text = str(raw).strip()
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return [float(v) for v in parsed]
    except (json.JSONDecodeError, ValueError):
        pass
    # Fallback: strip brackets and split on commas
    try:
        text = text.strip("[]() ")
        return [float(v) for v in text.split(",") if v.strip()]
    except ValueError:
        return None


# ── Main retrieval function ───────────────────────────────────────────────────

def retrieve_relevant_memories(
    db: Session,
    twin_id: int,
    query: str,
    top_k: int = 5,
    similarity_threshold: float = 0.25,
) -> list[Memory]:
    """
    Retrieve the top-k most relevant memories for a twin using vector similarity.

    • SQLite  → Python-side cosine similarity on stored embeddings.
    • Postgres → native pgvector cosine_distance ordering.

    Falls back to keyword search if no embeddings are present.
    """
    if not query or not query.strip():
        return []

    is_sqlite = db.bind.dialect.name == "sqlite"

    # ── PostgreSQL path (pgvector) ────────────────────────────────────────────
    if not is_sqlite:
        try:
            query_embedding = get_embedding(query)
            results = (
                db.query(Memory)
                .filter(
                    Memory.twin_id == twin_id,
                    Memory.is_indexed == True,
                    Memory.embedding != None,
                )
                .order_by(Memory.embedding.cosine_distance(query_embedding))
                .limit(top_k)
                .all()
            )
            return results
        except Exception as e:
            print(f"[VectorService] pgvector error: {e}")
            return []

    # ── SQLite path — Python cosine similarity ────────────────────────────────
    print("[VectorService] SQLite detected — running Python cosine similarity search.")

    # 1. Fetch all indexed memories for this twin
    candidates: list[Memory] = (
        db.query(Memory)
        .filter(
            Memory.twin_id == twin_id,
            Memory.is_indexed == True,
            Memory.indexing_status == "indexed",
            Memory.content != None,
        )
        .all()
    )

    if not candidates:
        print("[VectorService] No indexed memories found — falling back to keyword search.")
        return _keyword_fallback(db, twin_id, query, top_k)

    # 2. Generate query embedding
    try:
        query_emb = get_embedding(query)
    except Exception as e:
        print(f"[VectorService] Embedding error: {e} — falling back to keyword search.")
        return _keyword_fallback(db, twin_id, query, top_k)

    # 3. Score each candidate
    scored: list[tuple[float, Memory]] = []
    skipped = 0
    for mem in candidates:
        mem_emb = _parse_embedding(mem.embedding)
        if mem_emb is None:
            skipped += 1
            continue
        try:
            score = _cosine_similarity(query_emb, mem_emb)
        except Exception:
            score = 0.0
        if score >= similarity_threshold:
            scored.append((score, mem))

    if skipped:
        print(f"[VectorService] {skipped} memories had unparseable embeddings.")

    if not scored:
        print("[VectorService] No memories above similarity threshold — falling back to keyword search.")
        return _keyword_fallback(db, twin_id, query, top_k)

    # 4. Sort descending by score, return top-k Memory objects
    scored.sort(key=lambda x: x[0], reverse=True)
    results = [mem for _, mem in scored[:top_k]]

    print(f"[VectorService] Returning {len(results)} memories (scores: "
          f"{[round(s, 3) for s, _ in scored[:top_k]]}).")
    return results


def _keyword_fallback(db: Session, twin_id: int, query: str, top_k: int) -> list[Memory]:
    """
    Keyword LIKE fallback — used when no embeddings are available.
    Searches the full query string against memory content.
    """
    return (
        db.query(Memory)
        .filter(
            Memory.twin_id == twin_id,
            Memory.content.isnot(None),
            Memory.content.like(f"%{query}%"),
        )
        .limit(top_k)
        .all()
    )
