import pandas as pd
import os
from history import HistoryLogger

class DataLoader:
    """
    Responsible for loading data from various sources.
    Currently supports CSV files.
    """

    def __init__(self, history: HistoryLogger):
        self.history = history
    
    def load_csv(self, path):
        """
        Loads a CSV file into a pandas DataFrame.
        
        Args:
            path (str): The file path to the CSV.
            
        Returns:
            pd.DataFrame: The loaded data, or None if loading failed.
        """
        # WHY: We use try-except to prevent the app from crashing if the file is missing or bad.
        try:
            # WHY: Check if file exists before trying to load to give a clear error.
            if not os.path.exists(path):
                raise FileNotFoundError(f"The file at {path} was not found.")
            
            # WHY: pandas read_csv is the standard, efficient way to load CSV data.
            df = pd.read_csv(path)
            
            print(f"✅ File loaded successfully from: {path}")
            # WHY: Printing shape gives immediate feedback on data size (rows, columns).
            print(f"📊 Dataset Shape: {df.shape[0]} rows, {df.shape[1]} columns")

            self.history.log(
                module="loader",
                action="load_csv",
                status="success",
                details={"path": path, "rows": df.shape[0], "columns": df.shape[1]}
            )
            
            return df
            
        except Exception as e:
            print(f"❌ Error loading file: {e}")
            self.history.log(
                module="loader",
                action="load_csv",
                status="failed",
                error=str(e),
                details={"path": path}
            )
            return None
