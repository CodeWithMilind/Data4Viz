"""
Schema service for Data4Viz.

This service manages in-memory datasets (raw_df and current_df) per workspace+dataset
and provides schema inference as the single source of truth.

IMPORTANT: Schema is the single source of truth for column metadata.
"""

import pandas as pd
import numpy as np
from typing import Dict, Optional, Any, Tuple
from datetime import datetime
import logging
import json
from pathlib import Path

from app.services.dataset_loader import load_dataset, dataset_exists, save_dataset
from app.services.operation_logs import append_operation_log
from app.config import get_workspace_files_dir

logger = logging.getLogger(__name__)

# In-memory storage: {workspace_id: {dataset_id: {"raw_df": df, "current_df": df}}}
_dataset_cache: Dict[str, Dict[str, Dict[str, pd.DataFrame]]] = {}


def get_canonical_type(series: pd.Series) -> str:
    """
    Infer canonical type from pandas Series.
    
    Returns one of: numeric, categorical, datetime, boolean
    
    Args:
        series: pandas Series to analyze
        
    Returns:
        Canonical type string
    """
    # 1) Boolean first (explicit boolean dtype)
    if pd.api.types.is_bool_dtype(series):
        return "boolean"
    
    # 2) Numeric (int, float, or numeric-like strings)
    if pd.api.types.is_numeric_dtype(series):
        return "numeric"
    
    # 3) Already datetime
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"
    
    # 4) Numeric-like strings (object dtype but mostly numeric)
    if series.dtype == "object":
        num = pd.to_numeric(series, errors="coerce")
        if num.notna().mean() > 0.8:
            return "numeric"
    
    # 5) Datetime-like strings
    if series.dtype == "object":
        parsed = pd.to_datetime(series, errors="coerce", infer_datetime_format=True)
        if parsed.notna().mean() > 0.7:
            years = parsed.dropna().dt.year
            if not years.empty and years.between(1900, 2100).all():
                return "datetime"
    
    # 6) Boolean-like strings (True/False, Yes/No, 1/0)
    if series.dtype == "object":
        str_lower = series.astype(str).str.lower().str.strip()
        bool_like = str_lower.isin(["true", "false", "yes", "no", "1", "0", "y", "n"])
        if bool_like.mean() > 0.8:
            return "boolean"
    
    # 7) Default to categorical
    return "categorical"


def get_numeric_stats(series: pd.Series) -> Optional[Dict[str, Any]]:
    """
    Compute basic statistics for numeric columns.
    
    Args:
        series: pandas Series (should be numeric)
        
    Returns:
        Dictionary with stats or None if not numeric
    """
    if not pd.api.types.is_numeric_dtype(series):
        # Try to convert if it's numeric-like
        num_series = pd.to_numeric(series, errors="coerce")
        if num_series.notna().mean() < 0.8:
            return None
        series = num_series
    
    valid_series = series.dropna()
    
    if len(valid_series) == 0:
        return None
    
    stats = {
        "min": float(valid_series.min()) if not pd.isna(valid_series.min()) else None,
        "max": float(valid_series.max()) if not pd.isna(valid_series.max()) else None,
        "mean": float(valid_series.mean()) if not pd.isna(valid_series.mean()) else None,
        "median": float(valid_series.median()) if not pd.isna(valid_series.median()) else None,
        "std": float(valid_series.std()) if not pd.isna(valid_series.std()) else None,
        "q25": float(valid_series.quantile(0.25)) if not pd.isna(valid_series.quantile(0.25)) else None,
        "q75": float(valid_series.quantile(0.75)) if not pd.isna(valid_series.quantile(0.75)) else None,
    }
    
    return stats


def load_dataset_to_cache(workspace_id: str, dataset_id: str) -> bool:
    """
    Load dataset into in-memory cache (both raw_df and current_df).
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename
        
    Returns:
        True if loaded successfully, False otherwise
    """
    try:
        if not dataset_exists(dataset_id, workspace_id):
            logger.warning(f"Dataset '{dataset_id}' not found in workspace '{workspace_id}'")
            return False
        
        # Load dataset
        df = load_dataset(dataset_id, workspace_id)
        
        # Initialize workspace cache if needed
        if workspace_id not in _dataset_cache:
            _dataset_cache[workspace_id] = {}
        
        # Store both raw and current (initially they're the same)
        _dataset_cache[workspace_id][dataset_id] = {
            "raw_df": df.copy(),
            "current_df": df.copy()
        }
        
        logger.info(f"Loaded dataset '{dataset_id}' into cache for workspace '{workspace_id}'")
        return True
        
    except Exception as e:
        logger.error(f"Failed to load dataset '{dataset_id}' for workspace '{workspace_id}': {e}")
        return False


def get_raw_df(workspace_id: str, dataset_id: str) -> Optional[pd.DataFrame]:
    """
    Get raw (original) DataFrame from cache.
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename
        
    Returns:
        Raw DataFrame or None if not in cache
    """
    if workspace_id not in _dataset_cache:
        return None
    if dataset_id not in _dataset_cache[workspace_id]:
        return None
    return _dataset_cache[workspace_id][dataset_id].get("raw_df")


def get_current_df(workspace_id: str, dataset_id: str) -> Optional[pd.DataFrame]:
    """
    Get current (potentially modified) DataFrame from cache.
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename
        
    Returns:
        Current DataFrame or None if not in cache
    """
    if workspace_id not in _dataset_cache:
        return None
    if dataset_id not in _dataset_cache[workspace_id]:
        return None
    return _dataset_cache[workspace_id][dataset_id].get("current_df")


def update_current_df(workspace_id: str, dataset_id: str, df: pd.DataFrame) -> bool:
    """
    Update the current DataFrame in cache.
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename
        df: New DataFrame to store as current_df
        
    Returns:
        True if updated successfully, False otherwise
    """
    try:
        if workspace_id not in _dataset_cache:
            _dataset_cache[workspace_id] = {}
        if dataset_id not in _dataset_cache[workspace_id]:
            _dataset_cache[workspace_id][dataset_id] = {"raw_df": None, "current_df": None}
        
        _dataset_cache[workspace_id][dataset_id]["current_df"] = df.copy()
        logger.info(f"Updated current_df for dataset '{dataset_id}' in workspace '{workspace_id}'")
        return True
    except Exception as e:
        logger.error(f"Failed to update current_df for dataset '{dataset_id}': {e}")
        return False


def compute_schema(workspace_id: str, dataset_id: str, use_current: bool = True) -> Optional[Dict[str, Any]]:
    """
    Compute schema for a dataset.
    
    Schema is the single source of truth for column metadata.
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename
        use_current: If True, use current_df; if False, use raw_df
        
    Returns:
        Schema dictionary with columns and metadata, or None if dataset not in cache
    """
    # Get the appropriate DataFrame
    if use_current:
        df = get_current_df(workspace_id, dataset_id)
    else:
        df = get_raw_df(workspace_id, dataset_id)
    
    if df is None:
        # Try to load into cache
        if not load_dataset_to_cache(workspace_id, dataset_id):
            return None
        df = get_current_df(workspace_id, dataset_id) if use_current else get_raw_df(workspace_id, dataset_id)
        if df is None:
            return None
    
    total_rows = len(df)
    columns_schema = []
    
    for col in df.columns:
        series = df[col]
        canonical_type = get_canonical_type(series)
        pandas_dtype = str(series.dtype)
        
        missing_count = int(series.isna().sum())
        missing_percentage = round((missing_count / total_rows * 100) if total_rows > 0 else 0.0, 2)
        
        unique_count = int(series.nunique(dropna=True))
        
        column_info = {
            "name": col,
            "canonical_type": canonical_type,
            "pandas_dtype": pandas_dtype,
            "total_rows": total_rows,
            "missing_count": missing_count,
            "missing_percentage": missing_percentage,
            "unique_count": unique_count,
        }
        
        # Add numeric stats if applicable
        if canonical_type == "numeric":
            numeric_stats = get_numeric_stats(series)
            if numeric_stats:
                column_info["numeric_stats"] = numeric_stats
        
        columns_schema.append(column_info)
    
    return {
        "workspace_id": workspace_id,
        "dataset_id": dataset_id,
        "total_rows": total_rows,
        "total_columns": len(df.columns),
        "columns": columns_schema,
        "computed_at": datetime.now().isoformat(),
        "using_current": use_current
    }


def clear_cache(workspace_id: Optional[str] = None, dataset_id: Optional[str] = None):
    """
    Clear dataset cache.
    
    Args:
        workspace_id: If provided, clear only this workspace. If None, clear all.
        dataset_id: If provided, clear only this dataset. If None, clear all datasets in workspace.
    """
    if workspace_id is None:
        _dataset_cache.clear()
        logger.info("Cleared all dataset caches")
    elif dataset_id is None:
        if workspace_id in _dataset_cache:
            del _dataset_cache[workspace_id]
            logger.info(f"Cleared cache for workspace '{workspace_id}'")
    else:
        if workspace_id in _dataset_cache and dataset_id in _dataset_cache[workspace_id]:
            del _dataset_cache[workspace_id][dataset_id]
            logger.info(f"Cleared cache for dataset '{dataset_id}' in workspace '{workspace_id}'")


def get_cleaned_dataset_filename(dataset_id: str) -> str:
    """
    Get the filename for the cleaned dataset.
    
    Format: dataset_name_data_cleaned.csv
    Example: movie.csv -> movie_data_cleaned.csv
    
    Args:
        dataset_id: Original dataset filename
        
    Returns:
        Cleaned dataset filename
    """
    dataset_name = Path(dataset_id).stem
    return f"{dataset_name}_data_cleaned.csv"


def get_cleaning_summary_filename(dataset_id: str) -> str:
    """
    Get the filename for the cleaning summary metadata JSON.
    
    Format: dataset_name_data_cleaning_summary.json
    Example: movie.csv -> movie_data_cleaning_summary.json
    
    Args:
        dataset_id: Original dataset filename
        
    Returns:
        Cleaning summary filename
    """
    dataset_name = Path(dataset_id).stem
    return f"{dataset_name}_data_cleaning_summary.json"


def save_cleaned_dataset(
    workspace_id: str,
    dataset_id: str,
    df: pd.DataFrame
) -> str:
    """
    Save the cleaned dataset to a single file (overwrites if exists).
    
    This maintains ONE cleaned dataset file per workspace + dataset.
    The file is always overwritten with the latest cleaned state.
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Original dataset filename
        df: Cleaned DataFrame to save
        
    Returns:
        Filename of the saved cleaned dataset
    """
    cleaned_filename = get_cleaned_dataset_filename(dataset_id)
    saved_filename = save_dataset(
        df=df,
        dataset_id=cleaned_filename,
        workspace_id=workspace_id,
        create_new_file=False  # Overwrite same file
    )
    logger.info(f"Saved cleaned dataset '{saved_filename}' for dataset '{dataset_id}' in workspace '{workspace_id}'")
    return saved_filename


def append_cleaning_metadata(
    workspace_id: str,
    dataset_id: str,
    operation_type: str,
    column: Optional[str],
    strategy: str,
    affected_rows: int
) -> None:
    """
    Append a cleaning operation to the cumulative metadata JSON file.
    
    This maintains ONE metadata JSON file per dataset that accumulates
    all cleaning operations in chronological order.
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Original dataset filename
        operation_type: Type of operation (e.g., "missing_values", "duplicates")
        column: Column name (if applicable)
        strategy: Strategy used
        affected_rows: Number of rows affected
    """
    files_dir = get_workspace_files_dir(workspace_id)
    summary_filename = get_cleaning_summary_filename(dataset_id)
    summary_path = files_dir / summary_filename
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Load existing metadata
    metadata = {
        "workspace_id": workspace_id,
        "dataset_id": dataset_id,
        "operations": []
    }
    if summary_path.exists():
        try:
            with open(summary_path, 'r', encoding='utf-8') as f:
                existing = json.load(f)
                if isinstance(existing, dict) and "operations" in existing:
                    metadata = existing
        except Exception as e:
            logger.warning(f"Failed to load existing cleaning metadata from {summary_path}: {e}. Starting fresh.")
    
    # Append new operation
    operation_entry = {
        "operation_type": operation_type,
        "column": column,
        "strategy": strategy,
        "affected_rows": affected_rows,
        "timestamp": datetime.now().isoformat()
    }
    metadata["operations"].append(operation_entry)
    metadata["last_updated"] = datetime.now().isoformat()
    
    # Save back to file
    try:
        with open(summary_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)
        logger.info(f"Appended cleaning metadata for dataset '{dataset_id}' in workspace '{workspace_id}'")
    except Exception as e:
        logger.error(f"Failed to write cleaning metadata to {summary_path}: {e}")
        raise


def clean_missing_values(
    workspace_id: str,
    dataset_id: str,
    column: str,
    strategy: str,
    constant_value: Optional[Any] = None,
    preview: bool = False
) -> Tuple[Optional[pd.DataFrame], int, Optional[str]]:
    """
    Clean missing values in a column using specified strategy.
    
    This function:
    - Gets current_df from cache (loads if needed)
    - Validates strategy based on column canonical_type
    - Applies cleaning operation
    - Updates current_df in cache
    - Returns cleaned DataFrame, affected row count, and error message
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename
        column: Column name to clean
        strategy: Cleaning strategy (drop, fill_mean, fill_median, fill_mode, fill_constant)
        constant_value: Value to use for fill_constant strategy
        
    Returns:
        Tuple of (cleaned_df, affected_rows, error_message)
        If error occurs, returns (None, 0, error_message)
    """
    try:
        # Get current_df (load into cache if needed)
        df = get_current_df(workspace_id, dataset_id)
        if df is None:
            if not load_dataset_to_cache(workspace_id, dataset_id):
                return None, 0, f"Failed to load dataset '{dataset_id}' into cache"
            df = get_current_df(workspace_id, dataset_id)
            if df is None:
                return None, 0, f"Dataset '{dataset_id}' not available in cache"
        
        # Validate column exists
        if column not in df.columns:
            return None, 0, f"Column '{column}' not found in dataset"
        
        # Get column schema to determine canonical type
        schema = compute_schema(workspace_id, dataset_id, use_current=True)
        if schema is None:
            return None, 0, "Failed to compute schema"
        
        # Find column in schema
        column_info = None
        for col_info in schema["columns"]:
            if col_info["name"] == column:
                column_info = col_info
                break
        
        if column_info is None:
            return None, 0, f"Column '{column}' not found in schema"
        
        canonical_type = column_info["canonical_type"]
        original_missing_count = int(df[column].isna().sum())
        
        # Validate strategy based on canonical_type
        if strategy == "drop":
            # Drop strategy works for all types
            pass
        elif strategy in ["fill_mean", "fill_median"]:
            if canonical_type != "numeric":
                return None, 0, f"Strategy '{strategy}' can only be used with numeric columns. Column '{column}' is '{canonical_type}'"
        elif strategy == "fill_mode":
            # Fill mode works for all types except boolean (though it can work for boolean too)
            pass
        elif strategy == "fill_constant":
            if constant_value is None:
                return None, 0, "constant_value is required for 'fill_constant' strategy"
        else:
            return None, 0, f"Unknown strategy: '{strategy}'. Valid strategies: drop, fill_mean, fill_median, fill_mode, fill_constant"
        
        # Apply cleaning operation
        df_cleaned = df.copy()
        affected_rows = 0
        
        if strategy == "drop":
            # Drop rows where the column has missing values
            missing_mask = df_cleaned[column].isna()
            affected_rows = int(missing_mask.sum())
            df_cleaned = df_cleaned.dropna(subset=[column]).reset_index(drop=True)
            
        elif strategy == "fill_mean":
            mean_value = df_cleaned[column].mean()
            if pd.isna(mean_value):
                return None, 0, f"Cannot compute mean for column '{column}' (all values are missing)"
            df_cleaned[column] = df_cleaned[column].fillna(mean_value)
            affected_rows = original_missing_count
            
        elif strategy == "fill_median":
            median_value = df_cleaned[column].median()
            if pd.isna(median_value):
                return None, 0, f"Cannot compute median for column '{column}' (all values are missing)"
            df_cleaned[column] = df_cleaned[column].fillna(median_value)
            affected_rows = original_missing_count
            
        elif strategy == "fill_mode":
            mode_values = df_cleaned[column].mode()
            if len(mode_values) > 0:
                fill_value = mode_values[0]
            else:
                # If no mode exists, use the first non-null value
                non_null_values = df_cleaned[column].dropna()
                if len(non_null_values) > 0:
                    fill_value = non_null_values.iloc[0]
                else:
                    return None, 0, f"Cannot compute mode for column '{column}' (all values are missing)"
            df_cleaned[column] = df_cleaned[column].fillna(fill_value)
            affected_rows = original_missing_count
            
        elif strategy == "fill_constant":
            df_cleaned[column] = df_cleaned[column].fillna(constant_value)
            affected_rows = original_missing_count
        
        # Only update current_df, save files, and log if not in preview mode
        if not preview:
            # Update current_df in cache
            if not update_current_df(workspace_id, dataset_id, df_cleaned):
                return None, 0, "Failed to update current_df in cache"
            
            # Save cleaned dataset to file (overwrite same file)
            try:
                save_cleaned_dataset(workspace_id, dataset_id, df_cleaned)
            except Exception as e:
                logger.error(f"Failed to save cleaned dataset for '{dataset_id}': {e}")
                return None, 0, f"Failed to save cleaned dataset: {str(e)}"
            
            # Append to cumulative metadata JSON
            try:
                append_cleaning_metadata(
                    workspace_id=workspace_id,
                    dataset_id=dataset_id,
                    operation_type="missing_values",
                    column=column,
                    strategy=strategy,
                    affected_rows=affected_rows
                )
            except Exception as e:
                logger.warning(f"Failed to save cleaning metadata for dataset '{dataset_id}': {e}")
                # Don't fail the operation if metadata save fails
            
            # Log the operation (for logs endpoint)
            try:
                append_operation_log(
                    workspace_id=workspace_id,
                    dataset_id=dataset_id,
                    operation_type="missing_values",
                    column=column,
                    column_type=canonical_type,
                    strategy=strategy,
                    affected_rows=affected_rows
                )
            except Exception as e:
                logger.warning(f"Failed to log operation for dataset '{dataset_id}': {e}")
                # Don't fail the operation if logging fails
            
            logger.info(
                f"Applied missing value cleaning: strategy='{strategy}', column='{column}', "
                f"affected_rows={affected_rows} for dataset '{dataset_id}' in workspace '{workspace_id}'"
            )
        else:
            logger.info(
                f"Previewed missing value cleaning: strategy='{strategy}', column='{column}', "
                f"affected_rows={affected_rows} for dataset '{dataset_id}' in workspace '{workspace_id}'"
            )
        
        return df_cleaned, affected_rows, None
        
    except Exception as e:
        logger.error(f"Error cleaning missing values: {e}")
        return None, 0, str(e)
