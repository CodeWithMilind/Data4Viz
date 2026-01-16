"""Cleaning logs storage and retrieval.

IMPORTANT: Cleaning logs are stored per workspace.
Each workspace maintains its own history of cleaning operations.
"""

import json
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime
from app.config import get_workspace_logs_dir


class CleaningLog:
    """Represents a single cleaning operation log entry."""
    
    def __init__(
        self,
        dataset_name: str,
        operation: str,
        action: str,
        rows_affected: int,
        parameters: Dict[str, Any] = None,
        timestamp: str = None
    ):
        self.dataset_name = dataset_name
        self.operation = operation
        self.action = action
        self.rows_affected = rows_affected
        self.parameters = parameters or {}
        self.timestamp = timestamp or datetime.now().isoformat()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert log entry to dictionary."""
        return {
            "dataset_name": self.dataset_name,
            "operation": self.operation,
            "action": self.action,
            "rows_affected": self.rows_affected,
            "parameters": self.parameters,
            "timestamp": self.timestamp,
        }


def save_cleaning_log(workspace_id: str, log: CleaningLog) -> None:
    """
    Save a cleaning operation log to workspace storage.
    
    Logs are stored as JSON files in the workspace logs directory.
    Each log entry is appended to a logs.json file.
    
    Args:
        workspace_id: Workspace identifier
        log: CleaningLog instance to save
    """
    logs_dir = get_workspace_logs_dir(workspace_id)
    logs_file = logs_dir / "cleaning_logs.json"
    
    # Load existing logs
    logs = []
    if logs_file.exists():
        try:
            with open(logs_file, 'r') as f:
                logs = json.load(f)
        except Exception:
            logs = []
    
    # Append new log
    logs.append(log.to_dict())
    
    # Save back to file
    with open(logs_file, 'w') as f:
        json.dump(logs, f, indent=2)


def get_cleaning_logs(workspace_id: str) -> List[Dict[str, Any]]:
    """
    Get all cleaning logs for a workspace.
    
    Returns logs in reverse chronological order (most recent first).
    
    Args:
        workspace_id: Workspace identifier
        
    Returns:
        List of log entries as dictionaries
    """
    logs_dir = get_workspace_logs_dir(workspace_id)
    logs_file = logs_dir / "cleaning_logs.json"
    
    if not logs_file.exists():
        return []
    
    try:
        with open(logs_file, 'r') as f:
            logs = json.load(f)
        # Sort by timestamp descending (most recent first)
        logs.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        return logs
    except Exception:
        return []
