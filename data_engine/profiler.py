import pandas as pd
from history import HistoryLogger

class DataProfiler:
    """
    Analyzes the dataset and provides a summary.
    """

    def __init__(self, history: HistoryLogger):
        self.history = history
    
    def profile(self, df):
        """
        Prints basic statistics and structure of the DataFrame.
        
        Args:
            df (pd.DataFrame): The data to analyze.
        """
        if df is None:
            print("❌ No data to profile.")
            return

        print("\n--- Data Profile ---")
        
        try:
            # WHY: Knowing column names helps verify we have the right data fields.
            print(f"\n📌 Columns:\n{df.columns.tolist()}")
            
            # WHY: Data types tell us if numbers are stored as text (common issue).
            print(f"\n🔢 Data Types:\n{df.dtypes}")
            
            # WHY: Missing values can break models or analysis, so we must count them.
            print(f"\n❓ Missing Values:\n{df.isnull().sum()}")
            
            # WHY: Basic stats (mean, min, max) help spot outliers or weird data distributions.
            # We only look at numeric columns for meaningful stats.
            print(f"\n📈 Basic Statistics (Numeric):\n{df.describe()}")

            self.history.log(
                module="profiler",
                action="profile",
                status="success",
                details={
                    "columns": df.columns.tolist(),
                    "missing_values": df.isnull().sum().to_dict()
                }
            )

        except Exception as e:
            print(f"❌ Error during profiling: {e}")
            self.history.log(
                module="profiler",
                action="profile",
                status="failed",
                error=str(e)
            )
