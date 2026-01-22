"""API endpoints for dataset management."""

from fastapi import APIRouter, HTTPException
from pathlib import Path
from app.config import DATA_DIR
from pydantic import BaseModel
from typing import List

router = APIRouter(prefix="/datasets", tags=["datasets"])


class DatasetListResponse(BaseModel):
    """Response model for dataset list."""

    datasets: List[str]


@router.get("", response_model=DatasetListResponse)
async def list_datasets():
    """
    List all available datasets in the data directory.

    Returns:
        List of CSV filenames (without path)
    """
    try:
        # Scan data directory for CSV files
        data_path = Path(DATA_DIR)
        if not data_path.exists():
            return DatasetListResponse(datasets=[])

        # Find all CSV files
        csv_files = [f.name for f in data_path.glob("*.csv") if f.is_file()]

        # Sort alphabetically for consistency
        csv_files.sort()

        return DatasetListResponse(datasets=csv_files)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list datasets: {str(e)}")
