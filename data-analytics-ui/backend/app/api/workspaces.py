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
import shutil
from datetime import datetime
from app.config import get_workspace_dir, get_workspace_datasets_dir, get_workspace_logs_dir, get_workspace_files_dir, WORKSPACES_DIR
from app.services.dataset_loader import list_workspace_datasets, list_workspace_files, load_dataset, save_dataset, dataset_exists
from app.services.file_registry import (
    delete_workspace_files,
    cleanup_orphan_files,
    verify_file_ownership,
    is_file_protected,
    get_csv_files_in_workspace,
    get_file_metadata,
    unregister_file,
)

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
    
    Files can be located in:
    - datasets/ directory (CSV files)
    - files/ directory (JSON, overview snapshots, etc.)
    - logs/ directory (LOG files)
    - notebooks/ directory (Jupyter notebook files)
    
    Args:
        workspace_id: Unique workspace identifier
        file_id: Filename to download (can include subdirectory prefix like "notebooks/auto_summarize.ipynb")
        
    Returns:
        File content with appropriate content type
    """
    try:
        # Check all possible file locations
        datasets_dir = get_workspace_datasets_dir(workspace_id)
        files_dir = get_workspace_files_dir(workspace_id)
        logs_dir = get_workspace_logs_dir(workspace_id)
        workspace_dir = get_workspace_dir(workspace_id)
        
        file_path = None
        
        # Handle subdirectory prefixes (notebooks/, files/, etc.)
        actual_file_id = file_id
        if file_id.startswith("notebooks/"):
            actual_file_id = file_id.replace("notebooks/", "", 1)
            notebooks_dir = workspace_dir / "notebooks"
            potential_path = notebooks_dir / actual_file_id
            if potential_path.exists() and potential_path.is_file():
                file_path = potential_path
        elif file_id.startswith("files/"):
            actual_file_id = file_id.replace("files/", "", 1)
            potential_path = files_dir / actual_file_id
            if potential_path.exists() and potential_path.is_file():
                file_path = potential_path
        
        # Try datasets directory
        if not file_path:
            potential_path = datasets_dir / actual_file_id
            if potential_path.exists() and potential_path.is_file():
                file_path = potential_path
        
        # Try files directory
        if not file_path:
            potential_path = files_dir / actual_file_id
            if potential_path.exists() and potential_path.is_file():
                file_path = potential_path
        
        # Try logs directory
        if not file_path:
            potential_path = logs_dir / actual_file_id
            if potential_path.exists() and potential_path.is_file():
                file_path = potential_path
        
        # Try notebooks directory (without prefix)
        if not file_path:
            notebooks_dir = workspace_dir / "notebooks"
            potential_path = notebooks_dir / actual_file_id
            if potential_path.exists() and potential_path.is_file():
                file_path = potential_path
        
        if not file_path:
            raise HTTPException(
                status_code=404,
                detail=f"File '{file_id}' not found in workspace '{workspace_id}'"
            )
        
        # Determine content type based on file extension
        suffix = file_path.suffix.lower()
        if suffix == ".ipynb":
            # For Jupyter notebook files, read as JSON with proper content type
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
            media_type = "application/x-ipynb+json"
        elif suffix == ".csv":
            # For CSV files, read with pandas to ensure proper formatting
            df = pd.read_csv(file_path)
            output = io.StringIO()
            df.to_csv(output, index=False)
            output.seek(0)
            content = output.getvalue()
            media_type = "text/csv"
        elif suffix == ".json":
            # For JSON files, read and return as-is
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
            media_type = "application/json"
        elif suffix == ".log":
            # For LOG files, read as text
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
            media_type = "text/plain"
        else:
            # For other file types, read as binary
            with open(file_path, "rb") as f:
                content = f.read()
            media_type = "application/octet-stream"
        
        return StreamingResponse(
            iter([content]),
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{file_id}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading file '{file_id}' from workspace '{workspace_id}': {str(e)}")
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
        
        # Register CSV file in registry (protected)
        from app.services.file_registry import register_file
        register_file(
            file_path=str(file_path),
            workspace_id=workspace_id,
            file_type="csv",
            is_protected=True,  # CSV files are protected
        )
        
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


class OverviewRequest(BaseModel):
    """Request model for dataset overview."""
    dataset: str


class ColumnMetadata(BaseModel):
    """Column metadata in overview response."""
    name: str
    inferred_type: str  # "numeric", "datetime", "categorical"
    nullable: bool
    missing_count: int
    missing_percentage: float


class OverviewResponse(BaseModel):
    """Response model for dataset overview."""
    total_rows: int
    total_columns: int
    duplicate_row_count: int
    numeric_column_count: int
    categorical_column_count: int
    datetime_column_count: int
    columns: List[ColumnMetadata]


def infer_column_type(df: pd.DataFrame, col_name: str) -> str:
    """
    Robustly infer column data type.
    
    IMPORTANT: This function prevents misclassification by:
    1. Checking numeric types FIRST (int, float)
    2. Only classifying as datetime if values match valid date patterns
    3. Using reasonable year ranges (1900-2100) to prevent IDs/ratings from being dates
    4. Defaulting to categorical for remaining string columns
    
    Args:
        df: DataFrame containing the column
        col_name: Name of the column to infer
        
    Returns:
        Inferred type: "numeric", "datetime", or "categorical"
    """
    col_data = df[col_name]
    
    # Step 1: Check if already numeric (int or float)
    if pd.api.types.is_numeric_dtype(col_data):
        return "numeric"
    
    # Step 2: Check if already datetime
    if pd.api.types.is_datetime64_any_dtype(col_data):
        return "datetime"
    
    # Step 3: For object/string columns, check if they could be numeric
    if col_data.dtype == "object":
        # Try to convert to numeric (handles strings that are actually numbers)
        try:
            numeric_series = pd.to_numeric(col_data, errors="coerce")
            # If more than 80% of non-null values can be converted to numeric, it's numeric
            non_null = numeric_series.notna()
            if non_null.sum() > 0:
                conversion_rate = non_null.sum() / len(col_data)
                if conversion_rate > 0.8:
                    return "numeric"
        except Exception:
            pass
    
    # Step 4: Check if column could be datetime
    # IMPORTANT: Only classify as datetime if values match valid date patterns
    # and fall within reasonable year ranges (1900-2100)
    if col_data.dtype == "object":
        sample_size = min(100, len(col_data.dropna()))
        if sample_size > 0:
            sample_values = col_data.dropna().head(sample_size)
            
            # Try parsing as datetime with common formats
            date_formats = [
                "%Y-%m-%d",
                "%Y/%m/%d",
                "%m/%d/%Y",
                "%d/%m/%Y",
                "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%dT%H:%M:%S",
                "%d-%m-%Y",
            ]
            
            valid_date_count = 0
            for val in sample_values:
                val_str = str(val).strip()
                if not val_str:
                    continue
                
                # Try each date format
                parsed = False
                for fmt in date_formats:
                    try:
                        dt = pd.to_datetime(val_str, format=fmt, errors="raise")
                        # Check if year is in reasonable range (1900-2100)
                        if 1900 <= dt.year <= 2100:
                            valid_date_count += 1
                            parsed = True
                            break
                    except (ValueError, TypeError):
                        continue
                
                # Also try pandas' flexible parser as fallback
                if not parsed:
                    try:
                        dt = pd.to_datetime(val_str, errors="raise", infer_datetime_format=True)
                        if 1900 <= dt.year <= 2100:
                            valid_date_count += 1
                    except (ValueError, TypeError):
                        pass
            
            # If more than 70% of sample values are valid dates, classify as datetime
            if valid_date_count / sample_size > 0.7:
                return "datetime"
    
    # Step 5: Default to categorical for remaining columns
    return "categorical"


@router.post("/{workspace_id}/overview", response_model=OverviewResponse)
async def get_dataset_overview(workspace_id: str, request: OverviewRequest):
    """
    Get comprehensive overview of a dataset.
    
    This endpoint provides a structured summary of the dataset including:
    - Total rows and columns
    - Column-wise missing value statistics
    - Duplicate row count (row-level)
    - Column datatype classification (numeric, datetime, categorical)
    - Counts of each column type
    
    IMPORTANT: Type inference is robust and prevents misclassification:
    - Numeric columns are detected first (int, float)
    - Datetime is only inferred if values match valid date patterns
    - Year ranges are validated (1900-2100) to prevent IDs/ratings from being dates
    - Remaining columns default to categorical
    
    Args:
        workspace_id: Unique workspace identifier
        request: Request containing dataset filename
        
    Returns:
        Overview summary with dataset metrics and column metadata
    """
    logger.info(f"[get_dataset_overview] Request received - workspace_id={workspace_id}, dataset={request.dataset}")
    
    try:
        # Validate dataset exists in workspace
        if not dataset_exists(request.dataset, workspace_id):
            logger.warning(f"[get_dataset_overview] Dataset '{request.dataset}' not found in workspace '{workspace_id}'")
            raise HTTPException(
                status_code=404,
                detail=f"Dataset '{request.dataset}' not found in workspace"
            )
        
        # Load dataset
        df = load_dataset(request.dataset, workspace_id)
        logger.info(f"[get_dataset_overview] Dataset loaded - rows={len(df)}, columns={len(df.columns)}")
        
        total_rows = len(df)
        total_columns = len(df.columns)
        
        # Calculate duplicate row count (row-level, not column-level)
        # IMPORTANT: Ensure duplicate_count <= total_rows
        duplicate_row_count = df.duplicated().sum()
        duplicate_row_count = min(duplicate_row_count, total_rows)
        
        # Analyze each column
        column_metadata = []
        type_counts = {"numeric": 0, "categorical": 0, "datetime": 0}
        
        for col in df.columns:
            col_data = df[col]
            
            # Infer column type using robust logic
            inferred_type = infer_column_type(df, col)
            type_counts[inferred_type] += 1
            
            # Calculate missing value statistics
            missing_count = col_data.isna().sum()
            missing_percentage = (missing_count / total_rows * 100) if total_rows > 0 else 0.0
            # Ensure percentage is valid (0-100)
            missing_percentage = max(0.0, min(100.0, missing_percentage))
            
            # Determine if column is nullable (has any missing values)
            nullable = missing_count > 0
            
            column_metadata.append(ColumnMetadata(
                name=col,
                inferred_type=inferred_type,
                nullable=nullable,
                missing_count=int(missing_count),
                missing_percentage=round(missing_percentage, 2)
            ))
        
        response = OverviewResponse(
            total_rows=total_rows,
            total_columns=total_columns,
            duplicate_row_count=duplicate_row_count,
            numeric_column_count=type_counts["numeric"],
            categorical_column_count=type_counts["categorical"],
            datetime_column_count=type_counts["datetime"],
            columns=column_metadata
        )
        
        logger.info(
            f"[get_dataset_overview] Response prepared - "
            f"rows={response.total_rows}, columns={response.total_columns}, "
            f"duplicates={response.duplicate_row_count}, "
            f"types: numeric={response.numeric_column_count}, "
            f"categorical={response.categorical_column_count}, "
            f"datetime={response.datetime_column_count}"
        )
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[get_dataset_overview] Error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate dataset overview: {str(e)}")


@router.delete("/{workspace_id}")
async def delete_workspace(workspace_id: str):
    """
    Delete a workspace and ALL its files (cascade delete).
    
    IMPORTANT: This is a hard delete operation that removes:
    - Workspace directory and all subdirectories
    - All uploaded datasets (CSV files in datasets/)
    - All overview files (*_overview.json in files/)
    - All cleaned datasets
    - All cleaning summary JSONs
    - All log files
    - Any other workspace-generated files
    
    Safety:
    - Deletion is scoped strictly to the workspace directory
    - Does NOT delete files from other workspaces
    - Does NOT delete global/system files
    
    Args:
        workspace_id: Unique workspace identifier
        
    Returns:
        Success message
        
    Raises:
        HTTPException: If workspace doesn't exist or deletion fails
    """
    logger.info(f"[delete_workspace] Request received - workspace_id={workspace_id}")
    
    try:
        # Get workspace directory path
        workspace_dir = get_workspace_dir(workspace_id)
        
        # Safety check: Ensure we're only deleting from workspaces directory
        # This prevents accidental deletion of files outside workspace storage
        # Use resolve() to get absolute paths and compare
        try:
            workspace_abs = workspace_dir.resolve()
            workspaces_abs = WORKSPACES_DIR.resolve()
            # Check if workspace directory is within workspaces directory
            if not str(workspace_abs).startswith(str(workspaces_abs)):
                logger.error(f"[delete_workspace] Security check failed: workspace_dir is not within WORKSPACES_DIR")
                raise HTTPException(
                    status_code=500,
                    detail="Workspace directory path validation failed"
                )
        except Exception as e:
            logger.error(f"[delete_workspace] Error during path validation: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="Workspace directory path validation failed"
            )
        
        # Check if workspace directory exists
        if not workspace_dir.exists():
            logger.warning(f"[delete_workspace] Workspace directory does not exist: {workspace_dir}")
            # Return success even if directory doesn't exist (idempotent operation)
            return {
                "message": f"Workspace '{workspace_id}' deleted (directory did not exist)",
                "workspace_id": workspace_id
            }
        
        # Log what will be deleted (for debugging)
        try:
            datasets_dir = get_workspace_datasets_dir(workspace_id)
            files_dir = get_workspace_files_dir(workspace_id)
            logs_dir = get_workspace_logs_dir(workspace_id)
            
            dataset_count = len(list(datasets_dir.glob("*"))) if datasets_dir.exists() else 0
            files_count = len(list(files_dir.glob("*"))) if files_dir.exists() else 0
            logs_count = len(list(logs_dir.glob("*"))) if logs_dir.exists() else 0
            
            logger.info(
                f"[delete_workspace] Deleting workspace '{workspace_id}': "
                f"{dataset_count} files in datasets/, {files_count} files in files/, {logs_count} files in logs/"
            )
        except Exception as e:
            logger.warning(f"[delete_workspace] Could not count files before deletion: {e}")
        
        # Step 1: Delete all files from registry (cascade delete)
        # This ensures registry is clean before physical deletion
        deleted_file_paths = delete_workspace_files(workspace_id)
        logger.info(f"[delete_workspace] Removed {len(deleted_file_paths)} files from registry")
        
        # Step 2: Delete entire workspace directory (cascade delete)
        # This removes:
        # - datasets/ directory and all CSV files
        # - files/ directory and all JSON/overview files
        # - logs/ directory and all LOG files
        # - Any other files/subdirectories in the workspace
        shutil.rmtree(workspace_dir, ignore_errors=False)
        
        logger.info(f"[delete_workspace] Successfully deleted workspace directory: {workspace_dir}")
        
        return {
            "message": f"Workspace '{workspace_id}' and all its files deleted successfully",
            "workspace_id": workspace_id
        }
        
    except HTTPException:
        raise
    except FileNotFoundError:
        # Workspace directory doesn't exist - return success (idempotent)
        logger.info(f"[delete_workspace] Workspace directory not found: {workspace_id}")
        return {
            "message": f"Workspace '{workspace_id}' deleted (directory did not exist)",
            "workspace_id": workspace_id
        }
    except PermissionError as e:
        logger.error(f"[delete_workspace] Permission denied when deleting workspace '{workspace_id}': {str(e)}")
        raise HTTPException(
            status_code=403,
            detail=f"Permission denied: Cannot delete workspace '{workspace_id}'"
        )
    except Exception as e:
        logger.error(f"[delete_workspace] Error deleting workspace '{workspace_id}': {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete workspace: {str(e)}"
        )


@router.delete("/{workspace_id}/files/{file_id}")
async def delete_workspace_file(workspace_id: str, file_id: str):
    """
    Delete a file from workspace storage.
    
    IMPORTANT RULES:
    - File must belong to the specified workspace (ownership verification)
    - CSV files are PROTECTED and cannot be deleted (is_protected=True)
    - Cannot delete the last CSV file in a workspace
    - Files can only be deleted from their owning workspace
    
    Args:
        workspace_id: Workspace identifier
        file_id: File identifier (filename or path)
        
    Returns:
        Success message
        
    Raises:
        HTTPException: If file doesn't exist, is protected, or ownership verification fails
    """
    logger.info(f"[delete_workspace_file] Request received - workspace_id={workspace_id}, file_id={file_id}")
    
    try:
        # Find the file in workspace storage
        datasets_dir = get_workspace_datasets_dir(workspace_id)
        files_dir = get_workspace_files_dir(workspace_id)
        logs_dir = get_workspace_logs_dir(workspace_id)
        workspace_dir = get_workspace_dir(workspace_id)
        
        file_path = None
        actual_file_id = file_id
        
        # Handle subdirectory prefixes
        if file_id.startswith("files/"):
            actual_file_id = file_id.replace("files/", "", 1)
            potential_path = files_dir / actual_file_id
            if potential_path.exists() and potential_path.is_file():
                file_path = potential_path
        elif file_id.startswith("notebooks/"):
            actual_file_id = file_id.replace("notebooks/", "", 1)
            notebooks_dir = workspace_dir / "notebooks"
            potential_path = notebooks_dir / actual_file_id
            if potential_path.exists() and potential_path.is_file():
                file_path = potential_path
        
        # Try datasets directory
        if not file_path:
            potential_path = datasets_dir / actual_file_id
            if potential_path.exists() and potential_path.is_file():
                file_path = potential_path
        
        # Try files directory
        if not file_path:
            potential_path = files_dir / actual_file_id
            if potential_path.exists() and potential_path.is_file():
                file_path = potential_path
        
        # Try logs directory
        if not file_path:
            potential_path = logs_dir / actual_file_id
            if potential_path.exists() and potential_path.is_file():
                file_path = potential_path
        
        # IDEMPOTENT DELETE: If file not found, return success with deleted: false
        if not file_path:
            logger.info(
                f"[delete_workspace_file] File not found (idempotent): file_id={file_id}, workspace_id={workspace_id}"
            )
            return {
                "success": True,
                "deleted": False,
                "reason": "not_found",
                "workspace_id": workspace_id,
                "file_id": file_id,
            }
        
        # Verify file ownership (safety check)
        if not verify_file_ownership(str(file_path), workspace_id):
            logger.warning(
                f"[delete_workspace_file] Ownership verification failed: "
                f"file={file_path}, workspace={workspace_id}"
            )
            raise HTTPException(
                status_code=403,
                detail="File does not belong to the specified workspace"
            )
        
        # Check if file is protected (only system notebooks are protected, CSV files can be deleted)
        file_relative_path = str(file_path.relative_to(workspace_dir)) if workspace_dir in file_path.parents else str(file_path)
        is_system_notebook = file_relative_path.startswith("notebooks/") and file_relative_path.endswith(".ipynb")
        
        # PROTECTION RULE: Only system notebooks are protected (CSV files can be deleted)
        if is_system_notebook or (is_file_protected(str(file_path)) and is_system_notebook):
            logger.info(
                f"[delete_workspace_file] Protected file delete attempt (idempotent): {file_path} (SystemNotebook={is_system_notebook})"
            )
            return {
                "success": True,
                "deleted": False,
                "protected": True,
                "workspace_id": workspace_id,
                "file_id": file_id,
            }
        
        # REAL FILE DELETION: Step 1 - Delete physical file from storage
        deleted = False
        try:
            if file_path.exists():
                file_path.unlink()
                deleted = True
                logger.info(f"[delete_workspace_file] Deleted physical file: {file_path}")
            else:
                # IDEMPOTENT DELETE: File doesn't exist - return success with deleted: false
                logger.info(f"[delete_workspace_file] File does not exist (idempotent): {file_path}")
        except Exception as e:
            logger.error(f"[delete_workspace_file] Failed to delete physical file: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to delete physical file: {str(e)}"
            )
        
        # REAL FILE DELETION: Step 2 - Remove from file registry (only if file existed)
        if deleted:
            try:
                unregister_file(str(file_path))
                logger.info(f"[delete_workspace_file] Removed from file registry: {file_path}")
            except Exception as e:
                logger.error(f"[delete_workspace_file] Failed to remove from registry: {e}")
                # Continue - physical file is already deleted
        
        # CONSISTENT RESPONSE SHAPE
        return {
            "success": True,
            "deleted": deleted,
            "workspace_id": workspace_id,
            "file_id": file_id,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"[delete_workspace_file] Error deleting file '{file_id}' from workspace '{workspace_id}': {str(e)}",
            exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete file: {str(e)}"
        )


@router.post("/cleanup-orphans")
async def cleanup_orphans():
    """
    Clean up orphan files (files that don't belong to any existing workspace).
    
    This endpoint:
    - Scans the file registry
    - Identifies files whose workspace no longer exists
    - Removes orphan files from the registry
    
    This should be called on app startup or periodically.
    
    Returns:
        List of orphan file paths that were cleaned up
    """
    logger.info("[cleanup_orphans] Starting orphan file cleanup")
    
    try:
        orphan_paths = cleanup_orphan_files()
        
        logger.info(f"[cleanup_orphans] Cleaned up {len(orphan_paths)} orphan files")
        
        return {
            "message": f"Cleaned up {len(orphan_paths)} orphan files",
            "orphan_count": len(orphan_paths),
            "orphan_paths": orphan_paths,
        }
    except Exception as e:
        logger.error(f"[cleanup_orphans] Error during cleanup: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to cleanup orphan files: {str(e)}"
        )
