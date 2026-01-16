"""Service for handling missing values."""

import pandas as pd
import numpy as np
from typing import Tuple, List
from app.utils.validators import validate_column_exists, validate_numeric_column, validate_action_for_operation


def handle_missing_values(
    df: pd.DataFrame, column: str, action: str, parameters: dict = None
) -> Tuple[pd.DataFrame, int, float, List[int]]:
    """
    Handle missing values in a column.

    Args:
        df: DataFrame to process
        column: Column name with missing values
        action: Action to perform (drop_rows, fill_mean, fill_median, fill_mode, fill_custom)
        parameters: Optional parameters (e.g., custom_value for fill_custom)

    Returns:
        Tuple of (cleaned_df, affected_rows, affected_percentage, affected_indices)
    """
    if parameters is None:
        parameters = {}

    validate_column_exists(df, column)
    validate_action_for_operation("missing_values", action, df[column].dtype)

    df_cleaned = df.copy()
    original_missing_count = df_cleaned[column].isna().sum()
    affected_indices = []

    if action == "drop_rows":
        # Drop rows where the column has missing values
        missing_mask = df_cleaned[column].isna()
        affected_indices = df_cleaned[missing_mask].index.tolist()
        df_cleaned = df_cleaned.dropna(subset=[column]).reset_index(drop=True)
        affected_rows = len(affected_indices)
        affected_percentage = (affected_rows / len(df) * 100.0) if len(df) > 0 else 0.0

    elif action == "fill_mean":
        validate_numeric_column(df_cleaned, column)
        mean_value = df_cleaned[column].mean()
        missing_mask = df_cleaned[column].isna()
        affected_indices = df_cleaned[missing_mask].index.tolist()
        df_cleaned[column] = df_cleaned[column].fillna(mean_value)
        affected_rows = original_missing_count
        affected_percentage = (affected_rows / len(df) * 100.0) if len(df) > 0 else 0.0

    elif action == "fill_median":
        validate_numeric_column(df_cleaned, column)
        median_value = df_cleaned[column].median()
        missing_mask = df_cleaned[column].isna()
        affected_indices = df_cleaned[missing_mask].index.tolist()
        df_cleaned[column] = df_cleaned[column].fillna(median_value)
        affected_rows = original_missing_count
        affected_percentage = (affected_rows / len(df) * 100.0) if len(df) > 0 else 0.0

    elif action == "fill_mode":
        mode_value = df_cleaned[column].mode()
        if len(mode_value) > 0:
            fill_value = mode_value[0]
        else:
            # If no mode exists, use the first non-null value or leave as is
            fill_value = df_cleaned[column].dropna().iloc[0] if len(df_cleaned[column].dropna()) > 0 else None
        missing_mask = df_cleaned[column].isna()
        affected_indices = df_cleaned[missing_mask].index.tolist()
        df_cleaned[column] = df_cleaned[column].fillna(fill_value)
        affected_rows = original_missing_count
        affected_percentage = (affected_rows / len(df) * 100.0) if len(df) > 0 else 0.0

    elif action == "fill_custom":
        if "custom_value" not in parameters:
            raise ValueError("Action 'fill_custom' requires 'custom_value' parameter")
        custom_value = parameters["custom_value"]
        missing_mask = df_cleaned[column].isna()
        affected_indices = df_cleaned[missing_mask].index.tolist()
        df_cleaned[column] = df_cleaned[column].fillna(custom_value)
        affected_rows = original_missing_count
        affected_percentage = (affected_rows / len(df) * 100.0) if len(df) > 0 else 0.0

    else:
        raise ValueError(f"Unknown action: {action}")

    return df_cleaned, affected_rows, affected_percentage, affected_indices
