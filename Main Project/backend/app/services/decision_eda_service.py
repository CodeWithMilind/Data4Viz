"""
Decision-Driven EDA Service.

BACKEND RESPONSIBILITIES:
- Computes ONLY statistics (correlations, segment differences, missing values, outliers)
- Ranks factors by impact score
- Outputs compact summary
- NO explanations, NO recommendations, NO ML models
"""

import pandas as pd
from typing import Dict, List, Any, Optional
from app.services.dataset_loader import load_dataset


def infer_column_type(df: pd.DataFrame, col: str) -> str:
    """Infer column type: numeric, datetime, or categorical."""
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


def compute_decision_eda_stats(
    workspace_id: str,
    dataset_id: str,
    decision_metric: str
) -> Dict[str, Any]:
    """
    Compute decision-driven EDA statistics.
    
    Computes:
    - Correlation strength between decision_metric and other numeric columns
    - Segment-level mean differences for categorical columns
    - Missing value percentage of decision_metric
    - Basic outlier influence estimate
    
    Args:
        workspace_id: Workspace identifier
        dataset_id: Dataset filename
        decision_metric: Name of the numeric column to analyze
        
    Returns:
        Dictionary with computed statistics and ranked factors
    """
    # Load dataset
    df = load_dataset(dataset_id, workspace_id)
    
    # Validate decision_metric exists
    if decision_metric not in df.columns:
        raise ValueError(f"Column '{decision_metric}' not found in dataset")
    
    # STEP 1: Clean and prepare data for numeric coercion
    # Trim whitespace from string values and convert empty strings to NaN
    series = df[decision_metric].copy()
    if series.dtype == 'object':
        # Trim whitespace and convert empty strings to NaN
        series = series.astype(str).str.strip().replace(['', 'nan', 'None', 'null'], pd.NA)
    
    # STEP 2: Attempt numeric coercion AFTER cleaning
    coerced = pd.to_numeric(series, errors="coerce")
    
    # STEP 3: Validate - Check if all values are NaN OR if valid numeric values < 90%
    # Ignore null/empty rows in validation (they're already NaN after coercion)
    valid_count = coerced.notna().sum()
    total_count = len(coerced)
    valid_ratio = valid_count / total_count if total_count > 0 else 0.0
    
    if valid_count == 0 or valid_ratio < 0.9:
        raise ValueError(
            "The selected metric contains non-numeric values and cannot be analyzed. "
            "Please clean or convert this column to numeric values."
        )
    
    # Replace original column with coerced numeric series
    decision_series = coerced
    
    # Remove rows where decision_metric is missing for analysis
    valid_mask = decision_series.notna()
    df_valid = df[valid_mask].copy()
    decision_valid = decision_series[valid_mask]
    
    # Ensure we're working with numeric data (should always pass after coercion, but double-check)
    if len(decision_valid) > 0 and not pd.api.types.is_numeric_dtype(decision_valid):
        raise ValueError(
            "The selected metric contains non-numeric values and cannot be analyzed. "
            "Please clean or convert this column to numeric values."
        )
    
    total_rows = len(df)
    valid_rows = len(df_valid)
    missing_pct = round((total_rows - valid_rows) / total_rows * 100, 2) if total_rows > 0 else 0.0
    
    # Identify excluded columns (high uniqueness, text/URL patterns, IDs)
    excluded_columns: List[Dict[str, str]] = []
    excluded_patterns = ["id", "url", "description", "title", "summary", "name", "email", "address"]
    
    for col in df.columns:
        if col == decision_metric:
            continue
        
        col_type = infer_column_type(df, col)
        unique_count = df[col].nunique(dropna=True)
        unique_pct = (unique_count / total_rows * 100) if total_rows > 0 else 0
        
        # Check exclusion criteria
        col_lower = col.lower()
        is_excluded = False
        exclusion_reason = ""
        
        # High uniqueness (>80%)
        if unique_pct > 80:
            is_excluded = True
            exclusion_reason = "High uniqueness"
        # Free-text or URL pattern in column name
        elif any(pattern in col_lower for pattern in excluded_patterns):
            is_excluded = True
            if "url" in col_lower or "link" in col_lower:
                exclusion_reason = "URL column"
            elif "description" in col_lower or "text" in col_lower or "comment" in col_lower:
                exclusion_reason = "Free-text column"
            elif "id" in col_lower and unique_pct > 50:
                exclusion_reason = "Identifier column"
            else:
                exclusion_reason = "Text/identifier pattern"
        # Very long text values (likely free text)
        elif col_type == "categorical":
            sample_values = df[col].dropna().head(100)
            if len(sample_values) > 0:
                avg_length = sample_values.astype(str).str.len().mean()
                if avg_length > 50:  # Average length > 50 chars suggests free text
                    is_excluded = True
                    exclusion_reason = "Free-text column"
        
        if is_excluded:
            excluded_columns.append({
                "column": col,
                "reason": exclusion_reason
            })
    
    # Compute correlations with numeric columns
    correlations: List[Dict[str, Any]] = []
    numeric_cols = []
    
    for col in df.columns:
        if col == decision_metric:
            continue
        
        # Skip excluded columns
        if any(exc["column"] == col for exc in excluded_columns):
            continue
        
        col_type = infer_column_type(df, col)
        if col_type == "numeric":
            numeric_cols.append(col)
            col_series = pd.to_numeric(df_valid[col], errors='coerce')
            valid_col_mask = col_series.notna()
            
            if valid_col_mask.sum() < 10:  # Need at least 10 valid pairs
                continue
            
            corr_value = decision_valid[valid_col_mask].corr(col_series[valid_col_mask])
            
            if pd.notna(corr_value):
                correlations.append({
                    "factor": col,
                    "correlation": round(float(corr_value), 4),
                    "abs_correlation": round(abs(float(corr_value)), 4),
                    "type": "numeric"
                })
    
    # Compute segment-level mean differences for categorical columns
    segment_impacts: List[Dict[str, Any]] = []
    
    for col in df.columns:
        if col == decision_metric:
            continue
        
        # Skip excluded columns
        if any(exc["column"] == col for exc in excluded_columns):
            continue
        
        col_type = infer_column_type(df, col)
        if col_type == "categorical":
            try:
                # Ensure aggregation runs ONLY on numeric columns
                # Use the already-converted numeric decision_valid series
                grouped = df_valid.groupby(col)
                segment_means_dict = {}
                for group_name, group_indices in grouped.groups.items():
                    # Get corresponding values from the numeric decision_valid series
                    group_mask = df_valid.index.isin(group_indices)
                    group_values = decision_valid[group_mask]
                    
                    # Validate numeric before aggregation
                    if len(group_values) > 0 and pd.api.types.is_numeric_dtype(group_values):
                        segment_mean = group_values.mean()
                        if pd.notna(segment_mean):
                            segment_means_dict[group_name] = segment_mean
                
                if len(segment_means_dict) < 2:
                    continue
                
                segment_means = pd.Series(segment_means_dict)
                
                # Compute difference between highest and lowest segment
                max_mean = segment_means.max()
                min_mean = segment_means.min()
                mean_diff = max_mean - min_mean
                
                # Compute overall mean for reference
                overall_mean = decision_valid.mean()
                
                # Impact score: relative difference
                if overall_mean != 0:
                    relative_impact = abs(mean_diff / overall_mean) * 100
                else:
                    relative_impact = abs(mean_diff)
                
                # Get top segments
                top_segments = segment_means.nlargest(3).to_dict()
                bottom_segments = segment_means.nsmallest(3).to_dict()
                
                segment_impacts.append({
                    "factor": col,
                    "mean_difference": round(float(mean_diff), 4),
                    "relative_impact_pct": round(float(relative_impact), 2),
                    "top_segments": {str(k): round(float(v), 4) for k, v in top_segments.items()},
                    "bottom_segments": {str(k): round(float(v), 4) for k, v in bottom_segments.items()},
                    "type": "categorical"
                })
            except (ValueError, TypeError, AttributeError) as e:
                # Catch Pandas/NumPy errors and convert to clean error message
                error_msg = str(e).lower()
                if "agg function failed" in error_msg or "mean" in error_msg or "dtype" in error_msg:
                    raise ValueError(
                        "The selected metric contains non-numeric values and cannot be analyzed. "
                        "Please clean or convert this column to numeric values."
                    )
                # Re-raise other errors as-is
                raise
    
    # Compute basic outlier influence estimate
    # Using IQR method
    try:
        Q1 = decision_valid.quantile(0.25)
        Q3 = decision_valid.quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - 1.5 * IQR
        upper_bound = Q3 + 1.5 * IQR
        
        outliers_mask = (decision_valid < lower_bound) | (decision_valid > upper_bound)
        outlier_count = outliers_mask.sum()
        outlier_pct = round(outlier_count / valid_rows * 100, 2) if valid_rows > 0 else 0.0
    except (ValueError, TypeError, AttributeError) as e:
        # Catch Pandas/NumPy errors and convert to clean error message
        error_msg = str(e).lower()
        if "agg function failed" in error_msg or "quantile" in error_msg or "dtype" in error_msg:
            raise ValueError(
                "The selected metric contains non-numeric values and cannot be analyzed. "
                "Please clean or convert this column to numeric values."
            )
        # Re-raise other errors as-is
        raise
    
    # Compute impact scores and rank factors
    factors: List[Dict[str, Any]] = []
    
    # Add correlation factors
    for corr in correlations:
        # Impact score: absolute correlation * 100
        impact_score = corr["abs_correlation"] * 100
        factors.append({
            "factor": corr["factor"],
            "impact_score": round(impact_score, 2),
            "type": "numeric",
            "correlation": corr["correlation"],
            "abs_correlation": corr["abs_correlation"]
        })
    
    # Add segment impact factors
    for seg in segment_impacts:
        factors.append({
            "factor": seg["factor"],
            "impact_score": round(seg["relative_impact_pct"], 2),
            "type": "categorical",
            "mean_difference": seg["mean_difference"],
            "top_segments": seg["top_segments"],
            "bottom_segments": seg["bottom_segments"]
        })
    
    # Sort by impact score (descending) with deterministic tie-breaker
    # Use factor name as tie-breaker for stable, deterministic sorting
    factors.sort(key=lambda x: (-x["impact_score"], x["factor"]))
    
    # Deduplicate factors: keep only the strongest signal per factor
    seen_factors = {}
    deduplicated_factors = []
    
    for factor in factors:
        factor_name = factor["factor"]
        if factor_name not in seen_factors:
            # First occurrence of this factor - keep it
            seen_factors[factor_name] = factor
            deduplicated_factors.append(factor)
        else:
            # Factor already seen - keep the one with higher impact score
            existing = seen_factors[factor_name]
            if factor["impact_score"] > existing["impact_score"]:
                # Replace with stronger signal
                deduplicated_factors.remove(existing)
                deduplicated_factors.append(factor)
                seen_factors[factor_name] = factor
    
    # Re-sort after deduplication (in case replacement changed order)
    # Use deterministic tie-breaker for stable sorting
    deduplicated_factors.sort(key=lambda x: (-x["impact_score"], x["factor"]))
    
    # Get top 5 (after deduplication)
    top_factors = deduplicated_factors[:5]
    
    # Build summary
    summary = {
        "decision_metric": decision_metric,
        "total_rows": total_rows,
        "valid_rows": valid_rows,
        "missing_percentage": missing_pct,
        "outlier_count": int(outlier_count),
        "outlier_percentage": outlier_pct,
        "top_factors": top_factors,
        "all_correlations": sorted(correlations[:10], key=lambda x: (-abs(x.get("correlation", 0)), x.get("factor", ""))),  # Top 10 correlations, deterministically sorted
        "all_segment_impacts": sorted(segment_impacts[:10], key=lambda x: (-x.get("relative_impact_pct", 0), x.get("factor", ""))),  # Top 10 segment impacts, deterministically sorted
        "excluded_columns": excluded_columns,  # Columns excluded from analysis
        "decision_metric_stats": {}
    }
    
    # Compute decision metric stats with error handling
    try:
        summary["decision_metric_stats"] = {
            "mean": round(float(decision_valid.mean()), 4),
            "median": round(float(decision_valid.median()), 4),
            "std": round(float(decision_valid.std()), 4),
            "min": round(float(decision_valid.min()), 4),
            "max": round(float(decision_valid.max()), 4)
        }
    except (ValueError, TypeError, AttributeError) as e:
        # Catch Pandas/NumPy errors and convert to clean error message
        error_msg = str(e).lower()
        if "agg function failed" in error_msg or "mean" in error_msg or "dtype" in error_msg:
            raise ValueError(
                "The selected metric contains non-numeric values and cannot be analyzed. "
                "Please clean or convert this column to numeric values."
            )
        # Re-raise other errors as-is
        raise
    
    return summary
