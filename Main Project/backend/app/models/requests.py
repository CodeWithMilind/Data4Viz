"""Request models for the cleaning API."""

from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class CleaningOperation(str, Enum):
    """Supported cleaning operations."""

    MISSING_VALUES = "missing_values"
    DUPLICATES = "duplicates"
    INVALID_FORMAT = "invalid_format"
    OUTLIERS = "outliers"


class CleaningRequest(BaseModel):
    """Request model for cleaning operations.
    
    IMPORTANT: workspace_id is required for workspace-aware operations.
    Workspace is the single source of truth - all datasets belong to a workspace.
    """

    workspace_id: str = Field(..., description="Workspace identifier (required)")
    dataset_id: str = Field(..., description="Dataset filename (without path)")
    operation: CleaningOperation = Field(..., description="Type of cleaning operation")
    column: Optional[str] = Field(None, description="Single column name (for single-column operations)")
    columns: Optional[List[str]] = Field(None, description="List of column names (for multi-column operations)")
    action: str = Field(..., description="Action to perform (e.g., 'drop_rows', 'fill_mean')")
    parameters: Optional[Dict[str, Any]] = Field(
        None, description="Additional parameters for the action (e.g., custom value, fixed date)"
    )
    preview: bool = Field(True, description="If True, return preview without saving. If False, apply and save.")

    class Config:
        json_schema_extra = {
            "example": {
                "workspace_id": "netflix",
                "dataset_id": "movie.csv",
                "operation": "missing_values",
                "column": "Age",
                "action": "fill_mean",
                "preview": True,
            }
        }
