"""
Decision-Driven EDA API.

Backend endpoint that computes statistics ONLY.
No explanations, no recommendations, no ML models.
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, Dict, Any
import logging

from app.services.decision_eda_service import compute_decision_eda_stats
from app.services.dataset_loader import dataset_exists
from app.services.insight_storage import (
    save_insight_snapshot,
    load_insight_snapshot,
    is_dataset_changed,
    get_all_versions,
    delete_all_insight_versions,
)

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


class SaveInsightsRequest(BaseModel):
    workspace_id: str
    dataset_id: str
    decision_metric: str
    backend_stats: Dict[str, Any]
    insights: Dict[str, Any]


@router.post("/insights")
async def save_insights(request: SaveInsightsRequest):
    """
    Save insight snapshot to disk.
    Internal endpoint - not exposed to users.
    """
    try:
        version = save_insight_snapshot(
            request.workspace_id,
            request.dataset_id,
            request.decision_metric,
            request.backend_stats,
            request.insights
        )
        
        return {"success": True, "version": version}
    except Exception as e:
        logger.error(f"[decision-eda] Error saving insights: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save insights: {str(e)}")


@router.get("/insights/{workspace_id}/{dataset_id}/{decision_metric}")
async def get_insights(
    workspace_id: str,
    dataset_id: str,
    decision_metric: str
):
    """
    Load insight snapshot from disk.
    Internal endpoint - not exposed to users.
    """
    try:
        snapshot = load_insight_snapshot(workspace_id, dataset_id, decision_metric)
        
        if not snapshot:
            raise HTTPException(status_code=404, detail="Insight snapshot not found")
        
        return snapshot
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[decision-eda] Error loading insights: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load insights: {str(e)}")


class CheckDatasetChangeRequest(BaseModel):
    workspace_id: str
    dataset_id: str
    stored_hash: str


@router.post("/check-dataset-change")
async def check_dataset_change(request: CheckDatasetChangeRequest):
    """
    Check if dataset has changed since snapshot was created.
    Internal endpoint - not exposed to users.
    """
    try:
        changed = is_dataset_changed(
            request.workspace_id,
            request.dataset_id,
            request.stored_hash
        )
        
        return {"changed": changed}
    except Exception as e:
        logger.error(f"[decision-eda] Error checking dataset change: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to check dataset change: {str(e)}")


class DeleteInsightsRequest(BaseModel):
    workspace_id: str
    dataset_id: str
    decision_metric: str


@router.post("/insights/delete")
async def delete_insights(request: DeleteInsightsRequest):
    """
    Delete all insight snapshots for a dataset/metric combination.
    Internal endpoint - used during regeneration.
    """
    try:
        deleted_count = delete_all_insight_versions(
            request.workspace_id,
            request.dataset_id,
            request.decision_metric
        )
        
        return {"success": True, "deleted_count": deleted_count}
    except Exception as e:
        logger.error(f"[decision-eda] Error deleting insights: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete insights: {str(e)}")
