import os
import threading
from dotenv import load_dotenv

load_dotenv()

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
            
            # Load keys from GEMINI_API_KEY_1, GEMINI_API_KEY_2, etc.
            idx = 1
            while True:
                key = os.getenv(f"GEMINI_API_KEY_{idx}")
                if not key:
                    # check up to index 10 to ensure we don't skip if there is a gap or if only 1 exists
                    if idx > 10:
                        break
                    idx += 1
                    continue
                key = key.strip().strip('"').strip("'")
                if key and key not in self._keys:
                    self._keys.append(key)
                idx += 1
            
            # Fallback to GEMINI_API_KEY if no indexed keys found
            primary = os.getenv("GEMINI_API_KEY")
            if primary:
                primary = primary.strip().strip('"').strip("'")
                if primary and primary not in self._keys:
                    self._keys.insert(0, primary)
            
            self._current_index = 0
            self._initialized = True
            
            if not self._keys:
                print("[GeminiProviderManager] Warning: No Gemini API keys found in environment.")
            else:
                print(f"[GeminiProviderManager] Initialized with {len(self._keys)} keys.")

    def get_current_key(self) -> str:
        with self._lock:
            if not self._keys:
                # Fallback to direct environment read if empty
                primary = os.getenv("GEMINI_API_KEY")
                return primary.strip().strip('"').strip("'") if primary else ""
            return self._keys[self._current_index]

    def rotate_key(self) -> str:
        with self._lock:
            if not self._keys:
                return ""
            self._current_index = (self._current_index + 1) % len(self._keys)
            print("[Gemini] Rotating API key due to quota limit")
            print(f"[Gemini] Using API key index: {self._current_index}")
            return self._keys[self._current_index]

    def get_current_index(self) -> int:
        with self._lock:
            return self._current_index

    def get_keys_count(self) -> int:
        with self._lock:
            return len(self._keys)
