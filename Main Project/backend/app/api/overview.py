"""
Dataset Overview API.

IMPORTANT:
- Uses the SAME dataset loader as Data Cleaning
- Workspace is the single source of truth
- Overview results are persisted as JSON files in workspace
- GET endpoint reads from file if exists, computes only if missing
- POST endpoint forces recomputation and saves result
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import pandas as pd
import json
import logging
from pathlib import Path

from app.services.dataset_loader import load_dataset, dataset_exists
from app.config import get_overview_file_path

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/overview", tags=["overview"])


# ----------------------------
# Models
# ----------------------------

class ColumnMetadata(BaseModel):
    name: str
    inferred_type: str  # numeric | datetime | categorical
    nullable: bool
    missing_count: int
    missing_percentage: float


class OverviewResponse(BaseModel):
    total_rows: int
    total_columns: int
    duplicate_row_count: int
    numeric_column_count: int
    categorical_column_count: int
    datetime_column_count: int
    columns: List[ColumnMetadata]
    column_insights: Dict[str, Dict[str, Any]]


# ----------------------------
# Helpers
# ----------------------------

def infer_column_type(df: pd.DataFrame, col: str) -> str:
    s = df[col]

    # 1) numeric first
    if pd.api.types.is_numeric_dtype(s):
        return "numeric"

    # 2) already datetime
    if pd.api.types.is_datetime64_any_dtype(s):
        return "datetime"

    # 3) numeric-like strings
    if s.dtype == "object":
        num = pd.to_numeric(s, errors="coerce")
        if num.notna().mean() > 0.8:
            return "numeric"

    # 4) datetime with sane years
    parsed = pd.to_datetime(s, errors="coerce", infer_datetime_format=True)
    if parsed.notna().mean() > 0.7:
        years = parsed.dropna().dt.year
        if not years.empty and years.between(1900, 2100).all():
            return "datetime"

    return "categorical"


# ----------------------------
# Helpers - Overview Computation
# ----------------------------

def compute_overview(df: pd.DataFrame) -> OverviewResponse:
    """
    Compute overview statistics for a dataset.
    
    This is the core computation logic that can be reused.
    """
    total_rows = len(df)
    total_columns = len(df.columns)
    duplicate_row_count = min(int(df.duplicated().sum()), total_rows)

    type_counts = {"numeric": 0, "categorical": 0, "datetime": 0}
    columns_meta: List[ColumnMetadata] = []

    # Column metadata
    for col in df.columns:
        inferred = infer_column_type(df, col)
        type_counts[inferred] += 1

        missing_count = int(df[col].isna().sum())
        missing_percentage = round(
            (missing_count / total_rows * 100) if total_rows else 0.0, 2
        )

        columns_meta.append(
            ColumnMetadata(
                name=col,
                inferred_type=inferred,
                nullable=missing_count > 0,
                missing_count=missing_count,
                missing_percentage=missing_percentage,
            )
        )

    # Column insights (used by Overview → Column Insights UI)
    # Return top 50 values to allow frontend to slice dynamically (5, 10, 20, custom)
    column_insights: Dict[str, Dict[str, Any]] = {}

    for col in df.columns:
        vc = df[col].value_counts(dropna=True).head(50)
        column_insights[col] = {
            "unique": int(df[col].nunique(dropna=True)),
            "top_values": vc.to_dict(),
        }

    return OverviewResponse(
        total_rows=total_rows,
        total_columns=total_columns,
        duplicate_row_count=duplicate_row_count,
        numeric_column_count=type_counts["numeric"],
        categorical_column_count=type_counts["categorical"],
        datetime_column_count=type_counts["datetime"],
        columns=columns_meta,
        column_insights=column_insights,
    )


def save_overview_to_file(workspace_id: str, dataset_id: str, overview: OverviewResponse) -> None:
    """
    Save overview result to workspace file.
    
    Format: dataset_name_overview.json
    """
    overview_path = get_overview_file_path(workspace_id, dataset_id)
    overview_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(overview_path, "w") as f:
        json.dump(overview.model_dump(), f, indent=2)
    
    logger.info(f"[save_overview_to_file] Saved overview to {overview_path}")
    
    # Register file in registry
    from app.services.file_registry import register_file
    register_file(
        file_path=str(overview_path),
        workspace_id=workspace_id,
        file_type="overview",
        is_protected=False,  # Overview files can be deleted
    )


def load_overview_from_file(workspace_id: str, dataset_id: str) -> Optional[OverviewResponse]:
    """
    Load overview from workspace file if it exists.
    
    Returns:
        OverviewResponse if file exists, None otherwise
    """
    overview_path = get_overview_file_path(workspace_id, dataset_id)
    
    if not overview_path.exists():
        return None
    
    try:
        with open(overview_path, "r") as f:
            data = json.load(f)
        return OverviewResponse(**data)
    except Exception as e:
        logger.warning(f"[load_overview_from_file] Failed to load overview from {overview_path}: {e}")
        return None


# ----------------------------
# Endpoints
# ----------------------------

@router.get("", response_model=OverviewResponse)
async def get_overview(
    workspace_id: str = Query(...),
    dataset_id: str = Query(...),
    refresh: bool = Query(False, description="Force recomputation")
):
    """
    Get dataset overview.
    
    WORKSPACE-CENTRIC: Reads from saved file if exists, computes only if missing or refresh=True.
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename
        refresh: If True, force recomputation and save new result
        
    Returns:
        Overview statistics
    """
    logger.info(f"[API START] get_overview - dataset_id={dataset_id}, workspace_id={workspace_id}, refresh={refresh}")
    try:
        logger.info(f"[OVERVIEW] Checking if dataset exists...")
        if not dataset_exists(dataset_id, workspace_id):
            logger.warning(f"[OVERVIEW] Dataset not found: {dataset_id} in workspace {workspace_id}")
            raise HTTPException(
                status_code=404,
                detail=f"Dataset '{dataset_id}' not found in workspace '{workspace_id}'"
            )
        logger.info(f"[OVERVIEW] Dataset exists")

        # Try to load from file first (unless refresh requested)
        if not refresh:
            logger.info(f"[OVERVIEW] Attempting to load from file...")
            cached_overview = load_overview_from_file(workspace_id, dataset_id)
            if cached_overview:
                logger.info(f"[RESPONSE SENT] Returning cached overview for {dataset_id}")
                return cached_overview
            logger.info(f"[OVERVIEW] No cached overview found, will compute")

        # Compute overview (either missing or refresh requested)
        logger.info(f"[OVERVIEW] Computing overview for {dataset_id} (refresh={refresh})")
        logger.info(f"[OVERVIEW] Loading dataset...")
        df = load_dataset(dataset_id, workspace_id)
        logger.info(f"[OVERVIEW] Dataset loaded - rows={len(df)}, columns={len(df.columns)}")
        logger.info(f"[OVERVIEW] Computing overview statistics...")
        overview = compute_overview(df)
        logger.info(f"[OVERVIEW] Overview computed")
        
        # Save to file for future use
        logger.info(f"[OVERVIEW] Saving overview to file...")
        save_overview_to_file(workspace_id, dataset_id, overview)
        logger.info(f"[RESPONSE SENT] Returning overview for {dataset_id}")
        return overview
        
    except HTTPException:
        logger.info(f"[RESPONSE SENT] HTTPException raised for {dataset_id}")
        raise
    except Exception as e:
        logger.error(f"[ERROR] Error getting overview for dataset '{dataset_id}': {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get overview: {str(e)}"
        )


@router.get("/file", response_model=OverviewResponse)
async def get_overview_from_file(
    workspace_id: str = Query(...),
    dataset_id: str = Query(...)
):
    """
    Read overview directly from workspace file (no computation).
    
    This is the preferred endpoint for frontend - reads cached overview.
    Returns 404 if file doesn't exist (frontend should then call GET /overview).
    """
    logger.info(f"[API START] get_overview_from_file - dataset_id={dataset_id}, workspace_id={workspace_id}")
    try:
        logger.info(f"[OVERVIEW_FILE] Loading overview from file...")
        overview = load_overview_from_file(workspace_id, dataset_id)
        
        if not overview:
            logger.warning(f"[OVERVIEW_FILE] Overview file not found for {dataset_id}")
            raise HTTPException(
                status_code=404,
                detail=f"Overview file not found for dataset '{dataset_id}' in workspace '{workspace_id}'. Call GET /overview to compute."
            )
        
        logger.info(f"[RESPONSE SENT] Returning overview from file for {dataset_id}")
        return overview
        
    except HTTPException:
        logger.info(f"[RESPONSE SENT] HTTPException raised for {dataset_id}")
        raise
    except Exception as e:
        logger.error(f"[ERROR] Error getting overview from file for dataset '{dataset_id}': {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get overview from file: {str(e)}"
        )


@router.post("/refresh", response_model=OverviewResponse)
async def refresh_overview(
    workspace_id: str = Query(...),
    dataset_id: str = Query(...)
):
    """
    Force refresh/recompute overview and save to file.
    
    This endpoint is called when user explicitly requests a refresh.
    """
    if not dataset_exists(dataset_id, workspace_id):
        raise HTTPException(
            status_code=404,
            detail=f"Dataset '{dataset_id}' not found in workspace '{workspace_id}'"
        )

    logger.info(f"[refresh_overview] Forcing recomputation for {dataset_id}")
    df = load_dataset(dataset_id, workspace_id)
    overview = compute_overview(df)
    
    # Save to file
    save_overview_to_file(workspace_id, dataset_id, overview)
    
    return overview
