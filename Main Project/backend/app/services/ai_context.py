"""
AI Context service for Data4Viz.

Generates AI-friendly context files (schema, logs, dataset summary) without raw data.
These files provide metadata and statistics only - no actual data values.
"""

from typing import Dict, Any, Optional
import logging

from app.services.schema_service import compute_schema
from app.services.operation_logs import get_operation_logs
from app.services.dataset_loader import dataset_exists, load_dataset
import pandas as pd

logger = logging.getLogger(__name__)


def generate_schema_context(workspace_id: str, dataset_id: str) -> Optional[Dict[str, Any]]:
    """
    Generate schema context for AI (no raw data).
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename
        
    Returns:
        Schema context dictionary or None if dataset not found
    """
    try:
        schema = compute_schema(workspace_id, dataset_id, use_current=True)
        if not schema:
            return None
        
        # Return schema without raw data - only metadata
        return {
            "workspace_id": schema["workspace_id"],
            "dataset_id": schema["dataset_id"],
            "total_rows": schema["total_rows"],
            "total_columns": schema["total_columns"],
            "columns": [
                {
                    "name": col["name"],
                    "canonical_type": col["canonical_type"],
                    "pandas_dtype": col["pandas_dtype"],
                    "missing_count": col["missing_count"],
                    "missing_percentage": col["missing_percentage"],
                    "unique_count": col["unique_count"],
                    "numeric_stats": col.get("numeric_stats"),  # Only stats, no raw values
                }
                for col in schema["columns"]
            ],
            "computed_at": schema["computed_at"],
            "using_current": schema["using_current"],
        }
    except Exception as e:
        logger.error(f"Error generating schema context: {e}")
        return None


def generate_logs_context(workspace_id: str, dataset_id: str) -> Dict[str, Any]:
    """
    Generate operation logs context for AI.
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename
        
    Returns:
        Logs context dictionary (empty list if no logs)
    """
    try:
        logs = get_operation_logs(workspace_id, dataset_id)
        return {
            "workspace_id": workspace_id,
            "dataset_id": dataset_id,
            "total_operations": len(logs),
            "operations": logs,  # Already contains only metadata, no raw data
        }
    except Exception as e:
        logger.error(f"Error generating logs context: {e}")
        return {
            "workspace_id": workspace_id,
            "dataset_id": dataset_id,
            "total_operations": 0,
            "operations": [],
        }


def generate_dataset_summary_context(workspace_id: str, dataset_id: str) -> Optional[Dict[str, Any]]:
    """
    Generate dataset summary context for AI (no raw data).
    
    Includes:
    - Basic statistics (rows, columns)
    - Column quality metrics
    - Data quality scores
    - No actual data values
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename
        
    Returns:
        Dataset summary context dictionary or None if dataset not found
    """
    try:
        if not dataset_exists(dataset_id, workspace_id):
            return None
        
        # Load dataset for analysis
        df = load_dataset(dataset_id, workspace_id)
        
        total_rows = len(df)
        total_columns = len(df.columns)
        
        # Get schema for type information
        schema = compute_schema(workspace_id, dataset_id, use_current=True)
        
        # Calculate column summaries (no raw data)
        column_summaries = []
        total_health_score = 0.0
        
        for col in df.columns:
            col_data = df[col]
            
            # Get canonical type from schema if available
            canonical_type = "unknown"
            if schema:
                schema_col = next((c for c in schema["columns"] if c["name"] == col), None)
                if schema_col:
                    canonical_type = schema_col["canonical_type"]
            
            # Calculate metrics (no raw values)
            missing_count = int(col_data.isna().sum())
            missing_pct = round((missing_count / total_rows * 100) if total_rows > 0 else 0.0, 2)
            
            duplicate_count = int(col_data.duplicated().sum())
            duplicates_pct = round((duplicate_count / total_rows * 100) if total_rows > 0 else 0.0, 2)
            
            # Outliers for numeric columns only
            outliers = None
            if canonical_type == "numeric" and not col_data.isna().all():
                Q1 = col_data.quantile(0.25)
                Q3 = col_data.quantile(0.75)
                IQR = Q3 - Q1
                if IQR > 0:
                    lower_bound = Q1 - 1.5 * IQR
                    upper_bound = Q3 + 1.5 * IQR
                    outliers = int(((col_data < lower_bound) | (col_data > upper_bound)).sum())
                else:
                    outliers = 0
            
            # Calculate health score
            health_score = 100.0
            health_score -= min(missing_pct * 2, 40)
            health_score -= min(duplicates_pct * 1, 20)
            if outliers is not None:
                outlier_pct = (outliers / total_rows * 100) if total_rows > 0 else 0
                health_score -= min(outlier_pct * 0.5, 20)
            health_score = max(health_score, 0)
            
            column_summaries.append({
                "name": col,
                "canonical_type": canonical_type,
                "missing_count": missing_count,
                "missing_percentage": missing_pct,
                "duplicate_count": duplicate_count,
                "duplicate_percentage": duplicates_pct,
                "outlier_count": outliers,
                "health_score": round(health_score, 1),
            })
            
            total_health_score += health_score
        
        # Calculate overall score
        overall_score = round((total_health_score / len(column_summaries)) if column_summaries else 0, 1)
        
        # Count duplicates at row level
        duplicate_row_count = int(df.duplicated().sum())
        
        return {
            "workspace_id": workspace_id,
            "dataset_id": dataset_id,
            "total_rows": total_rows,
            "total_columns": total_columns,
            "duplicate_row_count": duplicate_row_count,
            "overall_health_score": overall_score,
            "columns": column_summaries,
        }
    except Exception as e:
        logger.error(f"Error generating dataset summary context: {e}")
        return None


def generate_ai_context_bundle(workspace_id: str, dataset_id: str) -> Optional[Dict[str, Any]]:
    """
    Generate complete AI context bundle (schema, logs, dataset summary).
    
    IMPORTANT: No raw data is included - only metadata and statistics.
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename
        
    Returns:
        Dictionary containing schema, logs, and dataset_summary, or None if dataset not found
    """
    try:
        if not dataset_exists(dataset_id, workspace_id):
            return None
        
        schema_context = generate_schema_context(workspace_id, dataset_id)
        logs_context = generate_logs_context(workspace_id, dataset_id)
        summary_context = generate_dataset_summary_context(workspace_id, dataset_id)
        
        if not schema_context or not summary_context:
            return None
        
        return {
            "workspace_id": workspace_id,
            "dataset_id": dataset_id,
            "generated_at": pd.Timestamp.now().isoformat(),
            "schema": schema_context,
            "logs": logs_context,
            "dataset_summary": summary_context,
        }
    except Exception as e:
        logger.error(f"Error generating AI context bundle: {e}")
        return None
