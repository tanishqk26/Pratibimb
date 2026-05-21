import asyncio
from google import genai
from google.genai import types

MAX_RETRIES = 3
RETRY_DELAY = 2.0

# BCP-47 codes Sarvam returns → natural language names for Gemini
LANG_NAMES: dict[str, str] = {
    "hi-IN": "Hindi",
    "mr-IN": "Marathi",
    "en-IN": "English",
    "ta-IN": "Tamil",
    "te-IN": "Telugu",
    "kn-IN": "Kannada",
    "ml-IN": "Malayalam",
    "gu-IN": "Gujarati",
    "pa-IN": "Punjabi",
    "bn-IN": "Bengali",
    "od-IN": "Odia",
}

DEFAULT_PROMPT = """
You are Pratibimb, a digital AI twin assistant.
Speak conversationally and briefly.
Keep replies under 3 sentences.
ALWAYS reply in the SAME LANGUAGE the user speaks to you in.
"""

def build_system_prompt(twin: dict) -> str:
    if not twin or not twin.get("name"):
        return DEFAULT_PROMPT

    name        = twin.get("name", "Pratibimb")
    age         = twin.get("age")
    gender      = twin.get("gender", "")
    profession  = twin.get("profession", "")
    description = twin.get("description", "")
    traits      = twin.get("personality_traits", "")
    interests   = twin.get("interests", "")

    prompt = f"""You are {name}, a digital AI twin.

IDENTITY:
- Name: {name}
"""
    if age:       prompt += f"- Age: {age}\n"
    if gender:    prompt += f"- Gender: {gender}\n"
    if profession:prompt += f"- Profession: {profession}\n"

    if description:
        prompt += f"\nBACKGROUND:\n{description}\n"

    if traits:
        prompt += f"\nPERSONALITY TRAITS:\n{traits}\n"

    if interests:
        prompt += f"\nINTERESTS:\n{interests}\n"

    prompt += f"""
RULES:
- Always speak as {name} in the first person.
- Stay in character at all times.
- Be conversational, warm, and concise.
- Keep replies under 3 sentences unless asked for detail.
- Never break character or refer to yourself as an AI or language model.
- ALWAYS reply in the SAME LANGUAGE the user speaks to you in.
  If the user writes in Hindi, reply in Hindi.
  If the user writes in Marathi, reply in Marathi.
  If the user writes in English, reply in English.
"""
    return prompt


class GeminiEngine:

    def __init__(self, api_key):
        self.client = genai.Client(api_key=api_key)
        self.model = "gemini-2.5-flash"
        self._system_prompt = DEFAULT_PROMPT
        self._rebuild_config()

    def _rebuild_config(self):
        self.config = types.GenerateContentConfig(
            system_instruction=self._system_prompt
        )

    def set_twin(self, twin: dict):
        """Dynamically configure the system prompt from twin profile data."""
        self._system_prompt = build_system_prompt(twin)
        self._rebuild_config()
        print(f"[Gemini] System prompt set for twin: {twin.get('name', '?')}")

    async def generate_stream(self, text: str, lang_code: str = "en-IN"):
        """Stream a response from Gemini, replying in the detected language."""
        lang_name = LANG_NAMES.get(lang_code, "English")
        # Prepend a deterministic language instruction to the user content.
        # Doing it here (not system prompt) ensures it reflects per-utterance detection.
        content = f"[LANGUAGE INSTRUCTION: Respond only in {lang_name}]\n{text}"

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = await self.client.aio.models.generate_content_stream(
                    model=self.model,
                    contents=content,
                    config=self.config
                )
                async for chunk in response:
                    if chunk.text:
                        yield chunk.text
                return

            except Exception as e:
                print(f"[Gemini] Error (attempt {attempt}/{MAX_RETRIES}): {e}")
                if attempt == MAX_RETRIES:
                    yield "I'm having trouble reaching my brain right now."
                    return
                await asyncio.sleep(RETRY_DELAY * attempt)