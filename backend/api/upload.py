from fastapi import APIRouter, UploadFile, File, HTTPException
import shutil
import os
import uuid
from ..data_utils.loader import DataLoader
from ..core.context import ContextManager, DatasetContext
from ..services.analysis import AnalysisService

router = APIRouter()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Handles CSV upload, loads the dataset, and returns an immediate summary.
    """
    try:
        # Generate ID and save file
        dataset_id = str(uuid.uuid4())
        file_path = os.path.join(UPLOAD_DIR, f"{dataset_id}.csv")
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Load dataset
        df = DataLoader.load_csv(file_path)
        if df is None:
            raise HTTPException(status_code=400, detail="Failed to load CSV file.")
            
        # Create Context
        context = DatasetContext(
            dataset_id=dataset_id,
            file_path=file_path,
            df=df
        )
        ContextManager.set_context(context)
        
        # Generate immediate summary
        summary = AnalysisService.get_summary(context)
        
        return {
            "message": "File uploaded successfully",
            "dataset_id": dataset_id,
            "filename": file.filename,
            "file_path": file_path,
            "summary": summary
        }
        
    except Exception as e:
        print(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
