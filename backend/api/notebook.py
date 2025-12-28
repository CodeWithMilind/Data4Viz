from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..core.context import ContextManager
from ..services.notebook import NotebookService

router = APIRouter()

class NotebookRequest(BaseModel):
    code: str
    dataset_id: Optional[str] = None

@router.post("/notebook/execute")
async def execute_code(request: NotebookRequest):
    """
    Executes Python code in the context of the dataset.
    """
    try:
        context = None
        if request.dataset_id:
            context = ContextManager.get_context(request.dataset_id)
        
        if not context:
            context = ContextManager.get_latest_context()
            
        if not context:
            raise HTTPException(status_code=400, detail="No active dataset session.")
            
        result = NotebookService.execute_cell(context, request.code)
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
