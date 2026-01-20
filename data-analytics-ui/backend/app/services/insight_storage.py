"""
Insight Storage Service for Decision-Driven EDA.

Handles persistence, versioning, and deterministic insight management.
"""

import json
import os
import hashlib
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


def get_insight_storage_path(workspace_id: str, dataset_id: str, decision_metric: str) -> Path:
    """
    Get the storage path for insight JSON files.
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename
        decision_metric: Decision metric column name
        
    Returns:
        Path object for the insight storage directory
    """
    # Sanitize filenames
    safe_dataset_id = dataset_id.replace("/", "_").replace("\\", "_")
    safe_metric = decision_metric.replace("/", "_").replace("\\", "_")
    
    # Store in workspace-specific directory
    base_path = Path("workspaces") / workspace_id / "insights"
    base_path.mkdir(parents=True, exist_ok=True)
    
    return base_path


def compute_dataset_hash(workspace_id: str, dataset_id: str) -> str:
    """
    Compute a deterministic hash of the dataset content.
    Used to detect dataset changes.
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename
        
    Returns:
        SHA256 hash of dataset content
    """
    try:
        from app.services.dataset_loader import load_dataset
        import pandas as pd
        
        df = load_dataset(dataset_id, workspace_id)
        
        # Create deterministic hash from:
        # 1. Dataset shape (rows, columns)
        # 2. Column names (sorted)
        # 3. Column dtypes (sorted)
        # 4. First and last row hash (for content change detection)
        
        shape_str = f"{len(df)}_{len(df.columns)}"
        columns_str = "_".join(sorted(df.columns))
        dtypes_str = "_".join([f"{col}:{str(df[col].dtype)}" for col in sorted(df.columns)])
        
        # Hash first and last rows for content change detection
        first_row_hash = ""
        last_row_hash = ""
        if len(df) > 0:
            first_row = df.iloc[0].to_dict()
            first_row_hash = hashlib.sha256(
                json.dumps(first_row, sort_keys=True, default=str).encode()
            ).hexdigest()[:16]
            
            if len(df) > 1:
                last_row = df.iloc[-1].to_dict()
                last_row_hash = hashlib.sha256(
                    json.dumps(last_row, sort_keys=True, default=str).encode()
                ).hexdigest()[:16]
        
        content_str = f"{shape_str}|{columns_str}|{dtypes_str}|{first_row_hash}|{last_row_hash}"
        
        return hashlib.sha256(content_str.encode()).hexdigest()
    except Exception as e:
        logger.error(f"Error computing dataset hash: {e}")
        # Return a fallback hash based on dataset_id
        return hashlib.sha256(f"{workspace_id}_{dataset_id}".encode()).hexdigest()


def get_insight_file_path(
    workspace_id: str,
    dataset_id: str,
    decision_metric: str,
    version: Optional[str] = None
) -> Path:
    """
    Get the file path for storing/loading insights.
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename
        decision_metric: Decision metric column name
        version: Optional version identifier (defaults to "latest")
        
    Returns:
        Path to insight JSON file
    """
    storage_path = get_insight_storage_path(workspace_id, dataset_id, decision_metric)
    safe_dataset_id = dataset_id.replace("/", "_").replace("\\", "_")
    safe_metric = decision_metric.replace("/", "_").replace("\\", "_")
    
    if version:
        filename = f"{safe_dataset_id}_{safe_metric}_v{version}.json"
    else:
        filename = f"{safe_dataset_id}_{safe_metric}_latest.json"
    
    return storage_path / filename


def save_insight_snapshot(
    workspace_id: str,
    dataset_id: str,
    decision_metric: str,
    backend_stats: Dict[str, Any],
    insights: Dict[str, Any],
    version: Optional[str] = None
) -> str:
    """
    Save a complete insight snapshot to disk.
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename
        decision_metric: Decision metric column name
        backend_stats: Backend-computed statistics
        insights: Generated insights
        version: Optional version identifier (auto-generated if None)
        
    Returns:
        Version identifier of saved snapshot
    """
    try:
        # Compute dataset hash for change detection
        dataset_hash = compute_dataset_hash(workspace_id, dataset_id)
        
        # Generate version if not provided
        if not version:
            # Check for existing versions
            storage_path = get_insight_storage_path(workspace_id, dataset_id, decision_metric)
            existing_versions = []
            if storage_path.exists():
                for file in storage_path.glob(f"*_{decision_metric.replace('/', '_')}_v*.json"):
                    try:
                        version_match = file.stem.split("_v")[-1]
                        if version_match.isdigit():
                            existing_versions.append(int(version_match))
                    except:
                        pass
            
            if existing_versions:
                version = f"{max(existing_versions) + 1}"
            else:
                version = "1"
        
        # Create snapshot
        snapshot = {
            "version": version,
            "workspace_id": workspace_id,
            "dataset_id": dataset_id,
            "decision_metric": decision_metric,
            "dataset_hash": dataset_hash,
            "created_at": datetime.utcnow().isoformat(),
            "backend_stats": backend_stats,
            "insights": insights,
        }
        
        # Save to file
        file_path = get_insight_file_path(workspace_id, dataset_id, decision_metric, version)
        with open(file_path, "w") as f:
            json.dump(snapshot, f, indent=2, default=str)
        
        # Also save as "latest"
        latest_path = get_insight_file_path(workspace_id, dataset_id, decision_metric)
        with open(latest_path, "w") as f:
            json.dump(snapshot, f, indent=2, default=str)
        
        logger.info(
            f"Saved insight snapshot v{version} for {dataset_id}/{decision_metric} "
            f"in workspace {workspace_id}"
        )
        
        # Register insight files in registry
        from app.services.file_registry import register_file
        register_file(
            file_path=str(file_path),
            workspace_id=workspace_id,
            file_type="insight",
            is_protected=False,  # Insight files can be deleted
        )
        register_file(
            file_path=str(latest_path),
            workspace_id=workspace_id,
            file_type="insight",
            is_protected=False,
        )
        
        return version
    except Exception as e:
        logger.error(f"Error saving insight snapshot: {e}")
        raise


def load_insight_snapshot(
    workspace_id: str,
    dataset_id: str,
    decision_metric: str,
    version: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Load an insight snapshot from disk.
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename
        decision_metric: Decision metric column name
        version: Optional version identifier (defaults to "latest")
        
    Returns:
        Insight snapshot dictionary or None if not found
    """
    try:
        file_path = get_insight_file_path(workspace_id, dataset_id, decision_metric, version)
        
        if not file_path.exists():
            return None
        
        with open(file_path, "r") as f:
            snapshot = json.load(f)
        
        logger.info(
            f"Loaded insight snapshot v{snapshot.get('version', 'unknown')} "
            f"for {dataset_id}/{decision_metric}"
        )
        
        return snapshot
    except Exception as e:
        logger.error(f"Error loading insight snapshot: {e}")
        return None


def is_dataset_changed(
    workspace_id: str,
    dataset_id: str,
    stored_hash: str
) -> bool:
    """
    Check if dataset has changed since snapshot was created.
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename
        stored_hash: Hash stored in snapshot
        
    Returns:
        True if dataset has changed, False otherwise
    """
    try:
        current_hash = compute_dataset_hash(workspace_id, dataset_id)
        return current_hash != stored_hash
    except Exception as e:
        logger.error(f"Error checking dataset change: {e}")
        # If we can't compute hash, assume dataset changed (safer)
        return True


def get_all_versions(
    workspace_id: str,
    dataset_id: str,
    decision_metric: str
) -> List[str]:
    """
    Get all available versions for an insight.
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename
        decision_metric: Decision metric column name
        
    Returns:
        List of version identifiers (sorted)
    """
    try:
        storage_path = get_insight_storage_path(workspace_id, dataset_id, decision_metric)
        safe_dataset_id = dataset_id.replace("/", "_").replace("\\", "_")
        safe_metric = decision_metric.replace("/", "_").replace("\\", "_")
        
        versions = []
        if storage_path.exists():
            pattern = f"{safe_dataset_id}_{safe_metric}_v*.json"
            for file in storage_path.glob(pattern):
                try:
                    version_match = file.stem.split("_v")[-1]
                    if version_match.isdigit():
                        versions.append(version_match)
                except:
                    pass
        
        return sorted(versions, key=int)
    except Exception as e:
        logger.error(f"Error getting versions: {e}")
        return []


def delete_insight_snapshot(
    workspace_id: str,
    dataset_id: str,
    decision_metric: str,
    version: Optional[str] = None
) -> bool:
    """
    Delete an insight snapshot.
    If version is None, deletes the latest snapshot.
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename
        decision_metric: Decision metric column name
        version: Optional version identifier (defaults to "latest")
        
    Returns:
        True if deleted successfully, False otherwise
    """
    try:
        if version:
            file_path = get_insight_file_path(workspace_id, dataset_id, decision_metric, version)
        else:
            file_path = get_insight_file_path(workspace_id, dataset_id, decision_metric)
        
        if file_path.exists():
            file_path.unlink()
            logger.info(
                f"Deleted insight snapshot v{version or 'latest'} "
                f"for {dataset_id}/{decision_metric} in workspace {workspace_id}"
            )
            return True
        else:
            logger.warning(
                f"Insight snapshot v{version or 'latest'} not found "
                f"for {dataset_id}/{decision_metric}"
            )
            return False
    except Exception as e:
        logger.error(f"Error deleting insight snapshot: {e}")
        return False


def delete_all_insight_versions(
    workspace_id: str,
    dataset_id: str,
    decision_metric: str
) -> int:
    """
    Delete all versions of an insight snapshot.
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename
        decision_metric: Decision metric column name
        
    Returns:
        Number of files deleted
    """
    try:
        storage_path = get_insight_storage_path(workspace_id, dataset_id, decision_metric)
        safe_dataset_id = dataset_id.replace("/", "_").replace("\\", "_")
        safe_metric = decision_metric.replace("/", "_").replace("\\", "_")
        
        deleted_count = 0
        if storage_path.exists():
            # Delete all versioned files
            pattern = f"{safe_dataset_id}_{safe_metric}_v*.json"
            for file in storage_path.glob(pattern):
                try:
                    file.unlink()
                    deleted_count += 1
                except Exception as e:
                    logger.error(f"Error deleting file {file}: {e}")
            
            # Delete latest file
            latest_path = get_insight_file_path(workspace_id, dataset_id, decision_metric)
            if latest_path.exists():
                try:
                    latest_path.unlink()
                    deleted_count += 1
                except Exception as e:
                    logger.error(f"Error deleting latest file: {e}")
        
        logger.info(
            f"Deleted {deleted_count} insight snapshot(s) "
            f"for {dataset_id}/{decision_metric} in workspace {workspace_id}"
        )
        
        return deleted_count
    except Exception as e:
        logger.error(f"Error deleting all insight versions: {e}")
        return 0
