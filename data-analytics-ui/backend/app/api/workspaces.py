"""API endpoints for workspace management.

IMPORTANT: Workspace is the single source of truth.
All datasets belong to a workspace and are stored in workspace-specific directories.
Data Cleaning reads datasets ONLY from workspace storage.
"""

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pathlib import Path
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import pandas as pd
import io
import json
import logging
from datetime import datetime
from app.config import get_workspace_datasets_dir, get_workspace_logs_dir
from app.services.dataset_loader import list_workspace_datasets, list_workspace_files, load_dataset, save_dataset, dataset_exists
from app.services.cleaning_logs import get_cleaning_logs

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


class DatasetInfo(BaseModel):
    """Dataset metadata response."""
    id: str
    rows: int
    columns: int


class WorkspaceDatasetsResponse(BaseModel):
    """Response model for workspace datasets list."""
    workspace_id: str
    datasets: List[DatasetInfo]


class FileInfo(BaseModel):
    """File metadata response."""
    id: str
    name: str
    size: int
    type: str
    created_at: str


class WorkspaceFilesResponse(BaseModel):
    """Response model for workspace files list."""
    workspace_id: str
    files: List[FileInfo]


@router.get("/{workspace_id}/datasets", response_model=WorkspaceDatasetsResponse)
async def get_workspace_datasets(workspace_id: str):
    """
    Get all datasets in a workspace.
    
    IMPORTANT: Returns ONLY datasets that belong to this workspace.
    Reads from workspace storage - no fake or global datasets.
    Data Cleaning uses this endpoint to populate dataset dropdown.
    
    Args:
        workspace_id: Unique workspace identifier
        
    Returns:
        List of datasets with metadata (id, rows, columns)
    """
    try:
        datasets = list_workspace_datasets(workspace_id)
        return WorkspaceDatasetsResponse(
            workspace_id=workspace_id,
            datasets=datasets
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list workspace datasets: {str(e)}")


@router.get("/{workspace_id}/files", response_model=WorkspaceFilesResponse)
async def get_workspace_files(workspace_id: str):
    """
    Get all files in a workspace.
    
    Includes:
    - Original datasets
    - Cleaned datasets (saved as new files with timestamp)
    - Any other files in workspace storage
    
    Each file is downloadable via the file ID.
    
    Args:
        workspace_id: Unique workspace identifier
        
    Returns:
        List of files with metadata
    """
    try:
        files = list_workspace_files(workspace_id)
        return WorkspaceFilesResponse(
            workspace_id=workspace_id,
            files=files
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list workspace files: {str(e)}")


@router.get("/{workspace_id}/files/{file_id}/download")
async def download_workspace_file(workspace_id: str, file_id: str):
    """
    Download a file from workspace storage.
    
    Args:
        workspace_id: Unique workspace identifier
        file_id: Filename to download
        
    Returns:
        File content as CSV
    """
    try:
        datasets_dir = get_workspace_datasets_dir(workspace_id)
        file_path = datasets_dir / file_id
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail=f"File '{file_id}' not found in workspace")
        
        # Load and return as CSV
        df = pd.read_csv(file_path)
        
        output = io.StringIO()
        df.to_csv(output, index=False)
        output.seek(0)
        
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{file_id}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to download file: {str(e)}")


@router.post("/{workspace_id}/datasets/upload")
async def upload_dataset_to_workspace(
    workspace_id: str,
    file: UploadFile = File(...)
):
    """
    Upload a dataset to workspace storage.
    
    This endpoint allows frontend to sync workspace datasets to backend storage.
    When a dataset is uploaded to a workspace in the frontend, it should also
    be uploaded here so backend can perform cleaning operations on it.
    
    Args:
        workspace_id: Unique workspace identifier
        file: CSV file to upload
        
    Returns:
        Dataset metadata
    """
    try:
        if not file.filename.endswith('.csv'):
            raise HTTPException(status_code=400, detail="Only CSV files are supported")
        
        # Read CSV content
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        # Save to workspace storage
        datasets_dir = get_workspace_datasets_dir(workspace_id)
        file_path = datasets_dir / file.filename
        
        df.to_csv(file_path, index=False)
        
        return {
            "id": file.filename,
            "rows": len(df),
            "columns": len(df.columns),
            "message": f"Dataset '{file.filename}' uploaded to workspace"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload dataset: {str(e)}")


class CleaningLogResponse(BaseModel):
    """Cleaning log entry response."""
    dataset_name: str
    operation: str
    action: str
    rows_affected: int
    parameters: Dict[str, Any]
    timestamp: str


class WorkspaceCleaningLogsResponse(BaseModel):
    """Response model for workspace cleaning logs."""
    workspace_id: str
    logs: List[CleaningLogResponse]


@router.get("/{workspace_id}/cleaning-logs", response_model=WorkspaceCleaningLogsResponse)
async def get_workspace_cleaning_logs(workspace_id: str):
    """
    Get all cleaning logs for a workspace.
    
    Cleaning logs are stored per workspace and track:
    - Dataset name
    - Operation performed
    - Parameters used
    - Rows affected
    - Timestamp
    
    Logs are returned in reverse chronological order (most recent first).
    
    Args:
        workspace_id: Unique workspace identifier
        
    Returns:
        List of cleaning log entries
    """
    try:
        logs = get_cleaning_logs(workspace_id)
        return WorkspaceCleaningLogsResponse(
            workspace_id=workspace_id,
            logs=logs
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve cleaning logs: {str(e)}")


class SummaryRequest(BaseModel):
    """Request model for cleaning summary."""
    dataset: str


class ColumnSummary(BaseModel):
    """Column summary from cleaning analysis."""
    name: str
    type: str
    missing_pct: float
    duplicates_pct: float
    outliers: Optional[int]
    health_score: float


class CleaningSummaryResponse(BaseModel):
    """Response model for cleaning summary."""
    rows: int
    columns: List[ColumnSummary]
    overall_score: float


@router.post("/{workspace_id}/cleaning/summary", response_model=CleaningSummaryResponse)
async def get_cleaning_summary(workspace_id: str, request: SummaryRequest):
    """
    Get data cleaning summary for a dataset.
    
    Analyzes the dataset and returns quality metrics for each column:
    - Missing value percentage
    - Duplicate contribution
    - Outlier count (for numeric columns)
    - Health score
    
    Args:
        workspace_id: Unique workspace identifier
        request: Request containing dataset filename
        
    Returns:
        Cleaning summary with column metrics and overall score
    """
    logger.info(f"[get_cleaning_summary] Request received - workspace_id={workspace_id}, dataset={request.dataset}")
    
    try:
        # Validate dataset exists in workspace
        if not dataset_exists(request.dataset, workspace_id):
            logger.warning(f"[get_cleaning_summary] Dataset '{request.dataset}' not found in workspace '{workspace_id}'")
            raise HTTPException(
                status_code=404,
                detail=f"Dataset '{request.dataset}' not found in workspace"
            )
        
        # Load dataset
        df = load_dataset(request.dataset, workspace_id)
        logger.info(f"[get_cleaning_summary] Dataset loaded - rows={len(df)}, columns={len(df.columns)}")
        
        total_rows = len(df)
        column_summaries = []
        total_health_score = 0
        
        # Analyze each column
        for col in df.columns:
            col_data = df[col]
            
            # Determine column type
            if pd.api.types.is_numeric_dtype(col_data):
                col_type = "numeric"
            elif pd.api.types.is_datetime64_any_dtype(col_data):
                col_type = "datetime"
            elif pd.api.types.is_bool_dtype(col_data):
                col_type = "boolean"
            else:
                col_type = "categorical"
            
            # Calculate missing percentage
            missing_count = col_data.isna().sum()
            missing_pct = (missing_count / total_rows * 100) if total_rows > 0 else 0
            
            # Calculate duplicate contribution (percentage of rows that are duplicates)
            duplicate_count = col_data.duplicated().sum()
            duplicates_pct = (duplicate_count / total_rows * 100) if total_rows > 0 else 0
            
            # Calculate outliers for numeric columns
            outliers = None
            if col_type == "numeric" and not col_data.isna().all():
                Q1 = col_data.quantile(0.25)
                Q3 = col_data.quantile(0.75)
                IQR = Q3 - Q1
                if IQR > 0:
                    lower_bound = Q1 - 1.5 * IQR
                    upper_bound = Q3 + 1.5 * IQR
                    outliers = ((col_data < lower_bound) | (col_data > upper_bound)).sum()
                else:
                    outliers = 0
            
            # Calculate health score (0-100)
            # Penalize: missing values, duplicates, outliers, type inconsistencies
            health_score = 100.0
            health_score -= min(missing_pct * 2, 40)  # Up to 40 points for missing
            health_score -= min(duplicates_pct * 1, 20)  # Up to 20 points for duplicates
            if outliers is not None:
                outlier_pct = (outliers / total_rows * 100) if total_rows > 0 else 0
                health_score -= min(outlier_pct * 0.5, 20)  # Up to 20 points for outliers
            health_score = max(health_score, 0)  # Ensure non-negative
            
            column_summaries.append(ColumnSummary(
                name=col,
                type=col_type,
                missing_pct=round(missing_pct, 2),
                duplicates_pct=round(duplicates_pct, 2),
                outliers=outliers,
                health_score=round(health_score, 1)
            ))
            
            total_health_score += health_score
        
        # Calculate overall score
        overall_score = (total_health_score / len(column_summaries)) if column_summaries else 0
        
        response = CleaningSummaryResponse(
            rows=total_rows,
            columns=column_summaries,
            overall_score=round(overall_score, 1)
        )
        
        logger.info(f"[get_cleaning_summary] Response prepared - rows={response.rows}, columns={len(response.columns)}, overall_score={response.overall_score}")
        logger.info(f"[get_cleaning_summary] Response payload: {response.model_dump_json()}")
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[get_cleaning_summary] Error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate cleaning summary: {str(e)}")
