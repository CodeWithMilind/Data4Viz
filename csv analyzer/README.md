# CSV Analyzer (MVP)

Minimal CSV Analyzer MVP with:
- Frontend: Next.js (App Router, Tailwind)
- Backend: FastAPI (Python)
- Local LLM: Ollama (llama3)

No authentication, no database, no paid APIs.

## Project Structure

```text
csv-analyzer/
├── backend/
│   ├── main.py
│   ├── llm.py
│   ├── prompts.py
│   ├── csv_utils.py
│   ├── viz.py
│   └── requirements.txt
├── frontend/
│   ├── app/
│   ├── components/ (not used yet)
│   ├── styles/ (merged into app/globals.css)
│   └── package.json
└── README.md
```

## Prerequisites

- Python 3.10+
- Node.js 18+
- Ollama installed locally and the `llama3` model pulled  
  ```bash
  ollama pull llama3
  ```

## Backend Setup (FastAPI)

From the `backend` directory:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The backend exposes:
- `POST /upload` – upload a CSV, returns `dataset_id`
- `POST /chat` – send a question about the dataset
- `POST /plot` – request a simple plot (scatter/line/bar)
- `GET /plot/{image_name}` – serve saved plot images
- `GET /health` – health check

## Frontend Setup (Next.js)

From the `frontend` directory:

```bash
cd frontend
npm install
npm run dev
```

Then open `http://localhost:3000`.

The frontend expects the backend at `http://localhost:8000`.  
If you change the backend port, update `API_BASE` in:
- `frontend/app/page.tsx`

## Usage Flow

1. Start the backend (FastAPI + Ollama).
2. Start the frontend (Next.js dev server).
3. In the UI:
   - Upload a CSV file (left panel).
   - Wait for it to load (file name appears).
   - Ask questions in the chat (right panel), for example:
     - "Summarize this dataset"
     - "What are the numeric columns?"
     - "Plot age vs income"
4. For plot-like questions, the app:
   - Sends the natural-language question to the LLM (`/chat`).
   - Tries to detect `plot x vs y` pattern and calls `/plot`.
   - Displays both the text response and the generated plot image.

## Notes and Limitations

- CSVs are stored only in memory and cleared when the backend restarts.
- Plots are saved as PNG files under `backend/plots/`.
- LLM calls are done via local Ollama CLI using the `llama3` model.
- This is a minimal MVP focused on feedback, not production hardening.

