"""
Schema API endpoints for Data4Viz.

Schema is the single source of truth for column metadata.
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import logging

from app.services.schema_service import (
    compute_schema,
    load_dataset_to_cache,
    get_raw_df,
    get_current_df,
    update_current_df,
    clear_cache,
    clean_missing_values
)
from app.services.dataset_loader import dataset_exists
from app.services.operation_logs import get_operation_logs

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dataset", tags=["schema"])


# ----------------------------
# Models
# ----------------------------

class NumericStats(BaseModel):
    """Numeric column statistics."""
    min: Optional[float] = None
    max: Optional[float] = None
    mean: Optional[float] = None
    median: Optional[float] = None
    std: Optional[float] = None
    q25: Optional[float] = None
    q75: Optional[float] = None


class ColumnSchema(BaseModel):
    """Column schema information."""
    name: str
    canonical_type: str  # numeric, categorical, datetime, boolean
    pandas_dtype: str
    total_rows: int
    missing_count: int
    missing_percentage: float
    unique_count: int
    numeric_stats: Optional[NumericStats] = None


class SchemaResponse(BaseModel):
    """Schema response model."""
    workspace_id: str
    dataset_id: str
    total_rows: int
    total_columns: int
    columns: List[ColumnSchema]
    computed_at: str
    using_current: bool


# ----------------------------
# Endpoints
# ----------------------------

@router.get("/{dataset_id}/schema", response_model=SchemaResponse)
async def get_dataset_schema(
    dataset_id: str,
    workspace_id: str = Query(..., description="Workspace identifier"),
    use_current: bool = Query(True, description="Use current_df (True) or raw_df (False)")
):
    """
    Get schema for a dataset.
    
    Schema is the single source of truth for column metadata.
    This endpoint:
    - Loads dataset into in-memory cache if not already loaded
    - Computes schema from either raw_df or current_df
    - Returns comprehensive column metadata
    
    Args:
        dataset_id: Dataset filename (e.g., "sample.csv")
        workspace_id: Workspace identifier
        use_current: If True, use current_df (modified); if False, use raw_df (original)
        
    Returns:
        Schema with column metadata
    """
    try:
        # Verify dataset exists
        if not dataset_exists(dataset_id, workspace_id):
            raise HTTPException(
                status_code=404,
                detail=f"Dataset '{dataset_id}' not found in workspace '{workspace_id}'"
            )
        
        # Compute schema (will auto-load into cache if needed)
        schema = compute_schema(workspace_id, dataset_id, use_current=use_current)
        
        if schema is None:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to compute schema for dataset '{dataset_id}'"
            )
        
        logger.info(f"Returned schema for dataset '{dataset_id}' in workspace '{workspace_id}'")
        return SchemaResponse(**schema)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting schema for dataset '{dataset_id}': {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get schema: {str(e)}"
        )


@router.post("/{dataset_id}/load")
async def load_dataset(
    dataset_id: str,
    workspace_id: str = Query(..., description="Workspace identifier")
):
    """
    Explicitly load a dataset into in-memory cache.
    
    This endpoint pre-loads a dataset so it's available for schema operations.
    Usually not needed as schema endpoint auto-loads, but useful for pre-warming.
    
    Args:
        dataset_id: Dataset filename
        workspace_id: Workspace identifier
        
    Returns:
        Success message
    """
    try:
        if not dataset_exists(dataset_id, workspace_id):
            raise HTTPException(
                status_code=404,
                detail=f"Dataset '{dataset_id}' not found in workspace '{workspace_id}'"
            )
        
        success = load_dataset_to_cache(workspace_id, dataset_id)
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to load dataset '{dataset_id}' into cache"
            )
        
        return {
            "message": f"Dataset '{dataset_id}' loaded into cache",
            "workspace_id": workspace_id,
            "dataset_id": dataset_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error loading dataset '{dataset_id}': {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load dataset: {str(e)}"
        )


@router.delete("/{dataset_id}/cache")
async def clear_dataset_cache(
    dataset_id: str,
    workspace_id: str = Query(..., description="Workspace identifier")
):
    """
    Clear in-memory cache for a dataset.
    
    Args:
        dataset_id: Dataset filename
        workspace_id: Workspace identifier
        
    Returns:
        Success message
    """
    try:
        clear_cache(workspace_id, dataset_id)
        return {
            "message": f"Cache cleared for dataset '{dataset_id}'",
            "workspace_id": workspace_id,
            "dataset_id": dataset_id
        }
    except Exception as e:
        logger.error(f"Error clearing cache for dataset '{dataset_id}': {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to clear cache: {str(e)}"
        )


class MissingValueCleanRequest(BaseModel):
    """Request model for missing value cleaning."""
    column: str
    strategy: str  # drop, fill_mean, fill_median, fill_mode, fill_constant
    constant_value: Optional[Any] = None
    preview: bool = False  # If True, preview only (no mutation, no logging)


class MissingValueCleanResponse(BaseModel):
    """Response model for missing value cleaning."""
    workspace_id: str
    dataset_id: str
    column: str
    strategy: str
    affected_rows: int
    preview: bool
    schema: Optional[SchemaResponse] = None  # Only included when preview=false


@router.post("/{dataset_id}/clean/missing", response_model=MissingValueCleanResponse)
async def clean_missing_values_endpoint(
    dataset_id: str,
    request: MissingValueCleanRequest,
    workspace_id: str = Query(..., description="Workspace identifier")
):
    """
    Clean missing values in a dataset column.
    
    This endpoint:
    - Validates strategy based on column canonical_type
    - Applies operation on current_df only (not raw_df)
    - Supports preview mode (preview=true) which doesn't mutate current_df or log
    - When preview=false: mutates current_df, logs operation, and recalculates schema
    - Returns affected row count and optionally updated schema
    
    Args:
        dataset_id: Dataset filename
        request: Cleaning request with column, strategy, optional constant_value, and preview flag
        workspace_id: Workspace identifier
        
    Returns:
        Affected row count and updated schema (only when preview=false)
    """
    try:
        # Verify dataset exists
        if not dataset_exists(dataset_id, workspace_id):
            raise HTTPException(
                status_code=404,
                detail=f"Dataset '{dataset_id}' not found in workspace '{workspace_id}'"
            )
        
        # Apply cleaning operation (with preview mode support)
        cleaned_df, affected_rows, error = clean_missing_values(
            workspace_id=workspace_id,
            dataset_id=dataset_id,
            column=request.column,
            strategy=request.strategy,
            constant_value=request.constant_value,
            preview=request.preview
        )
        
        if error:
            raise HTTPException(
                status_code=400,
                detail=error
            )
        
        if cleaned_df is None:
            raise HTTPException(
                status_code=500,
                detail="Failed to clean missing values"
            )
        
        # Only recalculate schema if not in preview mode
        updated_schema = None
        if not request.preview:
            updated_schema = compute_schema(workspace_id, dataset_id, use_current=True)
            
            if updated_schema is None:
                raise HTTPException(
                    status_code=500,
                    detail="Failed to recalculate schema after cleaning"
                )
            
            logger.info(
                f"Successfully cleaned missing values: column='{request.column}', "
                f"strategy='{request.strategy}', affected_rows={affected_rows} "
                f"for dataset '{dataset_id}' in workspace '{workspace_id}'"
            )
        else:
            logger.info(
                f"Previewed missing value cleaning: column='{request.column}', "
                f"strategy='{request.strategy}', affected_rows={affected_rows} "
                f"for dataset '{dataset_id}' in workspace '{workspace_id}'"
            )
        
        return MissingValueCleanResponse(
            workspace_id=workspace_id,
            dataset_id=dataset_id,
            column=request.column,
            strategy=request.strategy,
            affected_rows=affected_rows,
            preview=request.preview,
            schema=SchemaResponse(**updated_schema) if updated_schema else None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cleaning missing values for dataset '{dataset_id}': {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to clean missing values: {str(e)}"
        )


class OperationLogResponse(BaseModel):
    """Response model for a single operation log entry."""
    operation_type: str
    column: Optional[str] = None
    column_type: Optional[str] = None
    strategy: Optional[str] = None
    affected_rows: int
    timestamp: str


class DatasetLogsResponse(BaseModel):
    """Response model for dataset operation logs."""
    workspace_id: str
    dataset_id: str
    logs: List[OperationLogResponse]


@router.get("/{dataset_id}/logs", response_model=DatasetLogsResponse)
async def get_dataset_logs(
    dataset_id: str,
    workspace_id: str = Query(..., description="Workspace identifier")
):
    """
    Get operation logs for a dataset.
    
    Returns all operation logs in chronological order (oldest first).
    Logs are append-only and never deleted or modified.
    
    Args:
        dataset_id: Dataset filename
        workspace_id: Workspace identifier
        
    Returns:
        List of operation log entries
    """
    try:
        # Verify dataset exists
        if not dataset_exists(dataset_id, workspace_id):
            # Even if dataset doesn't exist, we might have logs
            pass
        
        # Get logs
        logs_data = get_operation_logs(workspace_id, dataset_id)
        
        # Convert to response models
        logs = [
            OperationLogResponse(**log_entry)
            for log_entry in logs_data
        ]
        
        logger.info(f"Returned {len(logs)} operation logs for dataset '{dataset_id}' in workspace '{workspace_id}'")
        
        return DatasetLogsResponse(
            workspace_id=workspace_id,
            dataset_id=dataset_id,
            logs=logs
        )
        
    except Exception as e:
        logger.error(f"Error getting logs for dataset '{dataset_id}': {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get operation logs: {str(e)}"
        )
