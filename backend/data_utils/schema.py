import pandas as pd
from typing import Dict, Any

class DataSchema:
    """
    Responsible for extracting structure and metadata from the dataset.
    """

    @staticmethod
    def get_schema(df: pd.DataFrame) -> Dict[str, Any]:
        """
        Extracts column names and data types.
        
        Args:
            df (pd.DataFrame): The dataset.
            
        Returns:
            dict: A dictionary mapping column names to their string data type.
        """
        # WHY: Frontend needs string representations of dtypes to display to the user.
        # We convert dtypes to string (e.g., 'int64', 'object', 'float64').
        return {col: str(dtype) for col, dtype in df.dtypes.items()}

    @staticmethod
    def get_shape(df: pd.DataFrame) -> Dict[str, int]:
        """
        Returns the dimensions of the dataset.
        """
        # WHY: Immediate understanding of data scale (small vs big data).
        return {
            "rows": df.shape[0],
            "columns": df.shape[1]
        }
