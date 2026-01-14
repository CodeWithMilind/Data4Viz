# Ollama Chatbot (FastAPI + Plain JS)

Minimal local web chatbot that talks to a model running in Ollama.

## Prerequisites

- Python 3.9+ installed
- Ollama installed and working
- Command `ollama run llama3` works (or `phi3` as fallback)

## 1. Start Ollama

In a terminal:

```bash
ollama serve
```

In another terminal, pull the model (if not already done):

```bash
ollama pull llama3
```

If `llama3` is not available, pull the fallback model:

```bash
ollama pull phi3
```

By default Ollama listens on `http://localhost:11434`.

## 2. Set up and start the backend (FastAPI)

From the `ollama-chatbot/backend` folder:

```bash
cd ollama-chatbot/backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

This starts the FastAPI server at `http://localhost:8000`.

### Test the backend with curl

With Ollama running and the backend server started:

```bash
curl -X POST http://localhost:8000/chat ^
  -H "Content-Type: application/json" ^
  -d "{\"message\": \"Hello from curl\"}"
```

On non-Windows shells the command is:

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello from curl"}'
```

## 3. Open the frontend

The frontend is plain HTML/JS/CSS. The simplest way is to open the file directly.

1. Make sure the backend is running on `http://localhost:8000`.
2. Open `ollama-chatbot/frontend/index.html` in your browser (double-click or use `Open With` → your browser).
3. Type a message and press **Send**.

The page will:

- Show your message in the chat window.
- Display “Thinking…” while waiting for the backend.
- Show the model response when it arrives.
