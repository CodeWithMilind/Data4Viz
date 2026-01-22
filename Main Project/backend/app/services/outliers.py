"""Service for handling outliers."""

import pandas as pd
import numpy as np
from typing import Tuple, List
from app.utils.validators import validate_column_exists, validate_numeric_column


def detect_outliers_iqr(df: pd.DataFrame, column: str) -> pd.Series:
    """
    Detect outliers using IQR method.

    Args:
        df: DataFrame to analyze
        column: Column name to check

    Returns:
        Boolean Series indicating outliers
    """
    Q1 = df[column].quantile(0.25)
    Q3 = df[column].quantile(0.75)
    IQR = Q3 - Q1
    lower_bound = Q1 - 1.5 * IQR
    upper_bound = Q3 + 1.5 * IQR

    outlier_mask = (df[column] < lower_bound) | (df[column] > upper_bound)
    return outlier_mask


def detect_outliers_zscore(df: pd.DataFrame, column: str, threshold: float = 3.0) -> pd.Series:
    """
    Detect outliers using Z-score method.

    Args:
        df: DataFrame to analyze
        column: Column name to check
        threshold: Z-score threshold (default 3.0)

    Returns:
        Boolean Series indicating outliers
    """
    mean = df[column].mean()
    std = df[column].std()

    if std == 0:
        # No variation, no outliers
        return pd.Series([False] * len(df), index=df.index)

    z_scores = np.abs((df[column] - mean) / std)
    outlier_mask = z_scores > threshold
    return outlier_mask


def handle_outliers(
    df: pd.DataFrame, column: str, method: str, action: str
) -> Tuple[pd.DataFrame, int, float, List[int]]:
    """
    Handle outliers in a numeric column.

    Args:
        df: DataFrame to process
        column: Column name with outliers
        method: Detection method (IQR, Z-Score)
        action: Action to perform (cap, remove, ignore)

    Returns:
        Tuple of (cleaned_df, affected_rows, affected_percentage, affected_indices)
    """
    validate_column_exists(df, column)
    validate_numeric_column(df, column)

    df_cleaned = df.copy()

    # Detect outliers
    if method == "IQR":
        outlier_mask = detect_outliers_iqr(df_cleaned, column)
    elif method == "Z-Score":
        outlier_mask = detect_outliers_zscore(df_cleaned, column)
    else:
        raise ValueError(f"Unknown detection method: {method}")

    outlier_indices = df_cleaned[outlier_mask].index.tolist()
    outlier_count = len(outlier_indices)

    if action == "ignore":
        # Do nothing
        affected_rows = 0
        affected_percentage = 0.0
        affected_indices = []

    elif action == "cap":
        # Cap outliers to min/max bounds
        Q1 = df_cleaned[column].quantile(0.25)
        Q3 = df_cleaned[column].quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - 1.5 * IQR
        upper_bound = Q3 + 1.5 * IQR

        # Cap values
        df_cleaned.loc[df_cleaned[column] < lower_bound, column] = lower_bound
        df_cleaned.loc[df_cleaned[column] > upper_bound, column] = upper_bound

        affected_rows = outlier_count
        affected_percentage = (affected_rows / len(df) * 100.0) if len(df) > 0 else 0.0
        affected_indices = outlier_indices

    elif action == "remove":
        # Remove rows with outliers
        df_cleaned = df_cleaned[~outlier_mask].reset_index(drop=True)
        affected_rows = outlier_count
        affected_percentage = (affected_rows / len(df) * 100.0) if len(df) > 0 else 0.0
        affected_indices = outlier_indices

    else:
        raise ValueError(f"Unknown action: {action}")

    return df_cleaned, affected_rows, affected_percentage, affected_indices
