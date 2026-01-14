from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    response: str


app = FastAPI(title="Ollama Chatbot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


OLLAMA_URL = "http://localhost:11434/api/generate"
PRIMARY_MODEL = "phi3"
FALLBACK_MODEL = "phi3"


def generate_with_model(prompt: str, model: str) -> str:
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
    }
    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=60)
    except requests.exceptions.ConnectionError:
        raise HTTPException(
            status_code=503,
            detail="Cannot connect to Ollama. Make sure it is running on localhost:11434.",
        )
    except requests.exceptions.RequestException:
        raise HTTPException(
            status_code=502,
            detail="Error while communicating with Ollama.",
        )

    if response.status_code == 404:
        raise HTTPException(
            status_code=404,
            detail=f"Model '{model}' not found in Ollama.",
        )

    if not response.ok:
        raise HTTPException(
            status_code=502,
            detail="Unexpected response from Ollama.",
        )

    data = response.json()
    if "response" not in data:
        raise HTTPException(
            status_code=502,
            detail="Ollama response missing 'response' field.",
        )

    return data["response"]


@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    message = (request.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    try:
        try:
            text = generate_with_model(message, PRIMARY_MODEL)
        except HTTPException as exc:
            if exc.status_code == 404:
                text = generate_with_model(message, FALLBACK_MODEL)
            else:
                raise
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Unexpected error while generating a response.",
        )

    return ChatResponse(response=text)


@app.get("/health")
def health():
    return {"status": "ok"}

