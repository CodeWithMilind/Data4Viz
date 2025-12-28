import pandas as pd
import json
from typing import Dict, Any
from .schema import DataSchema
from .stats import DataStats

class DataSummary:
    """
    Aggregates all data intelligence into a single summary report.
    """

    @staticmethod
    def sample_rows(df: pd.DataFrame, n: int = 5) -> Dict[str, Any]:
        """
        Returns the first N rows as a dictionary (records format).
        """
        # WHY: Users need to see actual data examples to trust the load.
        # fillna(None) replaces NaNs with None, which JSON serializes to null (valid JSON).
        # NaN is not valid standard JSON.
        return df.head(n).where(pd.notnull(df), None).to_dict(orient='records')

    @staticmethod
    def summarize_data(df: pd.DataFrame) -> Dict[str, Any]:
        """
        Generates a comprehensive summary of the dataset.
        
        Args:
            df (pd.DataFrame): The dataset.
            
        Returns:
            dict: A nested dictionary with schema, stats, missing info, and preview.
        """
        if df is None:
            return {}

        # WHY: Aggregate all info into one object to minimize API calls from frontend.
        return {
            "shape": DataSchema.get_shape(df),
            "schema": DataSchema.get_schema(df),
            "preview": DataSummary.sample_rows(df),
            "missing_values": DataStats.missing_report(df),
            "statistics": DataStats.basic_stats(df)
        }
