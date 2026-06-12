import os
import json
import sqlite3
import redis.asyncio as aioredis

class RedisMemoryService:
    # Class-level flag to share Redis availability status across all instances and connections.
    # Once it fails once, it will bypass Redis immediately to ensure 0ms latency impact.
    _redis_available = True

    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis_url = redis_url
        self._redis_client = None

    def get_client(self):
        if self._redis_client is None:
            # Set ultra-fast timeouts (50ms) to ensure zero impact on voice pipeline hot path.
            self._redis_client = aioredis.from_url(
                self.redis_url, 
                socket_timeout=0.05, 
                socket_connect_timeout=0.05, 
                decode_responses=True,
                protocol=2
            )
        return self._redis_client

    async def fetch_session_context(self, session_id: str, limit: int = 20) -> list[dict]:
        """
        Fetch last `limit` messages for the session from Redis.
        If Redis is missing the key, restore from SQLite DB.
        If Redis is unavailable, fall back to SQLite DB directly.
        """
        if not session_id:
            return []

        key = f"session:{session_id}:messages"
        
        # 1. Attempt to fetch from Redis if available
        if RedisMemoryService._redis_available:
            try:
                client = self.get_client()
                # Get the last `limit` messages.
                json_msgs = await client.lrange(key, -limit, -1)
                if json_msgs:
                    # Successfully fetched from Redis!
                    return [json.loads(m) for m in json_msgs]
                else:
                    # Key does not exist in Redis, restore from DB
                    print(f"[MemoryService] Redis cache miss for {key}, attempting DB restore.")
                    messages = self._restore_from_db(session_id, limit)
                    if messages:
                        # Non-blocking background save to Redis
                        import asyncio
                        asyncio.create_task(self._populate_redis_cache(key, messages))
                    return messages
            except Exception as e:
                # Mark as globally unavailable to speed up all subsequent queries instantly
                print(f"[MemoryService] Redis connection failed (global fallback to DB active): {e}")
                RedisMemoryService._redis_available = False
                return self._restore_from_db(session_id, limit)
        else:
            # Redis is marked unavailable, fetch from DB
            return self._restore_from_db(session_id, limit)

    async def save_message(self, session_id: str, role: str, message: str):
        """
        Push message to Redis cache with 24h TTL.
        Non-blocking and ignores exceptions if Redis is down.
        """
        if not session_id or not RedisMemoryService._redis_available:
            return

        key = f"session:{session_id}:messages"
        msg_payload = json.dumps({"role": role, "message": message})
        
        try:
            client = self.get_client()
            # Push message and set TTL
            pipe = client.pipeline()
            pipe.rpush(key, msg_payload)
            pipe.expire(key, 86400) # 24 hours
            await pipe.execute()
        except Exception as e:
            print(f"[MemoryService] Redis save failed (marking global fallback): {e}")
            RedisMemoryService._redis_available = False

    async def _populate_redis_cache(self, key: str, messages: list[dict]):
        """Helper to populate Redis cache with a list of messages and TTL."""
        if not RedisMemoryService._redis_available:
            return
            
        try:
            client = self.get_client()
            pipe = client.pipeline()
            # Clear key first in case of partial data
            pipe.delete(key)
            for m in messages:
                pipe.rpush(key, json.dumps(m))
            pipe.expire(key, 86400)
            await pipe.execute()
            print(f"[MemoryService] Successfully warmed Redis cache for key: {key}")
        except Exception as e:
            print(f"[MemoryService] Failed to warm Redis cache: {e}")
            RedisMemoryService._redis_available = False

    def _restore_from_db(self, session_id: str, limit: int) -> list[dict]:
        """Query the SQLite database for the last N messages of this session."""
        try:
            session_id_int = int(session_id)
        except ValueError:
            # If session_id is a UUID string, it doesn't exist in DB, so return empty
            return []

        # Find DB path
        _HERE = os.path.dirname(os.path.abspath(__file__))
        db_path = os.path.abspath(os.path.join(_HERE, "..", "Backend", "pratibimb.db"))
        if not os.path.exists(db_path):
            return []

        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        try:
            cursor = conn.execute(
                """
                SELECT role, message
                FROM conversation_messages
                WHERE session_id = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (session_id_int, limit)
            )
            rows = cursor.fetchall()
            # Reverse DESC order back to chronological
            messages = [{"role": row["role"], "message": row["message"]} for row in reversed(rows)]
            return messages
        except Exception as e:
            print(f"[MemoryService] SQLite restore failed: {e}")
            return []
        finally:
            conn.close()
