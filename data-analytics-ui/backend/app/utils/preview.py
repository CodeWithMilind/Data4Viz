"""Preview utilities for showing before/after samples."""

import pandas as pd
from typing import List, Dict, Any, Tuple
from app.config import MAX_PREVIEW_ROWS


def get_preview_samples(
    df_before: pd.DataFrame, df_after: pd.DataFrame, affected_indices: List[int]
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Get sample rows for preview (before and after).

    Args:
        df_before: DataFrame before cleaning
        df_after: DataFrame after cleaning
        affected_indices: List of row indices that were affected

    Returns:
        Tuple of (before_sample, after_sample) lists of dictionaries
    """
    before_sample = []
    after_sample = []

    # If no affected indices, show first few rows
    if not affected_indices:
        sample_size = min(MAX_PREVIEW_ROWS, len(df_before))
        for i in range(sample_size):
            before_sample.append(df_before.iloc[i].to_dict())
            if i < len(df_after):
                after_sample.append(df_after.iloc[i].to_dict())
            else:
                after_sample.append({col: None for col in df_before.columns})
        return before_sample, after_sample

    # Get sample of affected rows
    sample_indices = affected_indices[:MAX_PREVIEW_ROWS]

    for idx in sample_indices:
        if idx < len(df_before):
            # Convert to dict, handling NaN values
            row_dict = df_before.iloc[idx].to_dict()
            # Convert NaN to None for JSON serialization
            row_dict = {k: (None if pd.isna(v) else v) for k, v in row_dict.items()}
            before_sample.append(row_dict)

        # Find corresponding row in after DataFrame
        # For removed rows, we might not find a match
        if idx < len(df_after):
            row_dict = df_after.iloc[idx].to_dict()
            row_dict = {k: (None if pd.isna(v) else v) for k, v in row_dict.items()}
            after_sample.append(row_dict)
        else:
            # Row was removed, show None or placeholder
            after_sample.append({col: None for col in df_before.columns})

    return before_sample, after_sample


def get_affected_rows_info(df_before: pd.DataFrame, df_after: pd.DataFrame) -> Tuple[int, float]:
    """
    Calculate affected rows count and percentage.

    Args:
        df_before: DataFrame before cleaning
        df_after: DataFrame after cleaning

    Returns:
        Tuple of (affected_rows, affected_percentage)
    """
    rows_before = len(df_before)
    rows_after = len(df_after)
    affected_rows = abs(rows_before - rows_after)

    if rows_before == 0:
        affected_percentage = 0.0
    else:
        affected_percentage = (affected_rows / rows_before) * 100.0

    return affected_rows, affected_percentage


def get_changed_rows_info(
    df_before: pd.DataFrame, df_after: pd.DataFrame, column: str
) -> Tuple[int, float, List[int]]:
    """
    Calculate changed rows count, percentage, and indices for a specific column.

    Args:
        df_before: DataFrame before cleaning
        df_after: DataFrame after cleaning
        column: Column name to check for changes

    Returns:
        Tuple of (changed_rows, changed_percentage, changed_indices)
    """
    if column not in df_before.columns or column not in df_after.columns:
        return 0, 0.0, []

    # Find rows where the column value changed
    min_len = min(len(df_before), len(df_after))
    changed_indices = []

    for idx in range(min_len):
        val_before = df_before.iloc[idx][column]
        val_after = df_after.iloc[idx][column]

        # Handle NaN comparisons
        if pd.isna(val_before) and pd.isna(val_after):
            continue
        if val_before != val_after:
            changed_indices.append(idx)

    changed_rows = len(changed_indices)
    total_rows = len(df_before)
    changed_percentage = (changed_rows / total_rows * 100.0) if total_rows > 0 else 0.0

    return changed_rows, changed_percentage, changed_indices
