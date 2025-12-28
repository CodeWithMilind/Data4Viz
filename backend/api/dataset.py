from fastapi import APIRouter, HTTPException
from ..core.context import ContextManager
from ..services.analysis import AnalysisService

router = APIRouter()

@router.get("/dataset/{dataset_id}/summary")
async def get_dataset_summary(dataset_id: str):
    context = ContextManager.get_context(dataset_id)
    if not context:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    return AnalysisService.get_summary(context)
