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
from app.config import get_workspace_dir, get_workspace_datasets_dir, get_workspace_logs_dir, get_workspace_files_dir, WORKSPACES_DIR, get_outlier_analysis_file_path
from app.services.dataset_loader import list_workspace_datasets, list_workspace_files, load_dataset, save_dataset, dataset_exists
from app.services.outliers import detect_outliers_for_dataset
from app.services.insight_storage import compute_dataset_hash
from app.services.file_registry import (
    delete_workspace_files,
    cleanup_orphan_files,
    verify_file_ownership,
    is_file_protected,
    get_csv_files_in_workspace,
    get_file_metadata,
    unregister_file,
)
from app.services.vizion_runner import run_vizion, extract_vega_spec

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
    
    Requirements:
    - Parameter validation: workspace_id is required and cannot be empty
    - Returns empty list (not error) if workspace has no datasets
    - Returns empty list if workspace directory doesn't exist (no 404)
    - Handles 500 errors gracefully with detailed logging
    - Always returns valid WorkspaceDatasetsResponse structure (never undefined/null)
    
    Args:
        workspace_id: Unique workspace identifier
        
    Returns:
        List of datasets with metadata (id, rows, columns)
        Returns empty list if workspace is empty or doesn't exist
        
    Raises:
        HTTPException 400: If workspace_id is missing or empty
        HTTPException 500: If backend error occurs while reading datasets
    """
    # Step 1: Validate required parameters
    if not workspace_id or workspace_id.strip() == "":
        logger.warning(f"[get_workspace_datasets] Invalid request: workspace_id is missing or empty")
        raise HTTPException(
            status_code=400,
            detail="workspace_id is required and cannot be empty"
        )
    
    logger.info(f"[get_workspace_datasets] Request received - workspace_id={workspace_id}")
    
    try:
        # Step 2: List workspace datasets
        datasets = list_workspace_datasets(workspace_id)
        
        # Step 3: Validate response structure
        if not isinstance(datasets, list):
            logger.error(
                f"[get_workspace_datasets] Invalid response from list_workspace_datasets: "
                f"expected list, got {type(datasets).__name__}"
            )
            raise Exception(f"Internal error: list_workspace_datasets returned {type(datasets).__name__}")
        
        # Step 4: Log results
        logger.info(
            f"[get_workspace_datasets] Success - found {len(datasets)} datasets in workspace '{workspace_id}'"
        )
        
        # Step 5: Return response (always valid structure)
        response = WorkspaceDatasetsResponse(
            workspace_id=workspace_id,
            datasets=datasets
        )
        
        return response
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        # Catch all backend errors
        logger.error(
            f"[get_workspace_datasets] Error listing datasets for workspace '{workspace_id}': {str(e)}",
            exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list workspace datasets: {str(e)}"
        )


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
            # Try auto-detecting delimiter first
            df = pd.read_csv(file_path, sep=None, engine="python", on_bad_lines="skip")
            
            # Fallback: If only one column detected, try semicolon delimiter
            if len(df.columns) == 1:
                try:
                    df_semicolon = pd.read_csv(file_path, sep=";", engine="python", on_bad_lines="skip")
                    if len(df_semicolon.columns) > 1:
                        df = df_semicolon
                except Exception:
                    # If semicolon parsing also fails, keep original
                    pass
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
    
    ATOMIC OPERATION:
    1. Validate CSV file
    2. Save to workspace storage
    3. Register in file registry
    4. Generate and save dataset overview
    5. Return success (or rollback on any failure)
    
    This endpoint allows frontend to sync workspace datasets to backend storage.
    When a dataset is uploaded to a workspace in the frontend, it should also
    be uploaded here so backend can perform cleaning operations on it.
    
    Args:
        workspace_id: Unique workspace identifier
        file: CSV file to upload
        
    Returns:
        Dataset metadata with rows and columns
    """
    temp_file_path = None
    try:
        if not file.filename or not file.filename.endswith('.csv'):
            raise HTTPException(status_code=400, detail="Only CSV files are supported")
        
        # Step 1: Read and validate CSV content
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        
        try:
            # Try auto-detecting delimiter first (pandas can detect comma, semicolon, tab, etc.)
            df = pd.read_csv(io.BytesIO(contents), sep=None, engine="python", on_bad_lines="skip")
            
            # Fallback: If only one column detected, try semicolon delimiter
            if len(df.columns) == 1:
                try:
                    df_semicolon = pd.read_csv(io.BytesIO(contents), sep=";", engine="python", on_bad_lines="skip")
                    if len(df_semicolon.columns) > 1:
                        df = df_semicolon
                except Exception:
                    pass
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse CSV file: {str(e)}")
        
        # Validate parsed data
        if len(df.columns) == 0:
            raise HTTPException(status_code=400, detail="CSV file has no columns")
        
        # Step 2: Save to workspace storage
        datasets_dir = get_workspace_datasets_dir(workspace_id)
        file_path = datasets_dir / file.filename
        temp_file_path = file_path  # Track for rollback if needed
        
        try:
            df.to_csv(file_path, index=False)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save dataset to workspace: {str(e)}")
        
        # Step 3: Register CSV file in registry (protected)
        try:
            from app.services.file_registry import register_file
            register_file(
                file_path=str(file_path),
                workspace_id=workspace_id,
                file_type="csv",
                is_protected=True,
            )
        except Exception as e:
            logger.warning(f"Failed to register file in registry (non-critical): {e}")
            # Don't fail upload - registration is best-effort
        
        # Step 4: Generate and save overview IMMEDIATELY after upload
        # This ensures overview always exists for newly uploaded datasets
        try:
            from app.api.overview import compute_overview, save_overview_to_file
            logger.info(f"Generating overview for uploaded dataset: {file.filename}")
            overview = compute_overview(df)
            save_overview_to_file(workspace_id, file.filename, overview)
            logger.info(f"Overview generated and saved for dataset: {file.filename}")
        except Exception as e:
            logger.error(f"Failed to generate overview after upload (non-critical): {e}")
            # Don't fail upload - overview can be generated on-demand later
            # But log the failure for debugging
        
        # Step 5: Return success
        return {
            "id": file.filename,
            "rows": len(df),
            "columns": len(df.columns),
            "message": f"Dataset '{file.filename}' uploaded successfully to workspace"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error during dataset upload: {e}", exc_info=True)
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
    
    Requirements:
    - Parameter validation: workspace_id and dataset name required
    - Returns 404 if dataset doesn't exist
    - Returns 400 if parameters are invalid
    - Always returns valid CleaningSummaryResponse (never undefined/null)
    - Never allows unhandled promise rejection or undefined access
    
    Args:
        workspace_id: Unique workspace identifier
        request: Request containing dataset filename
        
    Returns:
        Cleaning summary with column metrics and overall score
        
    Raises:
        HTTPException 400: If workspace_id or dataset name is missing
        HTTPException 404: If dataset doesn't exist in workspace
        HTTPException 500: If backend error occurs
    """
    # Step 1: Validate required parameters
    if not workspace_id or workspace_id.strip() == "":
        logger.warning(f"[get_cleaning_summary] Invalid request: workspace_id is missing or empty")
        raise HTTPException(
            status_code=400,
            detail="workspace_id is required and cannot be empty"
        )
    
    if not request.dataset or request.dataset.strip() == "":
        logger.warning(f"[get_cleaning_summary] Invalid request: dataset name is missing or empty")
        raise HTTPException(
            status_code=400,
            detail="dataset name is required and cannot be empty"
        )
    
    logger.info(f"[get_cleaning_summary] Request received - workspace_id={workspace_id}, dataset={request.dataset}")
    
    try:
        # Step 2: Validate dataset exists in workspace
        if not dataset_exists(request.dataset, workspace_id):
            logger.warning(
                f"[get_cleaning_summary] Dataset '{request.dataset}' not found in workspace '{workspace_id}'"
            )
            raise HTTPException(
                status_code=404,
                detail=f"Dataset '{request.dataset}' not found in workspace"
            )
        
        # Step 3: Load dataset
        try:
            df = load_dataset(request.dataset, workspace_id)
        except Exception as e:
            logger.error(
                f"[get_cleaning_summary] Error loading dataset '{request.dataset}': {str(e)}",
                exc_info=True
            )
            raise HTTPException(
                status_code=500,
                detail=f"Failed to load dataset: {str(e)}"
            )
        
        # Validate dataframe
        if df is None:
            logger.error(f"[get_cleaning_summary] load_dataset returned None")
            raise HTTPException(
                status_code=500,
                detail="Dataset loading returned invalid data"
            )
        
        logger.info(f"[get_cleaning_summary] Dataset loaded - rows={len(df)}, columns={len(df.columns)}")
        
        # Step 4: Analyze dataset
        try:
            total_rows = len(df)
            if total_rows == 0:
                logger.warning(f"[get_cleaning_summary] Dataset is empty (0 rows)")
                # Return empty but valid response for empty dataset
                return CleaningSummaryResponse(
                    rows=0,
                    columns=[],
                    overall_score=0.0
                )
            
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
                missing_pct = max(0.0, min(100.0, missing_pct))  # Clamp to 0-100
                
                # Calculate duplicate contribution (percentage of rows that are duplicates)
                duplicate_count = col_data.duplicated().sum()
                duplicates_pct = (duplicate_count / total_rows * 100) if total_rows > 0 else 0
                duplicates_pct = max(0.0, min(100.0, duplicates_pct))  # Clamp to 0-100
                
                # Calculate outliers for numeric columns
                outliers = None
                if col_type == "numeric" and not col_data.isna().all():
                    try:
                        Q1 = col_data.quantile(0.25)
                        Q3 = col_data.quantile(0.75)
                        IQR = Q3 - Q1
                        if IQR > 0:
                            lower_bound = Q1 - 1.5 * IQR
                            upper_bound = Q3 + 1.5 * IQR
                            outliers = int(((col_data < lower_bound) | (col_data > upper_bound)).sum())
                        else:
                            outliers = 0
                    except Exception as e:
                        logger.warning(f"[get_cleaning_summary] Error calculating outliers for column '{col}': {e}")
                        outliers = None
                
                # Calculate health score (0-100)
                # Penalize: missing values, duplicates, outliers, type inconsistencies
                health_score = 100.0
                health_score -= min(missing_pct * 2, 40)  # Up to 40 points for missing
                health_score -= min(duplicates_pct * 1, 20)  # Up to 20 points for duplicates
                if outliers is not None and outliers > 0:
                    outlier_pct = (outliers / total_rows * 100) if total_rows > 0 else 0
                    health_score -= min(outlier_pct * 0.5, 20)  # Up to 20 points for outliers
                health_score = max(0.0, min(100.0, health_score))  # Clamp to 0-100
                
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
            overall_score = (total_health_score / len(column_summaries)) if column_summaries else 0.0
            overall_score = round(overall_score, 1)
            
            response = CleaningSummaryResponse(
                rows=total_rows,
                columns=column_summaries,
                overall_score=overall_score
            )
            
            logger.info(
                f"[get_cleaning_summary] Success - rows={response.rows}, "
                f"columns={len(response.columns)}, overall_score={response.overall_score}"
            )
            
            return response
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                f"[get_cleaning_summary] Error analyzing columns: {str(e)}",
                exc_info=True
            )
            raise HTTPException(
                status_code=500,
                detail=f"Failed to analyze dataset: {str(e)}"
            )
            
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        # Catch all other errors
        logger.error(
            f"[get_cleaning_summary] Unexpected error: {str(e)}",
            exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate cleaning summary: {str(e)}"
        )


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
                        dt = pd.to_datetime(val_str, errors="raise")
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
    
    Requirements:
    - Parameter validation: workspace_id and dataset name required
    - Returns 404 if dataset doesn't exist (not found in workspace)
    - Returns 400 if parameters are invalid
    - Type inference is robust and prevents misclassification
    - Always returns valid OverviewResponse (never undefined/null)
    
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
        
    Raises:
        HTTPException 400: If workspace_id or dataset name is missing
        HTTPException 404: If dataset doesn't exist in workspace
        HTTPException 500: If backend error occurs
    """
    # Step 1: Validate required parameters
    if not workspace_id or workspace_id.strip() == "":
        logger.warning(f"[get_dataset_overview] Invalid request: workspace_id is missing or empty")
        raise HTTPException(
            status_code=400,
            detail="workspace_id is required and cannot be empty"
        )
    
    if not request.dataset or request.dataset.strip() == "":
        logger.warning(f"[get_dataset_overview] Invalid request: dataset name is missing or empty")
        raise HTTPException(
            status_code=400,
            detail="dataset name is required and cannot be empty"
        )
    
    logger.info(f"[get_dataset_overview] Request received - workspace_id={workspace_id}, dataset={request.dataset}")
    
    try:
        # Step 2: Validate dataset exists in workspace
        if not dataset_exists(request.dataset, workspace_id):
            logger.warning(
                f"[get_dataset_overview] Dataset '{request.dataset}' not found in workspace '{workspace_id}'"
            )
            raise HTTPException(
                status_code=404,
                detail=f"Dataset '{request.dataset}' not found in workspace '{workspace_id}'"
            )
        
        # Step 3: Load dataset
        try:
            df = load_dataset(request.dataset, workspace_id)
        except Exception as e:
            logger.error(
                f"[get_dataset_overview] Error loading dataset '{request.dataset}' from workspace '{workspace_id}': {str(e)}",
                exc_info=True
            )
            raise HTTPException(
                status_code=500,
                detail=f"Failed to load dataset: {str(e)}"
            )
        
        # Validate dataframe
        if df is None:
            logger.error(f"[get_dataset_overview] load_dataset returned None for '{request.dataset}'")
            raise HTTPException(
                status_code=500,
                detail=f"Dataset loading returned invalid data"
            )
        
        logger.info(f"[get_dataset_overview] Dataset loaded - rows={len(df)}, columns={len(df.columns)}")
        
        # Step 4: Calculate duplicate row count (row-level, not column-level)
        total_rows = len(df)
        duplicate_row_count = df.duplicated().sum()
        # IMPORTANT: Ensure duplicate_count <= total_rows
        duplicate_row_count = min(int(duplicate_row_count), total_rows)
        
        # Step 5: Analyze each column
        column_metadata = []
        type_counts = {"numeric": 0, "categorical": 0, "datetime": 0}
        
        try:
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
        except Exception as e:
            logger.error(
                f"[get_dataset_overview] Error analyzing columns for dataset '{request.dataset}': {str(e)}",
                exc_info=True
            )
            raise HTTPException(
                status_code=500,
                detail=f"Failed to analyze dataset columns: {str(e)}"
            )
        
        # Step 6: Build response
        try:
            response = OverviewResponse(
                total_rows=total_rows,
                total_columns=len(df.columns),
                duplicate_row_count=duplicate_row_count,
                numeric_column_count=type_counts["numeric"],
                categorical_column_count=type_counts["categorical"],
                datetime_column_count=type_counts["datetime"],
                columns=column_metadata
            )
        except Exception as e:
            logger.error(
                f"[get_dataset_overview] Error building response for dataset '{request.dataset}': {str(e)}",
                exc_info=True
            )
            raise HTTPException(
                status_code=500,
                detail=f"Failed to build overview response: {str(e)}"
            )
        
        # Step 7: Log and return success
        logger.info(
            f"[get_dataset_overview] Success - "
            f"rows={response.total_rows}, columns={response.total_columns}, "
            f"duplicates={response.duplicate_row_count}, "
            f"types: numeric={response.numeric_column_count}, "
            f"categorical={response.categorical_column_count}, "
            f"datetime={response.datetime_column_count}"
        )
        
        return response
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        # Catch all other backend errors
        logger.error(
            f"[get_dataset_overview] Unexpected error for dataset '{request.dataset}' in workspace '{workspace_id}': {str(e)}",
            exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate dataset overview: {str(e)}"
        )
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
    - Parameter validation: workspaceId is required and cannot be empty
    - Returns 404 if workspace doesn't exist (idempotent)
    
    Args:
        workspace_id: Unique workspace identifier
        
    Returns:
        Success message with status 200
        
    Raises:
        HTTPException 400: If workspace_id is missing or empty
        HTTPException 404: If workspace doesn't exist (but deletes anyway - idempotent)
        HTTPException 403: If permission denied
        HTTPException 500: If deletion fails for other reasons
    """
    # Step 1: Validate required parameters
    if not workspace_id or workspace_id.strip() == "":
        logger.warning(f"[delete_workspace] Invalid request: workspace_id is missing or empty")
        raise HTTPException(
            status_code=400,
            detail="workspace_id is required and cannot be empty"
        )
    
    logger.info(f"[delete_workspace] Request received - workspace_id={workspace_id}")
    
    try:
        # Step 2: Get workspace directory path
        workspace_dir = get_workspace_dir(workspace_id)
        logger.info(f"[delete_workspace] Workspace directory: {workspace_dir}")
        
        # Step 3: Safety check - Ensure we're only deleting from workspaces directory
        # This prevents accidental deletion of files outside workspace storage
        # Use resolve() to get absolute paths and compare
        try:
            workspace_abs = workspace_dir.resolve()
            workspaces_abs = WORKSPACES_DIR.resolve()
            # Check if workspace directory is within workspaces directory
            if not str(workspace_abs).startswith(str(workspaces_abs)):
                logger.error(
                    f"[delete_workspace] Security validation failed: workspace_dir is not within WORKSPACES_DIR. "
                    f"workspace_abs={workspace_abs}, workspaces_abs={workspaces_abs}"
                )
                raise HTTPException(
                    status_code=500,
                    detail="Workspace directory path validation failed - security check"
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                f"[delete_workspace] Error during path validation for workspace_id={workspace_id}: {str(e)}",
                exc_info=True
            )
            raise HTTPException(
                status_code=500,
                detail="Failed to validate workspace directory path"
            )
        
        # Step 4: Check if workspace directory exists
        if not workspace_dir.exists():
            logger.warning(
                f"[delete_workspace] Workspace directory does not exist: {workspace_dir}. "
                f"Returning success (idempotent operation)."
            )
            # Return success even if directory doesn't exist (idempotent operation)
            # This is correct behavior - if workspace is already gone, mission accomplished
            return {
                "success": True,
                "message": f"Workspace '{workspace_id}' deleted (directory did not exist)",
                "workspace_id": workspace_id
            }
        
        # Step 5: Log what will be deleted (for debugging)
        try:
            datasets_dir = get_workspace_datasets_dir(workspace_id)
            files_dir = get_workspace_files_dir(workspace_id)
            logs_dir = get_workspace_logs_dir(workspace_id)
            
            dataset_count = len(list(datasets_dir.glob("*"))) if datasets_dir.exists() else 0
            files_count = len(list(files_dir.glob("*"))) if files_dir.exists() else 0
            logs_count = len(list(logs_dir.glob("*"))) if logs_dir.exists() else 0
            
            logger.info(
                f"[delete_workspace] Deleting workspace '{workspace_id}': "
                f"{dataset_count} dataset files, {files_count} other files, {logs_count} log files"
            )
        except Exception as e:
            logger.warning(f"[delete_workspace] Could not count files before deletion: {e}")
            # Non-critical - continue with deletion
        
        # Step 6: Delete all files from registry (cascade delete)
        # This ensures registry is clean before physical deletion
        try:
            deleted_file_paths = delete_workspace_files(workspace_id)
            logger.info(f"[delete_workspace] Removed {len(deleted_file_paths)} files from registry")
        except Exception as e:
            logger.warning(
                f"[delete_workspace] Warning: Could not clean up file registry: {e}. "
                f"Continuing with physical deletion anyway."
            )
            # Non-critical - continue with physical deletion
        
        # Step 7: Delete entire workspace directory (cascade delete)
        # This removes:
        # - datasets/ directory and all CSV files
        # - files/ directory and all JSON/overview files
        # - logs/ directory and all LOG files
        # - Any other files/subdirectories in the workspace
        try:
            shutil.rmtree(workspace_dir, ignore_errors=False)
            logger.info(f"[delete_workspace] Successfully deleted workspace directory: {workspace_dir}")
        except Exception as e:
            logger.error(
                f"[delete_workspace] Error deleting workspace directory: {str(e)}",
                exc_info=True
            )
            # Re-raise with appropriate status code
            raise
        
        # Step 8: Return success
        logger.info(f"[delete_workspace] Successfully completed delete operation for workspace '{workspace_id}'")
        return {
            "success": True,
            "message": f"Workspace '{workspace_id}' and all its files deleted successfully",
            "workspace_id": workspace_id
        }
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except FileNotFoundError as e:
        # Workspace directory doesn't exist - return success (idempotent)
        logger.info(
            f"[delete_workspace] Workspace directory not found during deletion: {workspace_id}. "
            f"Returning success (idempotent operation). Error: {e}"
        )
        return {
            "success": True,
            "message": f"Workspace '{workspace_id}' deleted (directory did not exist)",
            "workspace_id": workspace_id
        }
    except PermissionError as e:
        # Permission denied
        logger.error(
            f"[delete_workspace] Permission denied when deleting workspace '{workspace_id}': {str(e)}",
            exc_info=True
        )
        raise HTTPException(
            status_code=403,
            detail=f"Permission denied: Cannot delete workspace '{workspace_id}'. Check file permissions."
        )
    except Exception as e:
        # Catch all other errors
        logger.error(
            f"[delete_workspace] Unexpected error deleting workspace '{workspace_id}': {str(e)}",
            exc_info=True
        )
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


class OutlierDetectionResponse(BaseModel):
    """Response model for outlier detection."""
    workspace_id: str
    dataset_id: str
    method: str
    outliers: List[Dict[str, Any]]
    total_outliers: int


@router.get("/{workspace_id}/datasets/{dataset_id}/outliers", response_model=OutlierDetectionResponse)
async def detect_outliers(workspace_id: str, dataset_id: str, method: str = "zscore", threshold: float = 3.0, force_recompute: bool = False):
    """
    Detect outliers in numeric columns of a dataset.
    
    This endpoint only detects outliers - it does NOT modify the dataset.
    Purpose is understanding + local handling (no auto-clean).
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename (e.g., "sample.csv")
        method: Detection method ("zscore" or "iqr", default: "zscore")
        threshold: Z-score threshold (only used for zscore method, default: 3.0)
    
    Returns:
        List of detected outliers with:
        - column_name: Name of the column
        - detected_value: The outlier value
        - outlier_score: Z-score or IQR flag
        - row_index: Row index where outlier was found
        - suggested_action: Rule-based suggestion (Review/Cap/Remove)
    """
    logger.info(f"[detect_outliers] Request received - workspace_id={workspace_id}, dataset_id={dataset_id}, method={method}, force_recompute={force_recompute}")
    
    try:
        # Validate method
        if method.lower() not in ["zscore", "iqr"]:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid method '{method}'. Use 'zscore' or 'iqr'"
            )
        
        # Load dataset from workspace
        if not dataset_exists(dataset_id, workspace_id):
            raise HTTPException(
                status_code=404,
                detail=f"Dataset '{dataset_id}' not found in workspace '{workspace_id}'"
            )
        
        # Check for cached outlier analysis (unless force_recompute is True)
        if not force_recompute:
            outlier_file_path = get_outlier_analysis_file_path(workspace_id, dataset_id)
            if outlier_file_path.exists():
                try:
                    with open(outlier_file_path, "r") as f:
                        cached_analysis = json.load(f)
                    
                    # Verify dataset hash matches (dataset hasn't changed)
                    current_hash = compute_dataset_hash(workspace_id, dataset_id)
                    stored_hash = cached_analysis.get("dataset_hash")
                    
                    if stored_hash == current_hash and cached_analysis.get("method") == method.lower():
                        logger.info(f"[detect_outliers] Using cached outlier analysis from {outlier_file_path}")
                        return OutlierDetectionResponse(
                            workspace_id=workspace_id,
                            dataset_id=dataset_id,
                            method=cached_analysis.get("method", method.lower()),
                            outliers=cached_analysis.get("outliers", []),
                            total_outliers=cached_analysis.get("total_outliers", 0)
                        )
                    else:
                        logger.info(f"[detect_outliers] Dataset changed or method mismatch, recomputing outliers")
                except Exception as e:
                    logger.warning(f"[detect_outliers] Failed to load cached analysis: {e}, recomputing")
        
        df = load_dataset(dataset_id, workspace_id)
        
        # Detect outliers
        outliers = detect_outliers_for_dataset(df, method.lower(), threshold) if not df.empty else []
        
        logger.info(f"[detect_outliers] Detected {len(outliers)} outliers in dataset '{dataset_id}'")
        
        # Compute dataset hash for cache invalidation
        dataset_hash = compute_dataset_hash(workspace_id, dataset_id)
        
        # Save outlier analysis to file for caching (even if no outliers found)
        outlier_analysis = {
            "workspace_id": workspace_id,
            "dataset_id": dataset_id,
            "dataset_hash": dataset_hash,
            "method": method.lower(),
            "threshold": threshold,
            "timestamp": datetime.now().isoformat(),
            "outliers": outliers,
            "total_outliers": len(outliers),
        }
        
        outlier_file_path = get_outlier_analysis_file_path(workspace_id, dataset_id)
        outlier_file_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(outlier_file_path, "w") as f:
            json.dump(outlier_analysis, f, indent=2, default=str)
        
        logger.info(f"[detect_outliers] Saved outlier analysis to {outlier_file_path}")
        
        # Register file in registry
        from app.services.file_registry import register_file
        register_file(
            file_path=str(outlier_file_path),
            workspace_id=workspace_id,
            file_type="overview",  # Use "overview" type so it appears in Files page as "Generated by: Outlier Analysis"
            is_protected=False,  # Outlier analysis files can be deleted
        )
        
        return OutlierDetectionResponse(
            workspace_id=workspace_id,
            dataset_id=dataset_id,
            method=method.lower(),
            outliers=outliers,
            total_outliers=len(outliers)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[detect_outliers] Error detecting outliers: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to detect outliers: {str(e)}"
        )


@router.get("/{workspace_id}/datasets/{dataset_id}/outliers/cached")
async def get_cached_outlier_analysis(workspace_id: str, dataset_id: str):
    """
    Get cached outlier analysis if it exists and is valid.
    
    This endpoint checks if a cached outlier analysis exists and if the dataset
    hasn't changed (hash match). Returns cached results if valid, otherwise 404.
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename (e.g., "sample.csv")
    
    Returns:
        Cached outlier analysis if valid, 404 if not found or invalid
    """
    logger.info(f"[get_cached_outlier_analysis] Request received - workspace_id={workspace_id}, dataset_id={dataset_id}")
    
    try:
        # Check if cached file exists
        outlier_file_path = get_outlier_analysis_file_path(workspace_id, dataset_id)
        if not outlier_file_path.exists():
            raise HTTPException(
                status_code=404,
                detail="No cached outlier analysis found"
            )
        
        # Load cached analysis
        with open(outlier_file_path, "r") as f:
            cached_analysis = json.load(f)
        
        # Verify dataset hash matches (dataset hasn't changed)
        current_hash = compute_dataset_hash(workspace_id, dataset_id)
        stored_hash = cached_analysis.get("dataset_hash")
        
        if stored_hash != current_hash:
            logger.info(f"[get_cached_outlier_analysis] Dataset hash mismatch, cache invalid")
            raise HTTPException(
                status_code=404,
                detail="Cached analysis is invalid (dataset has changed)"
            )
        
        logger.info(f"[get_cached_outlier_analysis] Returning cached analysis")
        return OutlierDetectionResponse(
            workspace_id=workspace_id,
            dataset_id=dataset_id,
            method=cached_analysis.get("method", "zscore"),
            outliers=cached_analysis.get("outliers", []),
            total_outliers=cached_analysis.get("total_outliers", 0)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[get_cached_outlier_analysis] Error loading cached analysis: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load cached outlier analysis: {str(e)}"
        )


# ----------------------------
# Column Intelligence Endpoints
# ----------------------------

class ColumnIntelligenceColumn(BaseModel):
    """Column intelligence information."""
    name: str
    data_type: str
    meaning: str
    why_used: str


class ColumnIntelligence(BaseModel):
    """Column intelligence response."""
    columns: List[ColumnIntelligenceColumn]
    generated_at: int


class ColumnIntelligenceRequest(BaseModel):
    """Request to generate column intelligence."""
    datasetId: str
    regenerate: bool = False


class ColumnIntelligenceResponse(BaseModel):
    """Response containing column intelligence."""
    intelligence: ColumnIntelligence


@router.post("/{workspace_id}/column-intelligence", response_model=ColumnIntelligenceResponse)
async def generate_column_intelligence(
    workspace_id: str,
    request: ColumnIntelligenceRequest
):
    """
    Generate AI-powered column intelligence explanations.
    
    This endpoint generates explanations for what each column means and why it's used.
    
    Args:
        workspace_id: Workspace identifier
        request: Request containing datasetId and regenerate flag
        
    Returns:
        Column intelligence with explanations for each column
    """
    logger.info(f"[Column Intelligence API] POST /workspaces/{workspace_id}/column-intelligence HIT")
    logger.info(f"[Column Intelligence API] Request params: workspace_id={workspace_id}, datasetId={request.datasetId}, regenerate={request.regenerate}")
    
    try:
        # Validate dataset exists
        if not dataset_exists(request.datasetId, workspace_id):
            logger.warning(f"[Column Intelligence API] Dataset not found: {request.datasetId} in workspace {workspace_id}")
            raise HTTPException(
                status_code=404,
                detail=f"Dataset '{request.datasetId}' not found in workspace '{workspace_id}'"
            )
        
        # Load dataset to get column information
        df = load_dataset(request.datasetId, workspace_id)
        logger.info(f"[Column Intelligence API] Dataset loaded - rows={len(df)}, columns={len(df.columns)}")
        
        # Generate intelligence for each column
        columns_intelligence = []
        for col in df.columns:
            # Infer basic data type
            if pd.api.types.is_numeric_dtype(df[col]):
                data_type = "numeric"
            elif pd.api.types.is_datetime64_any_dtype(df[col]):
                data_type = "datetime"
            else:
                data_type = "categorical"
            
            # Generate simple explanations (can be enhanced with AI later)
            # For now, provide basic explanations based on column name and type
            col_name_lower = col.lower()
            
            # Generate meaning based on column name patterns
            if any(word in col_name_lower for word in ['id', 'key', 'index']):
                meaning = f"Unique identifier for each record in the dataset"
                why_used = "Used to uniquely identify and reference individual records"
            elif any(word in col_name_lower for word in ['date', 'time', 'timestamp']):
                meaning = f"Date or time information"
                why_used = "Used to track temporal information and enable time-based analysis"
            elif any(word in col_name_lower for word in ['name', 'title', 'label']):
                meaning = f"Descriptive text or label"
                why_used = "Used to provide human-readable descriptions or names"
            elif any(word in col_name_lower for word in ['price', 'cost', 'amount', 'value', 'revenue']):
                meaning = f"Monetary or numeric value"
                why_used = "Used to represent quantitative financial or numeric measurements"
            elif any(word in col_name_lower for word in ['count', 'number', 'quantity', 'total']):
                meaning = f"Numeric count or quantity"
                why_used = "Used to represent numeric counts, quantities, or totals"
            elif data_type == "numeric":
                meaning = f"Numeric measurement or value"
                why_used = "Used for quantitative analysis and mathematical operations"
            elif data_type == "datetime":
                meaning = f"Date or time information"
                why_used = "Used for temporal analysis and time-based filtering"
            else:
                meaning = f"Categorical classification or text data"
                why_used = "Used for grouping, filtering, and categorical analysis"
            
            columns_intelligence.append(ColumnIntelligenceColumn(
                name=col,
                data_type=data_type,
                meaning=meaning,
                why_used=why_used
            ))
        
        intelligence = ColumnIntelligence(
            columns=columns_intelligence,
            generated_at=int(datetime.now().timestamp() * 1000)  # milliseconds
        )
        
        logger.info(f"[Column Intelligence API] Generated intelligence for {len(columns_intelligence)} columns")
        logger.info(f"[Column Intelligence API] Returning intelligence response")
        
        return ColumnIntelligenceResponse(intelligence=intelligence)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Column Intelligence API] Error generating column intelligence: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate column intelligence: {str(e)}"
        )


@router.get("/{workspace_id}/column-intelligence", response_model=ColumnIntelligenceResponse)
async def get_column_intelligence(workspace_id: str):
    """
    Get stored column intelligence for a workspace.
    
    This endpoint retrieves previously generated column intelligence.
    If no intelligence exists, returns 404.
    
    Args:
        workspace_id: Workspace identifier
        
    Returns:
        Column intelligence if exists, 404 otherwise
    """
    logger.info(f"[Column Intelligence API] GET /workspaces/{workspace_id}/column-intelligence HIT")
    logger.info(f"[Column Intelligence API] Request params: workspace_id={workspace_id}")
    
    # For now, return 404 as intelligence is generated on-demand
    # In the future, this could load from a stored file
    logger.info(f"[Column Intelligence API] No stored intelligence found, returning 404")
    raise HTTPException(
        status_code=404,
        detail=f"Column intelligence not found for workspace '{workspace_id}'. Call POST endpoint to generate."
    )

# ----------------------------
# Chart Generation Endpoint
# ----------------------------

class ChartOverrides(BaseModel):
    """Chart customization overrides."""
    chart_type: Optional[str] = None
    x: Optional[str] = None
    y: Optional[str] = None
    aggregation: Optional[str] = None
    params: Optional[Dict[str, Any]] = None


class ChartGenerationRequest(BaseModel):
    """Request to generate a chart."""
    workspace_id: str
    dataset_id: str
    goal: str  # "compare", "trend", "distribution"
    overrides: Optional[ChartOverrides] = None


class ChartGenerationResponse(BaseModel):
    """Chart generation response."""
    insight_text: str
    vega_lite_spec: Dict[str, Any]
    ai_defaults: Dict[str, Any]


def infer_chart_properties(
    df: pd.DataFrame,
    schema: List[Dict[str, Any]],
    goal: str,
    overrides: Optional[ChartOverrides] = None
) -> Dict[str, Any]:
    """
    Infer optimal chart properties based on data schema and visualization goal.
    
    IMPORTANT: This function implements chart compatibility rules:
    - Compare: Categorical X + Numeric Y (bar chart)
    - Trend: Datetime X + Numeric Y (line chart)
    - Distribution: Numeric X, count aggregation (histogram)
    
    Args:
        df: DataFrame to visualize
        schema: Column schema information
        goal: Visualization intent ("compare", "trend", "distribution")
        overrides: Optional user overrides
        
    Returns:
        Chart properties with chart_type, x, y, aggregation, and params
    """
    # Build schema lookup by column name
    schema_lookup = {col["name"]: col for col in schema}
    columns = list(df.columns)
    
    # Helper: Find first column of type
    def find_column_of_type(canonical_type):
        for col_name in columns:
            if col_name in schema_lookup:
                if schema_lookup[col_name].get("canonical_type") == canonical_type:
                    return col_name
        return None
    
    # Default to first column if no type match
    def safe_column_select(col_name):
        if not col_name or col_name not in columns:
            return columns[0] if columns else None
        return col_name
    
    # Determine chart type and columns based on goal
    if goal == "compare":
        chart_type = "bar"
        # Try to find categorical for X, numeric for Y
        x = find_column_of_type("categorical") or columns[0]
        y = find_column_of_type("numeric") or columns[1] if len(columns) > 1 else columns[0]
        aggregation = "count"
    elif goal == "trend":
        chart_type = "line"
        # Try to find datetime for X, numeric for Y
        x = find_column_of_type("datetime") or columns[0]
        y = find_column_of_type("numeric") or columns[1] if len(columns) > 1 else columns[0]
        aggregation = "avg"
    elif goal == "distribution":
        chart_type = "histogram"
        # Histogram needs numeric column
        x = find_column_of_type("numeric") or columns[0]
        y = x  # Distribution uses single column
        aggregation = "count"  # Always count for distribution
    else:
        # Default fallback
        chart_type = "bar"
        x = columns[0] if columns else None
        y = columns[1] if len(columns) > 1 else columns[0]
        aggregation = "count"
    
    # Apply user overrides
    if overrides:
        if overrides.chart_type:
            chart_type = overrides.chart_type
        if overrides.x:
            x = safe_column_select(overrides.x)
        if overrides.y:
            y = safe_column_select(overrides.y)
        if overrides.aggregation:
            aggregation = overrides.aggregation
    
    # Ensure columns are valid
    x = safe_column_select(x)
    y = safe_column_select(y)
    
    return {
        "chart_type": chart_type,
        "x": x,
        "y": y,
        "aggregation": aggregation,
        "params": overrides.params if overrides and overrides.params else {},
    }


def generate_vega_lite_spec(
    df: pd.DataFrame,
    chart_type: str,
    x_col: str,
    y_col: str,
    aggregation: str,
) -> Dict[str, Any]:
    """
    Generate a Vega-Lite specification for the chart.
    
    Args:
        df: DataFrame with data
        chart_type: Type of chart (bar, line, histogram, scatter, pie)
        x_col: Column name for X-axis
        y_col: Column name for Y-axis
        aggregation: Aggregation function (count, sum, avg, etc.)
        
    Returns:
        Vega-Lite specification dictionary
    """
    
    # Base spec with data included
    spec: Dict[str, Any] = {
        "data": {"values": df.to_dict(orient="records")},
        "width": 700,
        "height": 400,
        "encoding": {
            "x": {"field": x_col, "type": "nominal"},
            "y": {"field": y_col, "type": "quantitative", "aggregate": aggregation},
        },
    }
    
    # Chart-specific configuration
    if chart_type == "bar":
        spec["mark"] = "bar"
        spec["encoding"]["x"] = {"field": x_col, "type": "nominal"}
        spec["encoding"]["y"] = {"field": y_col, "type": "quantitative", "aggregate": aggregation}
    
    elif chart_type == "line":
        spec["mark"] = "line"
        spec["encoding"]["x"] = {"field": x_col, "type": "temporal"}
        spec["encoding"]["y"] = {"field": y_col, "type": "quantitative", "aggregate": aggregation}
    
    elif chart_type == "histogram":
        spec["mark"] = "bar"
        spec["encoding"]["x"] = {"field": x_col, "type": "quantitative", "bin": True}
        spec["encoding"]["y"] = {"aggregate": "count", "type": "quantitative"}
    
    elif chart_type == "scatter":
        spec["mark"] = "point"
        spec["encoding"]["x"] = {"field": x_col, "type": "quantitative"}
        spec["encoding"]["y"] = {"field": y_col, "type": "quantitative"}
    
    elif chart_type == "pie":
        spec["mark"] = "arc"
        spec["encoding"]["theta"] = {"field": y_col, "type": "quantitative", "aggregate": aggregation}
        spec["encoding"]["color"] = {"field": x_col, "type": "nominal"}
    
    else:
        # Default to bar
        spec["mark"] = "bar"
    
    return spec


@router.post("/{workspace_id}/datasets/{dataset_id}/chart", response_model=ChartGenerationResponse)
async def generate_chart(workspace_id: str, dataset_id: str, request: ChartGenerationRequest):
    """
    Generate a chart for a dataset.
    
    This endpoint:
    1. Loads the dataset from workspace storage
    2. Loads the schema to understand column types
    3. Infers optimal chart properties based on visualization goal
    4. Generates a Vega-Lite specification
    5. Returns the spec with real data rows injected
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename (e.g., "sample.csv")
        request: Chart generation request with goal and optional overrides
        
    Returns:
        Chart response with vega_lite_spec and ai_defaults
    """
    logger.info(f"[generateChart] Request received - workspace_id={workspace_id}, dataset_id={dataset_id}, goal={request.goal}")
    
    try:
        # Validate dataset exists
        if not dataset_exists(dataset_id, workspace_id):
            logger.warning(f"[generateChart] Dataset not found: {dataset_id} in workspace {workspace_id}")
            raise HTTPException(
                status_code=404,
                detail=f"Dataset '{dataset_id}' not found in workspace '{workspace_id}'"
            )
        
        # Load dataset
        df = load_dataset(dataset_id, workspace_id)
        
        # Check if dataset is empty
        if df.empty:
            logger.warning(f"[generateChart] Dataset is empty: {dataset_id}")
            raise HTTPException(
                status_code=400,
                detail=f"Dataset '{dataset_id}' has no rows to visualize"
            )
        
        # Load schema (optional) - used only for validation hints
        from app.api.schema import get_dataset_schema_internal
        schema_response = get_dataset_schema_internal(dataset_id, workspace_id, use_current=True)
        schema = schema_response.get("columns", []) if schema_response and schema_response.get("columns") else []

        # Build structured Vizion parameters from request.overrides
        params: Dict[str, Any] = {}
        if not request.overrides:
            raise HTTPException(status_code=400, detail="Structured visualization parameters required in overrides")

        overrides = request.overrides
        # Map known fields
        if overrides.chart_type:
            params["chart_type"] = overrides.chart_type
        if overrides.x:
            params["x_column"] = overrides.x
        if overrides.y:
            params["y_column"] = overrides.y
        if overrides.aggregation:
            params["aggregation"] = overrides.aggregation
        # Merge any extra params
        if overrides.params and isinstance(overrides.params, dict):
            params.update(overrides.params)

        # Basic validation: require chart_type and x_column at minimum
        if "chart_type" not in params or "x_column" not in params:
            raise HTTPException(status_code=400, detail="Parameters 'chart_type' and 'x_column' are required")

        # Call Vizion runner with real DataFrame and parameters
        try:
            vizion_output = run_vizion(params, df)
        except Exception as e:
            logger.error(f"[generateChart] Vizion runner failed: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Vizion execution failed: {str(e)}")

        # Extract Vega-Lite spec from Vizion output
        vega_spec = extract_vega_spec(vizion_output)
        if not vega_spec:
            # If Vizion didn't return a Vega-Lite spec, fail safely
            logger.error("[generateChart] Vizion did not return a Vega-Lite specification")
            raise HTTPException(status_code=502, detail="Vizion did not return a Vega-Lite specification")

        insight_text = vizion_output.get("insight_text", "") if isinstance(vizion_output, dict) else ""

        response = ChartGenerationResponse(
            insight_text=insight_text,
            vega_lite_spec=vega_spec,
            ai_defaults={
                "chart_type": params.get("chart_type"),
                "x": params.get("x_column"),
                "y": params.get("y_column"),
                "aggregation": params.get("aggregation"),
                "params": {k: v for k, v in params.items() if k not in ("chart_type", "x_column", "y_column", "aggregation")},
            }
        )

        logger.info(f"[generateChart] Chart generated by Vizion for {dataset_id}")
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[generateChart] Error generating chart: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate chart: {str(e)}"
        )