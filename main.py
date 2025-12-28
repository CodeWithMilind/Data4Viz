from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
import shutil
import os
import uuid

# Import our custom modules
from backend.services.analysis import AnalysisService
from backend.core.intent import IntentEngine

app = FastAPI(title="Data4Viz AI Workbench")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directories
UPLOAD_DIR = "uploads"
OUTPUT_DIR = "outputs"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Mount Static Files
# Frontend files
app.mount("/static", StaticFiles(directory="frontend"), name="static")
# Generated outputs (reports)
app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")

# Services
analysis_service = AnalysisService(OUTPUT_DIR)
intent_engine = IntentEngine()

# State
current_file_path = None

@app.get("/")
async def read_root():
    return RedirectResponse(url="/static/index.html")

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    global current_file_path
    try:
        # Save file
        file_ext = file.filename.split(".")[-1]
        filename = f"{uuid.uuid4()}.{file_ext}"
        file_path = os.path.join(UPLOAD_DIR, filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        current_file_path = file_path
        
        # Get basic columns immediately
        stats = analysis_service.generate_basic_stats(file_path)
        
        return {
            "status": "success",
            "filename": file.filename,
            "file_id": filename,
            "columns": stats.get("data", {}).get("columns", [])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat")
async def chat_assistant(query: str = Form(...)):
    global current_file_path
    
    if not current_file_path:
        return {"response": "Please upload a dataset first.", "action": "none"}
        
    intent = intent_engine.determine_intent(query)
    
    result = {}
    if intent == "sweetviz":
        result = analysis_service.generate_sweetviz_report(current_file_path)
    elif intent == "basic_stats":
        result = analysis_service.generate_basic_stats(current_file_path)
    elif intent == "autoviz":
        result = analysis_service.generate_autoviz_plots(current_file_path)
    else:
        return {
            "response": "I'm not sure what to do with that. Try asking for an 'EDA report', 'basic stats', or 'plots'.",
            "action": "none"
        }
        
    return {
        "response": f"I detected intent: {intent}. Here is the result.",
        "action": intent,
        "data": result
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
