"""Response models for the cleaning API."""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class CleaningResponse(BaseModel):
    """Response model for cleaning operations."""

    affected_rows: int = Field(..., description="Number of rows affected by the operation")
    affected_percentage: float = Field(..., description="Percentage of rows affected")
    before_sample: List[Dict[str, Any]] = Field(
        ..., description="Sample rows before cleaning (max 5 rows)", max_length=5
    )
    after_sample: List[Dict[str, Any]] = Field(
        ..., description="Sample rows after cleaning (max 5 rows)", max_length=5
    )
    warning: Optional[str] = Field(None, description="Warning message if applicable")
    summary: str = Field(..., description="Human-readable summary of the operation")
    success: bool = Field(True, description="Whether the operation was successful")


class ErrorResponse(BaseModel):
    """Error response model."""

    error: str = Field(..., description="Error message")
    detail: Optional[str] = Field(None, description="Additional error details")
