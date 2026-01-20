"""File registry service for tracking workspace file ownership and metadata.

This service enforces strict workspace ownership:
- Every file MUST belong to exactly one workspace
- Files store: workspace_id, file_type, is_protected
- CSV files are protected and cannot be deleted manually
"""

from pathlib import Path
from typing import Dict, List, Optional, Set
import json
import logging
from datetime import datetime
from app.config import WORKSPACES_DIR, get_workspace_dir

logger = logging.getLogger(__name__)

# File registry path (stores metadata for all files)
FILE_REGISTRY_PATH = WORKSPACES_DIR / ".file_registry.json"


class FileMetadata:
    """Metadata for a file in the workspace system."""

    def __init__(
        self,
        file_path: str,
        workspace_id: str,
        file_type: str,
        is_protected: bool = False,
        created_at: Optional[str] = None,
    ):
        self.file_path = file_path
        self.workspace_id = workspace_id
        self.file_type = file_type  # "csv", "overview", "insight", "log", "artifact"
        self.is_protected = is_protected
        self.created_at = created_at or datetime.now().isoformat()

    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON storage."""
        return {
            "file_path": self.file_path,
            "workspace_id": self.workspace_id,
            "file_type": self.file_type,
            "is_protected": self.is_protected,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "FileMetadata":
        """Create from dictionary."""
        return cls(
            file_path=data["file_path"],
            workspace_id=data["workspace_id"],
            file_type=data["file_type"],
            is_protected=data.get("is_protected", False),
            created_at=data.get("created_at"),
        )


def _load_registry() -> Dict[str, Dict]:
    """Load file registry from disk."""
    if not FILE_REGISTRY_PATH.exists():
        return {}
    try:
        with open(FILE_REGISTRY_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load file registry: {e}")
        return {}


def _save_registry(registry: Dict[str, Dict]) -> None:
    """Save file registry to disk."""
    try:
        FILE_REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(FILE_REGISTRY_PATH, "w", encoding="utf-8") as f:
            json.dump(registry, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to save file registry: {e}")
        raise


def register_file(
    file_path: str,
    workspace_id: str,
    file_type: str,
    is_protected: bool = False,
) -> None:
    """
    Register a file in the file registry.
    
    Args:
        file_path: Relative path to file (from workspace root or absolute)
        workspace_id: Workspace that owns this file
        file_type: Type of file ("csv", "overview", "insight", "log", "artifact", "notebook")
        is_protected: Whether file is protected from deletion (CSV files and system notebooks are protected)
    
    Raises:
        ValueError: If workspace_id is missing
    """
    # Auto-detect protection for system notebooks
    if not is_protected:
        path_str = str(file_path)
        # System notebooks in notebooks/ subdirectory are protected
        if "notebooks/" in path_str and path_str.endswith(".ipynb"):
            is_protected = True
    """
    Register a file in the file registry.
    
    Args:
        file_path: Relative path to file (from workspace root or absolute)
        workspace_id: Workspace that owns this file
        file_type: Type of file ("csv", "overview", "insight", "log", "artifact")
        is_protected: Whether file is protected from deletion (CSV files are protected)
    
    Raises:
        ValueError: If workspace_id is missing
    """
    if not workspace_id:
        raise ValueError("workspace_id is required for file registration")
    
    registry = _load_registry()
    
    # Normalize file path (use absolute path as key)
    abs_path = str(Path(file_path).resolve())
    
    metadata = FileMetadata(
        file_path=abs_path,
        workspace_id=workspace_id,
        file_type=file_type,
        is_protected=is_protected,
    )
    
    registry[abs_path] = metadata.to_dict()
    _save_registry(registry)
    
    logger.info(
        f"Registered file: {file_path} (workspace={workspace_id}, type={file_type}, protected={is_protected})"
    )


def unregister_file(file_path: str) -> None:
    """
    Remove a file from the registry.
    
    Args:
        file_path: Path to file (absolute or relative)
    """
    registry = _load_registry()
    abs_path = str(Path(file_path).resolve())
    
    if abs_path in registry:
        del registry[abs_path]
        _save_registry(registry)
        logger.info(f"Unregistered file: {file_path}")


def get_file_metadata(file_path: str) -> Optional[FileMetadata]:
    """
    Get metadata for a file.
    
    Args:
        file_path: Path to file (absolute or relative)
    
    Returns:
        FileMetadata if found, None otherwise
    """
    registry = _load_registry()
    abs_path = str(Path(file_path).resolve())
    
    if abs_path in registry:
        return FileMetadata.from_dict(registry[abs_path])
    return None


def get_workspace_files(workspace_id: str) -> List[FileMetadata]:
    """
    Get all files belonging to a workspace.
    
    Args:
        workspace_id: Workspace identifier
    
    Returns:
        List of FileMetadata for all files in workspace
    """
    registry = _load_registry()
    files = []
    
    for file_path, metadata_dict in registry.items():
        if metadata_dict.get("workspace_id") == workspace_id:
            files.append(FileMetadata.from_dict(metadata_dict))
    
    return files


def delete_workspace_files(workspace_id: str) -> List[str]:
    """
    Delete all files for a workspace from registry.
    
    This is called during workspace deletion (cascade delete).
    
    Args:
        workspace_id: Workspace identifier
    
    Returns:
        List of deleted file paths
    """
    registry = _load_registry()
    deleted_paths = []
    
    # Find all files for this workspace
    to_delete = []
    for file_path, metadata_dict in registry.items():
        if metadata_dict.get("workspace_id") == workspace_id:
            to_delete.append(file_path)
    
    # Remove from registry
    for file_path in to_delete:
        deleted_paths.append(file_path)
        del registry[file_path]
    
    if deleted_paths:
        _save_registry(registry)
        logger.info(f"Removed {len(deleted_paths)} files from registry for workspace {workspace_id}")
    
    return deleted_paths


def is_file_protected(file_path: str) -> bool:
    """
    Check if a file is protected from deletion.
    
    Args:
        file_path: Path to file
    
    Returns:
        True if file is protected, False otherwise
    """
    metadata = get_file_metadata(file_path)
    if metadata:
        return metadata.is_protected
    return False


def verify_file_ownership(file_path: str, workspace_id: str) -> bool:
    """
    Verify that a file belongs to the specified workspace.
    
    Args:
        file_path: Path to file
        workspace_id: Workspace identifier
    
    Returns:
        True if file belongs to workspace, False otherwise
    """
    metadata = get_file_metadata(file_path)
    if not metadata:
        return False
    return metadata.workspace_id == workspace_id


def cleanup_orphan_files() -> List[str]:
    """
    Clean up orphan files (files that don't belong to any existing workspace).
    
    This function:
    1. Scans the file registry
    2. Checks if each file's workspace still exists
    3. Removes orphan files from registry
    
    Returns:
        List of orphan file paths that were removed
    """
    registry = _load_registry()
    orphan_paths = []
    
    # Get all existing workspace directories
    existing_workspaces: Set[str] = set()
    if WORKSPACES_DIR.exists():
        for item in WORKSPACES_DIR.iterdir():
            if item.is_dir() and not item.name.startswith("."):
                existing_workspaces.add(item.name)
    
    # Check each file in registry
    to_remove = []
    for file_path, metadata_dict in registry.items():
        workspace_id = metadata_dict.get("workspace_id")
        if not workspace_id or workspace_id not in existing_workspaces:
            # Orphan file - workspace doesn't exist
            to_remove.append(file_path)
            orphan_paths.append(file_path)
    
    # Remove orphan files from registry
    for file_path in to_remove:
        del registry[file_path]
    
    if orphan_paths:
        _save_registry(registry)
        logger.info(f"Cleaned up {len(orphan_paths)} orphan files")
    
    return orphan_paths


def get_csv_files_in_workspace(workspace_id: str) -> List[str]:
    """
    Get all CSV files in a workspace.
    
    Args:
        workspace_id: Workspace identifier
    
    Returns:
        List of CSV file paths
    """
    files = get_workspace_files(workspace_id)
    csv_files = [f.file_path for f in files if f.file_type == "csv"]
    return csv_files
