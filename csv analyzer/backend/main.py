from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import csv_utils, llm, viz

app = FastAPI(title="CSV Analyzer Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    content = await file.read()
    dataset_id = csv_utils.store_csv_in_memory(content, file.filename)
    return {"dataset_id": dataset_id, "filename": file.filename}


@app.post("/chat")
async def chat(payload: dict):
    # Extract question and optional dataset_id from the request payload.
    dataset_id = payload.get("dataset_id")
    question_raw = payload.get("question") or ""
    question = question_raw.strip()

    if not question:
        raise HTTPException(status_code=400, detail="question is required")

    # Lightweight routing for plot-like commands in chat.
    # For now we short-circuit and return a message instead of calling the LLM.
    lowered = question.lower()
    if "plot" in lowered or lowered.startswith("/plot"):
        return {
            "answer": (
                "Plotting support inside the chat is under development. "
                "You can still try natural-language plot requests, but "
                "the dedicated plotting tools will be improved later."
            )
        }

    # Build dataset metadata if a valid dataset is available.
    metadata = ""
    if dataset_id:
        df = csv_utils.get_dataset(dataset_id)
        if df is not None:
            metadata = csv_utils.build_dataset_metadata(df)
        else:
            metadata = (
                "No dataset was found for the provided dataset_id. "
                "Answer in general terms and mention that the dataset "
                "could not be located."
            )

    # Call the LLM through Ollama and always return a safe text answer.
    try:
        answer = llm.ask_llm(metadata, question)
    except Exception as exc:
        answer = f"LLM call failed unexpectedly: {exc}"

    return {"answer": answer}


@app.post("/plot")
async def plot(payload: dict):
    dataset_id = payload.get("dataset_id")
    x = payload.get("x")
    y = payload.get("y")
    kind = payload.get("kind", "scatter")

    if not dataset_id or not x or not y:
        raise HTTPException(status_code=400, detail="dataset_id, x and y are required")

    df = csv_utils.get_dataset(dataset_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Dataset not found")

    image_path = viz.create_plot(df, x, y, kind)
    return {"image_path": image_path}


@app.get("/plot/{image_name}")
async def get_plot(image_name: str):
    path = viz.get_plot_path(image_name)
    return FileResponse(path)


@app.get("/health")
async def health():
    return {"status": "ok"}
