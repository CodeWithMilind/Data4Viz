from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn
import os

# Import new routers
from backend.api import upload, chat, notebook, dataset, visualization

app = FastAPI(title="Data4Viz - AI Workbench")

# Add CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure directories exist
os.makedirs("uploads", exist_ok=True)
os.makedirs("outputs", exist_ok=True)

# Include Routers
app.include_router(upload.router, prefix="/api", tags=["Upload"])
app.include_router(chat.router, prefix="/api", tags=["Chat"])
app.include_router(notebook.router, prefix="/api", tags=["Notebook"])
app.include_router(dataset.router, prefix="/api", tags=["Dataset"])
app.include_router(visualization.router, prefix="/api", tags=["Visualization"])

# Mount Static Files
app.mount("/static", StaticFiles(directory="frontend"), name="static")
app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")

@app.get("/")
async def read_root():
    return FileResponse("frontend/index.html")

@app.get("/styles.css")
async def styles():
    return FileResponse("frontend/styles.css")

@app.get("/app.js")
async def app_js():
    return FileResponse("frontend/app.js")

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
