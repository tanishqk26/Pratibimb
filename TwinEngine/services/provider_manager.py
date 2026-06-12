import os
import time
import threading
from dotenv import load_dotenv

load_dotenv()

# Per-key cooldown after a 429 — skip this key for this many seconds
_KEY_COOLDOWN_SECONDS = 60.0


class GeminiProviderManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(GeminiProviderManager, cls).__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self):
        with self._lock:
            if getattr(self, '_initialized', False):
                return
            self._keys = []
            # _cooldowns[key] = monotonic timestamp when cooldown expires (0 = available)
            self._cooldowns: dict[str, float] = {}

            # Load keys from GEMINI_API_KEY_1, GEMINI_API_KEY_2, etc.
            idx = 1
            while True:
                key = os.getenv(f"GEMINI_API_KEY_{idx}")
                if not key:
                    if idx > 10:
                        break
                    idx += 1
                    continue
                key = key.strip().strip('"').strip("'")
                if key and key not in self._keys:
                    self._keys.append(key)
                    self._cooldowns[key] = 0.0
                idx += 1

            # Fallback to GEMINI_API_KEY if no indexed keys found
            primary = os.getenv("GEMINI_API_KEY")
            if primary:
                primary = primary.strip().strip('"').strip("'")
                if primary and primary not in self._keys:
                    self._keys.insert(0, primary)
                    self._cooldowns[primary] = 0.0

            self._current_index = 0
            self._initialized = True

            if not self._keys:
                print("[GeminiProviderManager] Warning: No Gemini API keys found in environment.")
            else:
                print(f"[GeminiProviderManager] Initialized with {len(self._keys)} keys.")

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _is_key_available(self, key: str) -> bool:
        """Return True if the key is not in cooldown."""
        return time.monotonic() >= self._cooldowns.get(key, 0.0)

    def _first_available_index(self) -> int | None:
        """Return index of first available (non-cooled-down) key, or None."""
        now = time.monotonic()
        for i, key in enumerate(self._keys):
            if now >= self._cooldowns.get(key, 0.0):
                return i
        return None  # all keys cooling down

    # ── Public API ────────────────────────────────────────────────────────────

    def get_current_key(self) -> str:
        with self._lock:
            if not self._keys:
                primary = os.getenv("GEMINI_API_KEY")
                return primary.strip().strip('"').strip("'") if primary else ""
            return self._keys[self._current_index]

    def mark_key_exhausted(self, key: str | None = None) -> str:
        """
        Mark the given key (or the current key) as rate-limited.
        Puts it on cooldown and rotates to the next available key.
        Returns the new active key (empty string if all are cooling down).
        """
        with self._lock:
            if not self._keys:
                return ""

            target = key or self._keys[self._current_index]
            self._cooldowns[target] = time.monotonic() + _KEY_COOLDOWN_SECONDS
            print(f"[Gemini] Key ...{target[-6:]} marked exhausted — cooldown {_KEY_COOLDOWN_SECONDS:.0f}s")

            # Find next available key
            available_idx = self._first_available_index()
            if available_idx is None:
                # All keys cooling — stay on current, caller must handle
                print("[Gemini] ⚠ All API keys are in cooldown!")
                return ""

            self._current_index = available_idx
            new_key = self._keys[self._current_index]
            print(f"[Gemini] Rotated to key index {self._current_index} (...{new_key[-6:]})")
            return new_key

    def rotate_key(self) -> str:
        """
        Legacy round-robin rotation (backwards compat).
        Prefer mark_key_exhausted() for 429 handling.
        """
        with self._lock:
            if not self._keys:
                return ""
            self._current_index = (self._current_index + 1) % len(self._keys)
            print(f"[Gemini] Rotating API key — now using index: {self._current_index}")
            return self._keys[self._current_index]

    def all_keys_exhausted(self) -> bool:
        """Return True if every key is currently in cooldown."""
        with self._lock:
            return self._first_available_index() is None

    def get_current_index(self) -> int:
        with self._lock:
            return self._current_index

    def get_keys_count(self) -> int:
        with self._lock:
            return len(self._keys)
