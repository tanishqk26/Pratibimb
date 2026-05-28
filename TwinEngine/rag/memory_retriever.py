"""
RAG Memory Retriever for TwinEngine
------------------------------------
Reads twin memories directly from the shared SQLite DB (pratibimb.db in Backend/),
computes cosine similarity between the query embedding and stored embeddings,
and returns the top-k most relevant memory chunks.

This is the single source of truth for vector retrieval in the voice pipeline.
"""

import os
import json
import math
import sqlite3
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

# ── Path to the shared SQLite DB ──────────────────────────────────────────────
# TwinEngine/ and TwinEngine/Backend/ share the same DB file.
_HERE = os.path.dirname(os.path.abspath(__file__))
_DB_PATH = os.path.join(_HERE, "..", "Backend", "pratibimb.db")


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Fast pure-Python cosine similarity (no numpy required)."""
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(y * y for y in b))
    if mag_a == 0.0 or mag_b == 0.0:
        return 0.0
    return dot / (mag_a * mag_b)


def _parse_embedding(raw) -> Optional[list[float]]:
    """
    SQLite stores vectors as JSON arrays or as comma-separated floats.
    Handle both representations robustly.
    """
    if raw is None:
        return None
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode("utf-8", errors="ignore")
    text = str(raw).strip()
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        pass
    try:
        # Fallback: strip brackets and split on commas
        text = text.strip("[]() ")
        return [float(v) for v in text.split(",") if v.strip()]
    except ValueError:
        return None


# Singleton local model loader
_MODEL = None

def _get_local_model():
    global _MODEL
    if _MODEL is None:
        from sentence_transformers import SentenceTransformer
        # Initialize lazily on CPU only
        _MODEL = SentenceTransformer("all-MiniLM-L6-v2", device="cpu")
        print("[Embedding] Local MiniLM model loaded")
    return _MODEL

LOW_VALUE_MESSAGES = {
    "ok", "okay", "yes", "no",
    "hmm", "huh", "nice",
    "tell me more"
}

def should_skip_embedding(text: str) -> bool:
    if not text:
        return True
    text_clean = text.strip().lower()
    words = text_clean.split()
    if len(words) < 5 or text_clean in LOW_VALUE_MESSAGES:
        return True
    return False

def get_query_embedding(query: str) -> list[float]:
    """
    Generate an embedding using sentence-transformers all-MiniLM-L6-v2 (padded to 1536).
    """
    if should_skip_embedding(query):
        print("[Embedding] Skipped low-value utterance")
        raise ValueError("Skipped low-value utterance")

    model = _get_local_model()
    # Compute local embedding
    emb = model.encode(query).tolist()
    print("[Embedding] Generated local embedding")
    
    # Pad to 1536 dimensions to preserve SQLite DB / schema compatibility
    if len(emb) < 1536:
        emb = emb + [0.0] * (1536 - len(emb))
    return emb


def retrieve_relevant_memories(
    twin_id: int,
    query: str,
    top_k: int = 5,
    similarity_threshold: float = 0.30,
) -> list[dict]:
    """
    Retrieve the top-k most relevant memories for a twin given a user query.

    Returns a list of dicts:
        [{"title": str, "content": str, "score": float}, ...]

    Falls back to keyword search if no embeddings are indexed.
    """
    if not query or not query.strip():
        return []

    db_path = os.path.abspath(_DB_PATH)
    if not os.path.exists(db_path):
        print(f"[RAG] DB not found at {db_path}")
        return []

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    try:
        # ── Fetch indexed memories for this twin ──────────────────────────────
        cursor = conn.execute(
            """
            SELECT id, title, content, embedding
            FROM memories
            WHERE twin_id = ?
              AND is_indexed = 1
              AND indexing_status = 'indexed'
              AND content IS NOT NULL
              AND content != ''
            """,
            (twin_id,),
        )
        rows = cursor.fetchall()

        if not rows:
            print(f"[RAG] No indexed memories for twin_id={twin_id}. Falling back to keyword search.")
            return _keyword_fallback(conn, twin_id, query, top_k)

        # ── Generate query embedding ──────────────────────────────────────────
        try:
            query_emb = get_query_embedding(query)
        except Exception as e:
            print(f"[RAG] Embedding error: {e}. Falling back to keyword search.")
            return _keyword_fallback(conn, twin_id, query, top_k)

        # ── Score each memory ─────────────────────────────────────────────────
        scored: list[tuple[float, str, str]] = []
        no_emb_count = 0

        for row in rows:
            mem_emb = _parse_embedding(row["embedding"])
            if mem_emb is None:
                no_emb_count += 1
                continue
            try:
                score = _cosine_similarity(query_emb, mem_emb)
            except Exception:
                score = 0.0

            if score >= similarity_threshold:
                scored.append((score, row["title"] or "", row["content"] or ""))

        if no_emb_count:
            print(f"[RAG] {no_emb_count} memories had unparseable embeddings (skipped).")

        if not scored:
            print("[RAG] No memories above similarity threshold. Falling back to keyword search.")
            return _keyword_fallback(conn, twin_id, query, top_k)

        # ── Sort by score descending and take top_k ───────────────────────────
        scored.sort(key=lambda x: x[0], reverse=True)
        results = [
            {"title": title, "content": content, "score": round(score, 4)}
            for score, title, content in scored[:top_k]
        ]

        print(f"[RAG] Retrieved {len(results)} relevant memories for twin_id={twin_id}:")
        for r in results:
            print(f"  [{r['score']:.3f}] {r['title'][:60]}")

        return results

    finally:
        conn.close()


def _keyword_fallback(
    conn: sqlite3.Connection, twin_id: int, query: str, top_k: int
) -> list[dict]:
    """
    Simple keyword fallback: searches for any word in the query against memory content/title.
    Returns up to top_k results sorted by recency.
    """
    words = [w for w in query.lower().split() if len(w) > 2]
    if not words:
        return []

    # Build a LIKE condition for each word
    conditions = " OR ".join(["LOWER(content) LIKE ? OR LOWER(title) LIKE ?" for _ in words])
    params = []
    for w in words:
        params.extend([f"%{w}%", f"%{w}%"])
    params.append(twin_id)
    params.append(top_k)

    cursor = conn.execute(
        f"""
        SELECT title, content
        FROM memories
        WHERE ({conditions})
          AND twin_id = ?
          AND content IS NOT NULL
          AND content != ''
        ORDER BY created_at DESC
        LIMIT ?
        """,
        params,
    )
    rows = cursor.fetchall()
    results = [{"title": row[0] or "", "content": row[1] or "", "score": 0.0} for row in rows]
    print(f"[RAG] Keyword fallback returned {len(results)} memories.")
    return results


def prewarm_memories(twin_id: int, top_k: int = 5) -> list[dict]:
    """
    Fast session pre-warm: load the most recent indexed memories for a twin.
    NO embedding API call — pure SQLite, takes < 5ms.
    Used to populate the memory cache at session start so the very first
    query already has some context without any latency penalty.
    """
    db_path = os.path.abspath(_DB_PATH)
    if not os.path.exists(db_path):
        return []

    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.execute(
            """
            SELECT title, content
            FROM memories
            WHERE twin_id = ?
              AND is_indexed = 1
              AND indexing_status = 'indexed'
              AND content IS NOT NULL
              AND content != ''
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (twin_id, top_k),
        )
        rows = cursor.fetchall()
        results = [{"title": row[0] or "", "content": row[1] or "", "score": 0.0} for row in rows]
        print(f"[RAG] Pre-warm loaded {len(results)} recent memories for twin_id={twin_id}.")
        return results
    finally:
        conn.close()
