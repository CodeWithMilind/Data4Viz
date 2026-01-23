"""Dataset loading and saving utilities.

IMPORTANT: Workspace is the single source of truth.
All datasets belong to a workspace and are stored in workspace-specific directories.
Data Cleaning is an operational view on top of workspace datasets - not a data source.
"""

import pandas as pd
from pathlib import Path
from typing import Optional
from datetime import datetime
import logging
from app.config import DATA_DIR, get_workspace_datasets_dir, get_workspace_files_dir, get_workspace_logs_dir
from app.services.file_registry import register_file, unregister_file, get_file_metadata, verify_file_ownership, is_file_protected

logger = logging.getLogger(__name__)


def load_dataset(dataset_id: str, workspace_id: Optional[str] = None) -> pd.DataFrame:
    """
    Load a dataset from workspace storage.
    
    Workspace-aware: If workspace_id is provided, loads from workspace directory.
    Legacy support: If workspace_id is None, loads from global data directory (backward compatibility).

    Args:
        dataset_id: Filename of the dataset (e.g., "sample.csv")
        workspace_id: Workspace identifier (required for workspace-aware operations)

    Returns:
        Loaded DataFrame

    Raises:
        FileNotFoundError: If dataset file doesn't exist
        ValueError: If file cannot be parsed as CSV
    """
    if workspace_id:
        # Workspace-aware: load from workspace storage
        dataset_path = get_workspace_datasets_dir(workspace_id) / dataset_id
    else:
        # Legacy: load from global data directory
        dataset_path = DATA_DIR / dataset_id

    if not dataset_path.exists():
        location = f"workspace '{workspace_id}'" if workspace_id else "data directory"
        error_msg = f"Dataset '{dataset_id}' not found in {location}"
        logger.error(f"[load_dataset] {error_msg}, path: {dataset_path}")
        raise FileNotFoundError(error_msg)

    # Check file size
    try:
        file_size = dataset_path.stat().st_size
        logger.info(f"[load_dataset] File size: {file_size} bytes")
        
        if file_size == 0:
            error_msg = f"Dataset '{dataset_id}' is empty (0 bytes)"
            logger.error(f"[load_dataset] {error_msg}")
            raise ValueError(error_msg)
    except Exception as e:
        logger.warning(f"[load_dataset] Could not get file size: {e}")

    try:
        # Try auto-detecting delimiter first (pandas can detect comma, semicolon, tab, etc.)
        logger.info(f"[load_dataset] Attempting to read CSV with auto-detection...")
        df = pd.read_csv(dataset_path, sep=None, engine="python", on_bad_lines="skip")
        logger.info(f"[load_dataset] CSV read successful - rows: {len(df)}, columns: {len(df.columns)}")
        
        # Validate DataFrame
        if len(df) == 0:
            logger.warning(f"[load_dataset] Dataset '{dataset_id}' has 0 rows after loading")
        if len(df.columns) == 0:
            error_msg = f"Dataset '{dataset_id}' has 0 columns - file may be corrupted"
            logger.error(f"[load_dataset] {error_msg}")
            raise ValueError(error_msg)
        
        # Fallback: If only one column detected, try semicolon delimiter
        if len(df.columns) == 1:
            logger.info(f"[load_dataset] Only 1 column detected, trying semicolon delimiter...")
            try:
                df_semicolon = pd.read_csv(dataset_path, sep=";", engine="python", on_bad_lines="skip")
                if len(df_semicolon.columns) > 1:
                    logger.info(f"[load_dataset] Semicolon delimiter worked - rows: {len(df_semicolon)}, columns: {len(df_semicolon.columns)}")
                    df = df_semicolon
            except Exception as e:
                logger.warning(f"[load_dataset] Semicolon delimiter failed: {e}")
                # If semicolon parsing also fails, keep original
                pass
        
        logger.info(f"[load_dataset] Successfully loaded dataset '{dataset_id}' - final shape: {df.shape}")
        return df
        
    except pd.errors.EmptyDataError as e:
        error_msg = f"Dataset '{dataset_id}' is empty or has no valid data"
        logger.error(f"[load_dataset] {error_msg}: {e}")
        raise ValueError(error_msg) from e
    except pd.errors.ParserError as e:
        error_msg = f"Failed to parse dataset '{dataset_id}' as CSV: {str(e)}"
        logger.error(f"[load_dataset] {error_msg}")
        raise ValueError(error_msg) from e
    except UnicodeDecodeError as e:
        error_msg = f"Failed to decode dataset '{dataset_id}': encoding issue - {str(e)}"
        logger.error(f"[load_dataset] {error_msg}")
        raise ValueError(error_msg) from e
    except Exception as e:
        error_msg = f"Failed to load dataset '{dataset_id}': {str(e)}"
        logger.error(f"[load_dataset] {error_msg}", exc_info=True)
        logger.error(f"[load_dataset] Exception type: {type(e).__name__}")
        raise ValueError(error_msg) from e


def save_dataset(
    df: pd.DataFrame, 
    dataset_id: str, 
    workspace_id: Optional[str] = None,
    create_new_file: bool = False
) -> str:
    """
    Save a DataFrame to workspace storage.
    
    IMPORTANT: When create_new_file=True (e.g., after cleaning), creates a new file
    with timestamp to preserve original. This ensures cleaned datasets are saved
    as new versions, not overwriting originals.
    
    Workspace-aware: If workspace_id is provided, saves to workspace directory.
    Legacy support: If workspace_id is None, saves to global data directory.

    Args:
        df: DataFrame to save
        dataset_id: Original filename (e.g., "sample.csv")
        workspace_id: Workspace identifier (required for workspace-aware operations)
        create_new_file: If True, creates a new file with timestamp instead of overwriting

    Returns:
        Final filename (may be modified if create_new_file=True)

    Raises:
        ValueError: If save operation fails
    """
    if workspace_id:
        # Workspace-aware: save to workspace storage
        datasets_dir = get_workspace_datasets_dir(workspace_id)
    else:
        # Legacy: save to global data directory
        datasets_dir = DATA_DIR

    # If creating new file (e.g., after cleaning), add timestamp to filename
    if create_new_file:
        # Extract base name and extension
        base_name = Path(dataset_id).stem
        extension = Path(dataset_id).suffix
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        final_filename = f"{base_name}_cleaned_{timestamp}{extension}"
    else:
        final_filename = dataset_id

    dataset_path = datasets_dir / final_filename

    try:
        df.to_csv(dataset_path, index=False)
        return final_filename
    except Exception as e:
        raise ValueError(f"Failed to save dataset '{final_filename}': {str(e)}")


def dataset_exists(dataset_id: str, workspace_id: Optional[str] = None) -> bool:
    """
    Check if a dataset exists in workspace storage.

    Args:
        dataset_id: Filename of the dataset
        workspace_id: Workspace identifier (required for workspace-aware operations)

    Returns:
        True if dataset exists, False otherwise
    """
    if workspace_id:
        dataset_path = get_workspace_datasets_dir(workspace_id) / dataset_id
    else:
        dataset_path = DATA_DIR / dataset_id
    return dataset_path.exists()


def get_dataset_info(dataset_id: str, workspace_id: Optional[str] = None) -> dict:
    """
    Get basic information about a dataset.

    Args:
        dataset_id: Filename of the dataset
        workspace_id: Workspace identifier (required for workspace-aware operations)

    Returns:
        Dictionary with rows, columns, and column names
    """
    df = load_dataset(dataset_id, workspace_id)
    return {
        "rows": len(df),
        "columns": len(df.columns),
        "column_names": list(df.columns),
        "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()},
    }


def list_workspace_datasets(workspace_id: str) -> list[dict]:
    """
    List all datasets in a workspace.
    
    Returns metadata for all CSV files in the workspace datasets directory.
    This includes both original and cleaned datasets.

    Args:
        workspace_id: Workspace identifier

    Returns:
        List of dataset metadata dictionaries with id, rows, columns
    """
    datasets_dir = get_workspace_datasets_dir(workspace_id)
    datasets = []

    if not datasets_dir.exists():
        return datasets

    for csv_file in datasets_dir.glob("*.csv"):
        if csv_file.is_file():
            try:
                # Try auto-detecting delimiter first
                df = pd.read_csv(csv_file, sep=None, engine="python", on_bad_lines="skip")
                
                # Fallback: If only one column detected, try semicolon delimiter
                if len(df.columns) == 1:
                    try:
                        df_semicolon = pd.read_csv(csv_file, sep=";", engine="python", on_bad_lines="skip")
                        if len(df_semicolon.columns) > 1:
                            df = df_semicolon
                    except Exception:
                        # If semicolon parsing also fails, keep original
                        pass
                
                datasets.append({
                    "id": csv_file.name,
                    "rows": len(df),
                    "columns": len(df.columns),
                })
            except Exception:
                # Skip files that can't be read
                continue

    return sorted(datasets, key=lambda x: x["id"])


def list_workspace_files(workspace_id: str) -> list[dict]:
    """
    List ALL files in a workspace.
    
    Includes:
    - Original datasets (CSV) from datasets/ directory
    - Overview snapshots (JSON) from files/ directory
    - Logs (LOG) from files/ directory
    - Other derived artifacts (JSON) from files/ directory

    Args:
        workspace_id: Workspace identifier

    Returns:
        List of file metadata dictionaries with type information
    """
    files = []
    
    # List datasets (CSV files)
    datasets_dir = get_workspace_datasets_dir(workspace_id)
    if datasets_dir.exists():
        for file_path in datasets_dir.iterdir():
            if file_path.is_file() and file_path.suffix.lower() == ".csv":
                try:
                    # HIDE NON-EXISTENT FILES: Only include files that exist on disk
                    if not file_path.exists():
                        continue
                    
                    stat = file_path.stat()
                    # Get file metadata from registry
                    metadata = get_file_metadata(str(file_path))
                    is_protected = metadata.is_protected if metadata else True  # Default CSV to protected
                    
                    # Get relative path from workspace root (datasets/{filename})
                    workspace_root = datasets_dir.parent
                    relative_path = file_path.relative_to(workspace_root).as_posix()
                    
                    files.append({
                        "id": file_path.name,
                        "name": file_path.name,
                        "relativePath": relative_path,  # Exact relative path from workspace root (e.g., "datasets/file.csv")
                        "size": stat.st_size,
                        "type": "CSV",
                        "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                        "updated_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        "is_protected": is_protected,
                    })
                except Exception:
                    continue
    
    # List files (JSON, LOG, etc.)
    files_dir = get_workspace_files_dir(workspace_id)
    if files_dir.exists():
        for file_path in files_dir.iterdir():
            if file_path.is_file():
                try:
                    # HIDE NON-EXISTENT FILES: Only include files that exist on disk
                    if not file_path.exists():
                        continue
                    
                    stat = file_path.stat()
                    suffix = file_path.suffix.lower()
                    
                    # Determine file type
                    if suffix == ".json":
                        if "_overview.json" in file_path.name:
                            file_type = "OVERVIEW"
                        elif "_cleaning.json" in file_path.name:
                            file_type = "CLEANING"
                        else:
                            file_type = "JSON"
                    elif suffix == ".log":
                        file_type = "LOG"
                    elif suffix == ".ipynb":
                        file_type = "NOTEBOOK"
                    else:
                        file_type = suffix[1:].upper() if suffix else "UNKNOWN"
                    
                    # Get relative path from workspace root (files/{filename})
                    workspace_root = files_dir.parent
                    relative_path = file_path.relative_to(workspace_root).as_posix()
                    
                    files.append({
                        "id": f"files/{file_path.name}",
                        "name": f"files/{file_path.name}",
                        "relativePath": relative_path,  # Exact relative path from workspace root (e.g., "files/overview.json")
                        "size": stat.st_size,
                        "type": file_type,
                        "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                        "updated_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    })
                except Exception:
                    continue
    
    # List logs (if separate)
    logs_dir = get_workspace_logs_dir(workspace_id)
    if logs_dir.exists():
        for file_path in logs_dir.iterdir():
            if file_path.is_file():
                try:
                    # HIDE NON-EXISTENT FILES: Only include files that exist on disk
                    if not file_path.exists():
                        continue
                    
                    stat = file_path.stat()
                    # Get relative path from workspace root (logs/{filename})
                    workspace_root = logs_dir.parent
                    relative_path = file_path.relative_to(workspace_root).as_posix()
                    
                    files.append({
                        "id": file_path.name,
                        "name": file_path.name,
                        "relativePath": relative_path,  # Exact relative path from workspace root (e.g., "logs/file.log")
                        "size": stat.st_size,
                        "type": "LOG",
                        "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                        "updated_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    })
                except Exception:
                    continue

    return sorted(files, key=lambda x: x["updated_at"], reverse=True)
