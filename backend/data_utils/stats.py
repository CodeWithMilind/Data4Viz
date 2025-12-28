import pandas as pd
from typing import Dict, Any

class DataStats:
    """
    Responsible for statistical analysis of the dataset.
    """

    @staticmethod
    def basic_stats(df: pd.DataFrame) -> Dict[str, Any]:
        """
        Generates descriptive statistics for numeric columns.
        
        Args:
            df (pd.DataFrame): The dataset.
            
        Returns:
            dict: A dictionary containing stats like mean, std, min, max.
        """
        # WHY: describe() gives a quick statistical snapshot. 
        # We convert to dict for easy JSON serialization to frontend.
        # include='all' would be too messy, so we default to numeric only for now.
        stats = df.describe().to_dict()
        
        # Sanitize NaNs for JSON serialization
        sanitized = {}
        for col, metrics in stats.items():
            sanitized[col] = {k: (v if pd.notnull(v) else None) for k, v in metrics.items()}
            
        return sanitized

    @staticmethod
    def missing_report(df: pd.DataFrame) -> Dict[str, int]:
        """
        Counts missing values per column.
        
        Args:
            df (pd.DataFrame): The dataset.
            
        Returns:
            dict: Column names mapped to missing value counts.
        """
        # WHY: Identifying missing data is the first step in cleaning.
        return df.isnull().sum().to_dict()
