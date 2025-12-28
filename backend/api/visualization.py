from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..core.context import ContextManager
from ..services.visualization import VisualizationService

router = APIRouter()

class PlotRequest(BaseModel):
    dataset_id: str
    plot_type: str
    x_column: str
    y_column: Optional[str] = None
    aggregation: Optional[str] = None

@router.post("/visualize")
async def create_visualization(request: PlotRequest):
    """
    Generates a plot based on explicit parameters.
    """
    context = ContextManager.get_context(request.dataset_id)
    if not context:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    image_base64 = VisualizationService.generate_plot(
        context, 
        request.plot_type, 
        request.x_column, 
        request.y_column,
        request.aggregation
    )
    
    if not image_base64:
        raise HTTPException(status_code=400, detail="Could not generate plot. Check column names and data types.")
        
    return {"image": image_base64}
