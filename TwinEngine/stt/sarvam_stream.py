class SarvamSTT:

    def __init__(self, client):

        self.client = client
        self.ws = None
        self.ctx = None
        self._last_transcript = ""      # dedup guard
        self._last_sent_hash = None     # dedup guard for pipeline
        self._detected_language = "en-IN"  # last confirmed detected language

    async def connect(self, language_codes: list[str] | None = None):
        """
        Connect to Sarvam STT streaming.

        language_codes: optional list of BCP-47 codes the twin should recognise.
            - If exactly one code → lock STT to that language.
            - If multiple or empty/None → use 'unknown' (auto-detect all).
        """
        self._language_codes = language_codes  # keep for filtering in receive()

        # Sarvam streaming accepts a single language_code string.
        # With one language we can pin it; otherwise auto-detect.
        if language_codes and len(language_codes) == 1:
            lang = language_codes[0]
        else:
            lang = "unknown"

        self.ctx = self.client.speech_to_text_streaming.connect(
            model="saarika:v2.5",
            mode="transcribe",
            language_code=lang,
            sample_rate=16000,
            high_vad_sensitivity=True
        )

        self.ws = await self.ctx.__aenter__()
        label = lang if lang != "unknown" else f"auto-detect ({', '.join(language_codes)})" if language_codes else "auto-detect (all)"
        print(f"✅ Connected to Sarvam STT ({label})")

    async def send_audio(self, audio):

        if self.ws is None:
            return

        try:
            await self.ws.transcribe(audio=audio)
        except Exception as e:
            print(f"[STT] send_audio error: {e}")

    async def receive(self):
        """
        Returns the next UNIQUE, non-empty transcript as a (text, lang_code) tuple.
        lang_code is the BCP-47 code Sarvam detected (e.g. 'hi-IN', 'mr-IN', 'en-IN').
        Falls back to the last successfully detected language if not present in response.
        """
        while True:
            try:
                data = await self.ws.recv()
            except Exception as e:
                print(f"[STT] receive error: {e}")
                raise

            if not (hasattr(data, "data") and hasattr(data.data, "transcript")):
                continue

            text = (data.data.transcript or "").strip()

            if not text:
                continue

            # Drop exact duplicates (Sarvam sometimes re-sends the same string)
            if text == self._last_transcript:
                continue

            self._last_transcript = text

            # Extract detected language; fall back to last known value
            lang_code = getattr(data.data, "language_code", None) or self._detected_language
            self._detected_language = lang_code

            print(f"[STT] Detected language: {lang_code}")
            return text, lang_code

    async def close(self):

        if self.ctx:
            try:
                await self.ctx.__aexit__(None, None, None)
            except Exception:
                pass