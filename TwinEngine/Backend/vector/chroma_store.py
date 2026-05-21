import chromadb
from chromadb.config import Settings as ChromaSettings
from typing import List, Dict

from core.config import settings

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(
            path=settings.chroma_persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
    return _client


def _collection_name(avatar_id: int) -> str:
    return f"avatar_{avatar_id}"


def store_memory(avatar_id: int, memory_id: str, text: str, metadata: Dict = None):
    col = _get_client().get_or_create_collection(_collection_name(avatar_id))
    col.upsert(ids=[memory_id], documents=[text], metadatas=[metadata or {}])


def search_memory(avatar_id: int, query: str, top_k: int = 5) -> List[Dict]:
    client = _get_client()
    col_name = _collection_name(avatar_id)
    existing = [c.name for c in client.list_collections()]
    if col_name not in existing:
        return []
    col = client.get_collection(col_name)
    if col.count() == 0:
        return []
    results = col.query(query_texts=[query], n_results=min(top_k, col.count()))
    return [
        {"text": doc, "score": 1.0 - dist, "memory_id": mid}
        for doc, dist, mid in zip(
            results["documents"][0],
            results["distances"][0],
            results["ids"][0],
        )
    ]


def delete_memory(avatar_id: int, memory_id: str):
    client = _get_client()
    col_name = _collection_name(avatar_id)
    if col_name in [c.name for c in client.list_collections()]:
        client.get_collection(col_name).delete(ids=[memory_id])


def delete_avatar_collection(avatar_id: int):
    try:
        _get_client().delete_collection(_collection_name(avatar_id))
    except Exception:
        pass
