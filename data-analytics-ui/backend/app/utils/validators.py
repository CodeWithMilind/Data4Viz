"""Validation utilities for cleaning operations."""

import pandas as pd
from typing import List, Optional


def validate_column_exists(df: pd.DataFrame, column: str) -> None:
    """
    Validate that a column exists in the DataFrame.

    Args:
        df: DataFrame to check
        column: Column name to validate

    Raises:
        ValueError: If column doesn't exist
    """
    if column not in df.columns:
        raise ValueError(f"Column '{column}' not found in dataset. Available columns: {list(df.columns)}")


def validate_columns_exist(df: pd.DataFrame, columns: List[str]) -> None:
    """
    Validate that all columns exist in the DataFrame.

    Args:
        df: DataFrame to check
        columns: List of column names to validate

    Raises:
        ValueError: If any column doesn't exist
    """
    missing = [col for col in columns if col not in df.columns]
    if missing:
        raise ValueError(f"Columns not found: {missing}. Available columns: {list(df.columns)}")


def validate_numeric_column(df: pd.DataFrame, column: str) -> None:
    """
    Validate that a column is numeric.

    Args:
        df: DataFrame to check
        column: Column name to validate

    Raises:
        ValueError: If column is not numeric
    """
    validate_column_exists(df, column)
    if not pd.api.types.is_numeric_dtype(df[column]):
        raise ValueError(f"Column '{column}' must be numeric. Current type: {df[column].dtype}")


def validate_action_for_operation(operation: str, action: str, column_type: Optional[str] = None) -> None:
    """
    Validate that an action is valid for the given operation.

    Args:
        operation: Cleaning operation type
        action: Action to validate
        column_type: Optional column data type for additional validation

    Raises:
        ValueError: If action is invalid for the operation
    """
    valid_actions = {
        "missing_values": ["drop_rows", "fill_mean", "fill_median", "fill_mode", "fill_custom"],
        "duplicates": ["keep_first", "keep_last", "remove_all"],
        "invalid_format": ["safe_convert", "remove_invalid", "replace_invalid"],
        "outliers": ["cap", "remove", "ignore"],
    }

    if operation not in valid_actions:
        raise ValueError(f"Unknown operation: {operation}")

    if action not in valid_actions[operation]:
        raise ValueError(
            f"Invalid action '{action}' for operation '{operation}'. "
            f"Valid actions: {valid_actions[operation]}"
        )

    # Additional validation for missing_values actions
    if operation == "missing_values" and column_type:
        numeric_only_actions = ["fill_mean", "fill_median"]
        if action in numeric_only_actions and not pd.api.types.is_numeric_dtype(column_type):
            raise ValueError(f"Action '{action}' can only be applied to numeric columns")


def validate_parameters(operation: str, action: str, parameters: Optional[dict]) -> None:
    """
    Validate that required parameters are provided.

    Args:
        operation: Cleaning operation type
        action: Action being performed
        parameters: Parameters dictionary

    Raises:
        ValueError: If required parameters are missing
    """
    if parameters is None:
        parameters = {}

    # Validate fill_custom requires custom_value
    if operation == "missing_values" and action == "fill_custom":
        if "custom_value" not in parameters:
            raise ValueError("Action 'fill_custom' requires 'custom_value' parameter")

    # Validate replace_invalid requires method
    if operation == "invalid_format" and action == "replace_invalid":
        if "method" not in parameters:
            raise ValueError("Action 'replace_invalid' requires 'method' parameter")

        # Validate method-specific parameters
        method = parameters.get("method")
        if method == "custom" and "custom_value" not in parameters:
            raise ValueError("Method 'custom' requires 'custom_value' parameter")
        if method == "fixed" and "fixed_date" not in parameters:
            raise ValueError("Method 'fixed' requires 'fixed_date' parameter")
