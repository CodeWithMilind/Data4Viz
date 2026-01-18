"""
Decision-Driven EDA API.

Backend endpoint that computes statistics ONLY.
No explanations, no recommendations, no ML models.
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
import logging

from app.services.decision_eda_service import compute_decision_eda_stats
from app.services.dataset_loader import dataset_exists

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/decision-eda", tags=["decision-eda"])


class DecisionEDARequest(BaseModel):
    workspace_id: str
    dataset_id: str
    decision_metric: str


class DecisionEDAResponse(BaseModel):
    decision_metric: str
    total_rows: int
    valid_rows: int
    missing_percentage: float
    outlier_count: int
    outlier_percentage: float
    top_factors: list
    all_correlations: list
    all_segment_impacts: list
    decision_metric_stats: dict


@router.post("", response_model=DecisionEDAResponse)
async def compute_decision_eda(
    request: DecisionEDARequest
):
    """
    Compute decision-driven EDA statistics.
    
    BACKEND RESPONSIBILITIES:
    - Computes ONLY statistics (correlations, segment differences, missing values, outliers)
    - Ranks factors by impact score
    - Outputs compact summary
    
    NO explanations, NO recommendations, NO ML models.
    """
    if not dataset_exists(request.dataset_id, request.workspace_id):
        raise HTTPException(
            status_code=404,
            detail=f"Dataset '{request.dataset_id}' not found in workspace '{request.workspace_id}'"
        )
    
    try:
        stats = compute_decision_eda_stats(
            request.workspace_id,
            request.dataset_id,
            request.decision_metric
        )
        
        logger.info(
            f"[decision-eda] Computed stats for {request.decision_metric} "
            f"in dataset {request.dataset_id} (workspace {request.workspace_id})"
        )
        
        return DecisionEDAResponse(**stats)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[decision-eda] Error computing stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to compute statistics: {str(e)}")
