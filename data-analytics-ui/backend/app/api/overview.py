"""
Dataset Overview API.

IMPORTANT:
- Uses the SAME dataset loader as Data Cleaning
- Workspace is the single source of truth
- GET endpoint with QUERY PARAMS (no request body)
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Any
import pandas as pd
import logging

from app.services.dataset_loader import load_dataset, dataset_exists

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/overview", tags=["overview"])


# ----------------------------
# Models
# ----------------------------

class ColumnMetadata(BaseModel):
    name: str
    inferred_type: str  # numeric | datetime | categorical
    nullable: bool
    missing_count: int
    missing_percentage: float


class OverviewResponse(BaseModel):
    total_rows: int
    total_columns: int
    duplicate_row_count: int
    numeric_column_count: int
    categorical_column_count: int
    datetime_column_count: int
    columns: List[ColumnMetadata]
    column_insights: Dict[str, Dict[str, Any]]


# ----------------------------
# Helpers
# ----------------------------

def infer_column_type(df: pd.DataFrame, col: str) -> str:
    s = df[col]

    # 1) numeric first
    if pd.api.types.is_numeric_dtype(s):
        return "numeric"

    # 2) already datetime
    if pd.api.types.is_datetime64_any_dtype(s):
        return "datetime"

    # 3) numeric-like strings
    if s.dtype == "object":
        num = pd.to_numeric(s, errors="coerce")
        if num.notna().mean() > 0.8:
            return "numeric"

    # 4) datetime with sane years
    parsed = pd.to_datetime(s, errors="coerce", infer_datetime_format=True)
    if parsed.notna().mean() > 0.7:
        years = parsed.dropna().dt.year
        if not years.empty and years.between(1900, 2100).all():
            return "datetime"

    return "categorical"


# ----------------------------
# Endpoint
# ----------------------------

@router.get("", response_model=OverviewResponse)
async def get_overview(
    workspace_id: str = Query(...),
    dataset_id: str = Query(...)
):
    if not dataset_exists(dataset_id, workspace_id):
        raise HTTPException(
            status_code=404,
            detail=f"Dataset '{dataset_id}' not found in workspace '{workspace_id}'"
        )

    df = load_dataset(dataset_id, workspace_id)

    total_rows = len(df)
    total_columns = len(df.columns)
    duplicate_row_count = min(int(df.duplicated().sum()), total_rows)

    type_counts = {"numeric": 0, "categorical": 0, "datetime": 0}
    columns_meta: List[ColumnMetadata] = []

    # Column metadata
    for col in df.columns:
        inferred = infer_column_type(df, col)
        type_counts[inferred] += 1

        missing_count = int(df[col].isna().sum())
        missing_percentage = round(
            (missing_count / total_rows * 100) if total_rows else 0.0, 2
        )

        columns_meta.append(
            ColumnMetadata(
                name=col,
                inferred_type=inferred,
                nullable=missing_count > 0,
                missing_count=missing_count,
                missing_percentage=missing_percentage,
            )
        )

    # Column insights (used by Overview → Column Insights UI)
    # Return top 50 values to allow frontend to slice dynamically (5, 10, 20, custom)
    column_insights: Dict[str, Dict[str, Any]] = {}

    for col in df.columns:
        vc = df[col].value_counts(dropna=True).head(50)
        column_insights[col] = {
            "unique": int(df[col].nunique(dropna=True)),
            "top_values": vc.to_dict(),
        }

    return OverviewResponse(
        total_rows=total_rows,
        total_columns=total_columns,
        duplicate_row_count=duplicate_row_count,
        numeric_column_count=type_counts["numeric"],
        categorical_column_count=type_counts["categorical"],
        datetime_column_count=type_counts["datetime"],
        columns=columns_meta,
        column_insights=column_insights,
    )
