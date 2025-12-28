import pandas as pd
import os
import csv
from typing import Optional

class DataLoader:
    """
    Responsible for loading data from various sources into pandas DataFrames.
    """

    @staticmethod
    def load_csv(path: str) -> Optional[pd.DataFrame]:
        """
        Loads a CSV file into a pandas DataFrame with robust error handling,
        delimiter detection, and encoding fallbacks.
        
        Args:
            path (str): The absolute file path to the CSV.
            
        Returns:
            pd.DataFrame: The loaded data, or None if loading failed.
        """
        if not os.path.exists(path):
            print(f"File not found: {path}")
            return None

        # 1. Try with csv.Sniffer to detect delimiter
        sep = ','
        try:
            with open(path, 'r', encoding='utf-8') as f:
                sample = f.read(2048)
                sniffer = csv.Sniffer()
                dialect = sniffer.sniff(sample)
                sep = dialect.delimiter
        except Exception:
            # Fallback to default or common separators if sniffer fails
            pass

        encodings = ['utf-8', 'latin1', 'iso-8859-1', 'cp1252']
        separators = [sep, ';', '\t', '|'] # Prioritize detected sep

        for encoding in encodings:
            for separator in separators:
                try:
                    df = pd.read_csv(path, sep=separator, encoding=encoding, on_bad_lines='skip')
                    
                    # Validation: Check if we have more than 1 column
                    # (Unless the file genuinely has 1 column, but usually this indicates bad parsing)
                    if df.shape[1] > 1:
                        df.dropna(how='all', inplace=True)
                        
                        # Clean column names (strip whitespace and quotes)
                        df.columns = df.columns.astype(str).str.strip().str.strip('"').str.strip("'")
                        
                        print(f"Successfully loaded with sep='{separator}' and encoding='{encoding}'")
                        return df
                    
                except Exception:
                    continue
        
        # If all else fails, try default engine='python' which is more robust
        try:
            df = pd.read_csv(path, sep=None, engine='python', encoding='utf-8')
            df.dropna(how='all', inplace=True)
            return df
        except Exception as e:
            print(f"Final loading attempt failed: {e}")
            return None
