import os

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

def get_embedding(text: str) -> list[float]:
    """
    Generate an embedding using sentence-transformers all-MiniLM-L6-v2 (padded to 1536).
    """
    if should_skip_embedding(text):
        print("[Embedding] Skipped low-value utterance")
        raise ValueError("Skipped low-value utterance")

    model = _get_local_model()
    # Compute local embedding
    emb = model.encode(text).tolist()
    print("[Embedding] Generated local embedding")
    
    # Pad to 1536 dimensions to preserve SQLite DB / schema compatibility
    if len(emb) < 1536:
        emb = emb + [0.0] * (1536 - len(emb))
    return emb

def chunk_text(text: str, chunk_size_words: int = 400, chunk_overlap_words: int = 100) -> list[str]:
    """
    Safely split long memory text into smaller chunks with overlap based on words.
    """
    if not text:
        return []
    
    words = text.split()
    if len(words) <= chunk_size_words:
        return [text]
    
    chunks = []
    step = chunk_size_words - chunk_overlap_words
    if step <= 0:
        step = chunk_size_words // 2
        
    for i in range(0, len(words), step):
        chunk_words = words[i:i + chunk_size_words]
        chunks.append(" ".join(chunk_words))
        if i + chunk_size_words >= len(words):
            break
            
    return chunks
