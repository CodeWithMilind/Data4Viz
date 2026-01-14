import os
import requests


GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"


class GroqAPIError(Exception):
    pass


def get_groq_headers() -> dict:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise GroqAPIError(
            "Groq API key not found. "
            "Set GROQ_API_KEY as an environment variable."
        )
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def generate_chat_completion(system_message: str, user_message: str, max_tokens: int = 300) -> str:
    """
    Call Groq chat completions API and return the assistant's reply.
    """
    headers = get_groq_headers()
    payload = {
        "model": "llama-3.1-8b-instant",
        "messages": [
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_message},
        ],
        "temperature": 0.3,
        "max_tokens": max_tokens,
    }

    try:
        response = requests.post(GROQ_API_URL, headers=headers, json=payload, timeout=60)
    except requests.RequestException as exc:
        raise GroqAPIError(f"Request to Groq API failed: {exc}") from exc

    if response.status_code != 200:
        try:
            error_info = response.json()
        except ValueError:
            error_info = response.text
        raise GroqAPIError(f"Groq API error {response.status_code}: {error_info}")

    data = response.json()
    choices = data.get("choices")

    if isinstance(choices, list) and choices:
        first = choices[0]
        message = first.get("message") if isinstance(first, dict) else None
        content = message.get("content") if isinstance(message, dict) else None
        if isinstance(content, str):
            return content.strip()

    raise GroqAPIError("Unexpected response format from Groq API.")

