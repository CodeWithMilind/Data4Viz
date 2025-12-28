import os
import sys

# Add current directory to path so we can import our modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from history import HistoryLogger
from loader import DataLoader
from profiler import DataProfiler
from validator import DataValidator
from cleaner import DataCleaner
from transformer import DataTransformer
from exporter import DataExporter

class DataEngine:
    """
    The main engine that orchestrates the data pipeline: 
    Load -> Profile -> Clean -> Transform -> Validate -> Export.
    """
    def __init__(self):
        # Initialize the shared logger
        self.history = HistoryLogger()
        
        # Initialize components with the logger
        self.loader = DataLoader(self.history)
        self.profiler = DataProfiler(self.history)
        self.validator = DataValidator(self.history)
        self.cleaner = DataCleaner(self.history)
        self.transformer = DataTransformer(self.history)
        self.exporter = DataExporter(self.history)

    def run(self, file_path):
        """
        Runs the full data processing pipeline.
        
        Args:
            file_path (str): Path to the input CSV file.
        """
        print("\n=== STARTING DATA ENGINE ===")

        # --- Step 1: Loading Data ---
        print("\n=== LOADING DATA ===")
        df = self.loader.load_csv(file_path)
        
        if df is None:
            print("❌ Critical Error: Could not load data. Aborting.")
            return

        # --- Step 2: Profiling Data (Initial) ---
        print("\n=== PROFILING DATA (INITIAL) ===")
        try:
            self.profiler.profile(df)
        except Exception as e:
            print(f"❌ Error during profiling: {e}")

        # --- Step 3: Cleaning Data ---
        print("\n=== CLEANING DATA ===")
        try:
            print("... Dropping missing values")
            df = self.cleaner.drop_missing(df)
            print("... Dropping duplicates")
            df = self.cleaner.drop_duplicates(df)
        except Exception as e:
            print(f"❌ Error during cleaning: {e}")

        # --- Step 4: Transforming Data ---
        print("\n=== TRANSFORMING DATA ===")
        try:
            print("... Standardizing column names")
            df = self.transformer.standardize_column_names(df)
        except Exception as e:
            print(f"❌ Error during transformation: {e}")

        # --- Step 5: Validating Data ---
        print("\n=== VALIDATING DATA ===")
        try:
            is_valid = self.validator.validate(df)
            if is_valid:
                print("✨ Data is clean and valid!")
            else:
                print("⚠️ Data has validation issues, but we will proceed with export.")
        except Exception as e:
             print(f"❌ Error during validation: {e}")

        # --- Step 6: Exporting Data ---
        print("\n=== EXPORTING DATA ===")
        try:
            # Create output path: input_processed.csv
            base, ext = os.path.splitext(file_path)
            output_path = f"{base}_processed{ext}"
            
            print(f"... Exporting to {output_path}")
            self.exporter.export(df, output_path)
            print("✅ Export successful!")
        except Exception as e:
            print(f"❌ Error during export: {e}")

        print("\n=== DONE ===")

if __name__ == "__main__":
    # Define the path to our sample data
    # We use os.path.join to be cross-platform compatible
    data_path = os.path.join(os.path.dirname(__file__), 'data', 'sample_data.csv')
    
    engine = DataEngine()
    engine.run(data_path)
