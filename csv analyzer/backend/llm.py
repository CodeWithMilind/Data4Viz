import subprocess
import json
from typing import Optional

from prompts import build_prompt


def _call_ollama(prompt: str, model: str = "llama3") -> str:
    try:
        result = subprocess.run(
            ["ollama", "run", model],
            input=prompt.encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
            timeout=60,
        )
    except FileNotFoundError:
        return "Ollama is not installed or not available on PATH."
    except subprocess.TimeoutExpired:
        return "Ollama call timed out. Make sure Ollama is running and responsive."
    except subprocess.CalledProcessError as exc:
        return f"Ollama call failed: {exc.stderr.decode('utf-8', errors='ignore')}"

    output = result.stdout.decode("utf-8", errors="ignore")
    return output.strip()


def ask_llm(metadata: str, question: str, model: str = "llama3") -> str:
    prompt = build_prompt(metadata, question)
    answer = _call_ollama(prompt, model=model)
    return answer
