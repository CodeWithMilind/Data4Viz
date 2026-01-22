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


def get_workspace_files_dir(workspace_id: str) -> Path:
    """
    Get the files directory for a workspace.
    
    This directory contains all workspace files including:
    - Original datasets (CSV)
    - Overview snapshots (JSON)
    - Logs (LOG)
    - Other derived artifacts (JSON)
    """
    files_dir = get_workspace_dir(workspace_id) / "files"
    files_dir.mkdir(exist_ok=True)
    return files_dir


def get_overview_file_path(workspace_id: str, dataset_id: str) -> Path:
    """
    Get the path to the overview JSON file for a dataset.
    
    Format: dataset_name_overview.json
    Example: netflix.csv -> netflix_overview.json
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename (e.g., "netflix.csv")
        
    Returns:
        Path to overview JSON file
    """
    files_dir = get_workspace_files_dir(workspace_id)
    # Remove .csv extension and add _overview.json
    dataset_name = Path(dataset_id).stem
    overview_filename = f"{dataset_name}_overview.json"
    return files_dir / overview_filename


def get_outlier_analysis_file_path(workspace_id: str, dataset_id: str) -> Path:
    """
    Get the path to the outlier analysis JSON file for a dataset.
    
    Format: dataset_name_outlier_analysis.json
    Example: netflix.csv -> netflix_outlier_analysis.json
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename (e.g., "netflix.csv")
        
    Returns:
        Path to outlier analysis JSON file
    """
    files_dir = get_workspace_files_dir(workspace_id)
    # Remove .csv extension and add _outlier_analysis.json
    dataset_name = Path(dataset_id).stem
    outlier_filename = f"{dataset_name}_outlier_analysis.json"
    return files_dir / outlier_filename
