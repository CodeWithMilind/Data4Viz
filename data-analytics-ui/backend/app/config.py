"""Configuration settings for the Data4Viz backend."""

from pathlib import Path

# Base directory
BASE_DIR = Path(__file__).parent.parent

# Data directory (legacy - for backward compatibility)
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

# Workspaces directory - workspace is the single source of truth
# Each workspace has its own directory containing datasets and files
WORKSPACES_DIR = BASE_DIR / "workspaces"
WORKSPACES_DIR.mkdir(exist_ok=True)

# Allowed origins for CORS
ALLOWED_ORIGINS = ["http://localhost:3000"]

# Maximum sample rows for preview
MAX_PREVIEW_ROWS = 5


def get_workspace_dir(workspace_id: str) -> Path:
    """
    Get the storage directory for a specific workspace.
    
    Workspace is the single source of truth - all datasets and files
    belong to a workspace and are stored in workspace-specific directories.
    
    Args:
        workspace_id: Unique workspace identifier
        
    Returns:
        Path to workspace directory
    """
    workspace_dir = WORKSPACES_DIR / workspace_id
    workspace_dir.mkdir(exist_ok=True)
    return workspace_dir


def get_workspace_datasets_dir(workspace_id: str) -> Path:
    """
    Get the datasets directory for a workspace.
    
    This directory contains all CSV datasets (original + cleaned) for the workspace.
    """
    datasets_dir = get_workspace_dir(workspace_id) / "datasets"
    datasets_dir.mkdir(exist_ok=True)
    return datasets_dir


def get_workspace_logs_dir(workspace_id: str) -> Path:
    """
    Get the logs directory for a workspace.
    
    This directory contains cleaning operation logs.
    """
    logs_dir = get_workspace_dir(workspace_id) / "logs"
    logs_dir.mkdir(exist_ok=True)
    return logs_dir
