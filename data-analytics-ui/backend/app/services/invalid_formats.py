"""Service for handling invalid format values."""

import pandas as pd
import numpy as np
from typing import Tuple, List
from datetime import datetime
from app.utils.validators import validate_column_exists


def is_numeric_string(value: any) -> bool:
    """Check if a value can be converted to numeric."""
    if pd.isna(value):
        return False
    try:
        float(str(value))
        return True
    except (ValueError, TypeError):
        return False


def is_datetime_string(value: any) -> bool:
    """Check if a value can be converted to datetime."""
    if pd.isna(value):
        return False
    try:
        pd.to_datetime(str(value))
        return True
    except (ValueError, TypeError, pd.errors.ParserError):
        return False


def handle_invalid_formats(
    df: pd.DataFrame, column: str, expected_type: str, action: str, parameters: dict = None
) -> Tuple[pd.DataFrame, int, float, List[int]]:
    """
    Handle invalid format values in a column.

    Args:
        df: DataFrame to process
        column: Column name with invalid values
        expected_type: Expected data type (numeric, datetime, categorical)
        action: Action to perform (safe_convert, remove_invalid, replace_invalid)
        parameters: Optional parameters (method, custom_value, fixed_date)

    Returns:
        Tuple of (cleaned_df, affected_rows, affected_percentage, affected_indices)
    """
    if parameters is None:
        parameters = {}

    validate_column_exists(df, column)
    df_cleaned = df.copy()

    # Identify invalid values based on expected type
    invalid_mask = pd.Series([False] * len(df_cleaned), index=df_cleaned.index)

    if expected_type == "numeric":
        # Check which values are not numeric
        for idx in df_cleaned.index:
            value = df_cleaned.loc[idx, column]
            if not is_numeric_string(value):
                invalid_mask.loc[idx] = True

    elif expected_type == "datetime":
        # Check which values are not valid datetime
        for idx in df_cleaned.index:
            value = df_cleaned.loc[idx, column]
            if not is_datetime_string(value):
                invalid_mask.loc[idx] = True

    else:  # categorical - no strict validation, just pass through
        invalid_mask = pd.Series([False] * len(df_cleaned), index=df_cleaned.index)

    invalid_indices = df_cleaned[invalid_mask].index.tolist()
    invalid_count = len(invalid_indices)

    if action == "safe_convert":
        # Convert only values that can be parsed correctly
        if expected_type == "numeric":
            for idx in df_cleaned.index:
                value = df_cleaned.loc[idx, column]
                if invalid_mask.loc[idx] and is_numeric_string(value):
                    try:
                        df_cleaned.loc[idx, column] = float(str(value))
                        invalid_mask.loc[idx] = False
                    except (ValueError, TypeError):
                        pass  # Leave unconvertible values unchanged

        elif expected_type == "datetime":
            for idx in df_cleaned.index:
                value = df_cleaned.loc[idx, column]
                if invalid_mask.loc[idx] and is_datetime_string(value):
                    try:
                        df_cleaned.loc[idx, column] = pd.to_datetime(str(value))
                        invalid_mask.loc[idx] = False
                    except (ValueError, TypeError, pd.errors.ParserError):
                        pass  # Leave unconvertible values unchanged

        # Recalculate invalid indices after conversion
        invalid_indices = df_cleaned[invalid_mask].index.tolist()
        affected_rows = invalid_count - len(invalid_indices)  # Number of successfully converted
        affected_percentage = (affected_rows / len(df) * 100.0) if len(df) > 0 else 0.0

    elif action == "remove_invalid":
        # Remove rows with invalid values
        df_cleaned = df_cleaned[~invalid_mask].reset_index(drop=True)
        affected_rows = len(invalid_indices)
        affected_percentage = (affected_rows / len(df) * 100.0) if len(df) > 0 else 0.0

    elif action == "replace_invalid":
        # Replace invalid values based on method
        method = parameters.get("method", "mean")

        if expected_type == "numeric":
            if method == "mean":
                replace_value = df_cleaned[column].apply(lambda x: float(x) if is_numeric_string(x) else np.nan).mean()
            elif method == "median":
                numeric_values = df_cleaned[column].apply(
                    lambda x: float(x) if is_numeric_string(x) else np.nan
                )
                replace_value = numeric_values.median()
            elif method == "zero":
                replace_value = 0
            elif method == "custom":
                if "custom_value" not in parameters:
                    raise ValueError("Method 'custom' requires 'custom_value' parameter")
                replace_value = float(parameters["custom_value"])
            else:
                raise ValueError(f"Unknown method: {method}")

            for idx in invalid_indices:
                df_cleaned.loc[idx, column] = replace_value

        elif expected_type == "datetime":
            if method == "null":
                replace_value = pd.NaT
            elif method == "fixed":
                if "fixed_date" not in parameters:
                    raise ValueError("Method 'fixed' requires 'fixed_date' parameter")
                replace_value = pd.to_datetime(parameters["fixed_date"])
            elif method == "most_frequent":
                # Find most frequent valid datetime
                valid_dates = df_cleaned[column].apply(
                    lambda x: pd.to_datetime(str(x)) if is_datetime_string(x) else pd.NaT
                )
                replace_value = valid_dates.mode()[0] if len(valid_dates.mode()) > 0 else pd.NaT
            else:
                raise ValueError(f"Unknown method: {method}")

            for idx in invalid_indices:
                df_cleaned.loc[idx, column] = replace_value

        else:  # categorical
            if method == "normalize":
                # Normalize text (lowercase, trim)
                for idx in invalid_indices:
                    value = str(df_cleaned.loc[idx, column])
                    df_cleaned.loc[idx, column] = value.lower().strip()
            elif method == "unknown":
                replace_value = "Unknown"
                for idx in invalid_indices:
                    df_cleaned.loc[idx, column] = replace_value
            else:
                raise ValueError(f"Unknown method: {method}")

        affected_rows = len(invalid_indices)
        affected_percentage = (affected_rows / len(df) * 100.0) if len(df) > 0 else 0.0

    else:
        raise ValueError(f"Unknown action: {action}")

    return df_cleaned, affected_rows, affected_percentage, invalid_indices
