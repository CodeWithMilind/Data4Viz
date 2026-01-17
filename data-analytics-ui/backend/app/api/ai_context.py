"""
AI Context API endpoints for Data4Viz.

Provides AI-friendly context bundles without raw data.
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Dict, Any, Optional
import logging

from app.services.ai_context import generate_ai_context_bundle
from app.services.dataset_loader import dataset_exists

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dataset", tags=["ai-context"])


class AIContextResponse(BaseModel):
    """Response model for AI context bundle."""
    workspace_id: str
    dataset_id: str
    generated_at: str
    schema: Dict[str, Any]
    logs: Dict[str, Any]
    dataset_summary: Dict[str, Any]


@router.get("/{dataset_id}/ai-context", response_model=AIContextResponse)
async def get_ai_context(
    dataset_id: str,
    workspace_id: str = Query(..., description="Workspace identifier")
):
    """
    Get AI context bundle for a dataset.
    
    Returns a bundle containing:
    - schema.json: Column schema and metadata (no raw data)
    - logs.json: Operation logs (no raw data)
    - dataset_summary.json: Dataset quality metrics (no raw data)
    
    IMPORTANT: This endpoint does NOT return raw data values.
    Only metadata, statistics, and operation history are included.
    
    Args:
        dataset_id: Dataset filename
        workspace_id: Workspace identifier
        
    Returns:
        AI context bundle with schema, logs, and dataset summary
    """
    try:
        # Verify dataset exists
        if not dataset_exists(dataset_id, workspace_id):
            raise HTTPException(
                status_code=404,
                detail=f"Dataset '{dataset_id}' not found in workspace '{workspace_id}'"
            )
        
        # Generate context bundle
        bundle = generate_ai_context_bundle(workspace_id, dataset_id)
        
        if not bundle:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to generate AI context bundle for dataset '{dataset_id}'"
            )
        
        logger.info(
            f"Generated AI context bundle for dataset '{dataset_id}' in workspace '{workspace_id}'"
        )
        
        return AIContextResponse(**bundle)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting AI context for dataset '{dataset_id}': {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get AI context: {str(e)}"
        )
