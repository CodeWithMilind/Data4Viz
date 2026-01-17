"""
Operation logs storage and retrieval.

IMPORTANT: Operation logs are stored per dataset (not per workspace).
Each dataset maintains its own append-only log of cleaning operations.
"""

import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
import logging

from app.config import get_workspace_files_dir

logger = logging.getLogger(__name__)


def get_dataset_logs_path(workspace_id: str, dataset_id: str) -> Path:
    """
    Get the path to the logs.json file for a dataset.
    
    Format: dataset_name_logs.json
    Example: movie.csv -> movie_logs.json
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename (e.g., "movie.csv")
        
    Returns:
        Path to logs JSON file
    """
    files_dir = get_workspace_files_dir(workspace_id)
    # Remove .csv extension and add _logs.json
    dataset_name = Path(dataset_id).stem
    logs_filename = f"{dataset_name}_logs.json"
    return files_dir / logs_filename


def append_operation_log(
    workspace_id: str,
    dataset_id: str,
    operation_type: str,
    column: Optional[str],
    column_type: Optional[str],
    strategy: Optional[str],
    affected_rows: int
) -> None:
    """
    Append an operation log entry to the dataset's logs.json file.
    
    This is an append-only operation. Logs are never deleted or modified.
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename
        operation_type: Type of operation (e.g., "missing_values", "duplicates")
        column: Column name (if applicable)
        column_type: Column canonical type (if applicable)
        strategy: Strategy used (if applicable)
        affected_rows: Number of rows affected
    """
    logs_path = get_dataset_logs_path(workspace_id, dataset_id)
    logs_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Create log entry
    log_entry = {
        "operation_type": operation_type,
        "column": column,
        "column_type": column_type,
        "strategy": strategy,
        "affected_rows": affected_rows,
        "timestamp": datetime.now().isoformat()
    }
    
    # Load existing logs
    logs = []
    if logs_path.exists():
        try:
            with open(logs_path, 'r', encoding='utf-8') as f:
                logs = json.load(f)
            if not isinstance(logs, list):
                logs = []
        except Exception as e:
            logger.warning(f"Failed to load existing logs from {logs_path}: {e}. Starting fresh.")
            logs = []
    
    # Append new log entry
    logs.append(log_entry)
    
    # Write back to file (append-only means we always write the full list)
    try:
        with open(logs_path, 'w', encoding='utf-8') as f:
            json.dump(logs, f, indent=2, ensure_ascii=False)
        logger.info(f"Appended operation log for dataset '{dataset_id}' in workspace '{workspace_id}'")
    except Exception as e:
        logger.error(f"Failed to write operation log to {logs_path}: {e}")
        raise


def get_operation_logs(workspace_id: str, dataset_id: str) -> List[Dict[str, Any]]:
    """
    Get all operation logs for a dataset.
    
    Returns logs in chronological order (oldest first).
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename
        
    Returns:
        List of log entries as dictionaries
    """
    logs_path = get_dataset_logs_path(workspace_id, dataset_id)
    
    if not logs_path.exists():
        return []
    
    try:
        with open(logs_path, 'r', encoding='utf-8') as f:
            logs = json.load(f)
        
        if not isinstance(logs, list):
            logger.warning(f"Logs file {logs_path} does not contain a list. Returning empty list.")
            return []
        
        # Return in chronological order (oldest first)
        return logs
    except Exception as e:
        logger.error(f"Failed to read operation logs from {logs_path}: {e}")
        return []
