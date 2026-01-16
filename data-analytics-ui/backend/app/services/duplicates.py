"""Service for handling duplicate rows."""

import pandas as pd
from typing import Tuple, List, Optional
from app.utils.validators import validate_columns_exist


def handle_duplicates(
    df: pd.DataFrame, action: str, columns: Optional[List[str]] = None
) -> Tuple[pd.DataFrame, int, float, List[int]]:
    """
    Handle duplicate rows.

    Args:
        df: DataFrame to process
        action: Action to perform (keep_first, keep_last, remove_all)
        columns: Optional list of columns to check for duplicates. If None, checks all columns.

    Returns:
        Tuple of (cleaned_df, affected_rows, affected_percentage, affected_indices)
    """
    df_cleaned = df.copy()

    # Determine which columns to use for duplicate detection
    if columns is None:
        subset = None  # Check all columns
    else:
        validate_columns_exist(df_cleaned, columns)
        subset = columns

    # Find duplicates (keep=False means mark all duplicates, including first occurrence)
    duplicate_mask = df_cleaned.duplicated(subset=subset, keep=False)
    duplicate_indices = df_cleaned[duplicate_mask].index.tolist()
    original_count = len(df)

    if action == "keep_first":
        # Remove duplicates, keeping first occurrence
        # Track which rows will be kept before dropping
        df_cleaned = df_cleaned.drop_duplicates(subset=subset, keep="first").reset_index(drop=True)
        removed_count = original_count - len(df_cleaned)
        affected_percentage = (removed_count / original_count * 100.0) if original_count > 0 else 0.0
        
        # For keep_first, we keep the first occurrence of each duplicate set
        # So affected_indices are all duplicates except the first one in each set
        # We need to identify which duplicates were kept vs removed
        df_temp = df.copy()
        first_occurrence_mask = ~df_temp.duplicated(subset=subset, keep="first")
        # Affected indices are duplicates that are NOT first occurrences
        affected_indices = [idx for idx in duplicate_indices if not first_occurrence_mask.iloc[idx]]

    elif action == "keep_last":
        # Remove duplicates, keeping last occurrence
        df_cleaned = df_cleaned.drop_duplicates(subset=subset, keep="last").reset_index(drop=True)
        removed_count = original_count - len(df_cleaned)
        affected_percentage = (removed_count / original_count * 100.0) if original_count > 0 else 0.0
        
        # For keep_last, we keep the last occurrence of each duplicate set
        df_temp = df.copy()
        last_occurrence_mask = ~df_temp.duplicated(subset=subset, keep="last")
        # Affected indices are duplicates that are NOT last occurrences
        affected_indices = [idx for idx in duplicate_indices if not last_occurrence_mask.iloc[idx]]

    elif action == "remove_all":
        # Remove ALL duplicate rows (including first/last occurrence)
        df_cleaned = df_cleaned.drop_duplicates(subset=subset, keep=False).reset_index(drop=True)
        removed_count = original_count - len(df_cleaned)
        affected_percentage = (removed_count / original_count * 100.0) if original_count > 0 else 0.0
        # All duplicate rows are affected (removed)
        affected_indices = duplicate_indices

    else:
        raise ValueError(f"Unknown action: {action}")

    affected_rows = removed_count

    return df_cleaned, affected_rows, affected_percentage, affected_indices
