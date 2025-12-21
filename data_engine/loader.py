"""
loader.py

This module is responsible for safely loading data
from supported file formats into a pandas DataFrame.

Supported formats:
- CSV
- Excel (.xlsx, .xls)
- JSON

Design principles:
- Offline only
- Safe file handling
- Clear errors
- Full logging via history.py
"""

import os
from typing import Union

import pandas as pd

from history import HistoryLogger


class DataLoader:
    """
    DataLoader handles reading data files and converting them
    into pandas DataFrames.

    WHY a class?
    - Keeps loader logic isolated
    - Makes engine integration clean
    - Easy to extend with more formats later
    """

    def __init__(self, history: HistoryLogger):
        """
        Initialize the DataLoader.

        Parameters:
        history (HistoryLogger): Shared history logger instance

        WHY:
        - Loader should not create its own logger
        - One central history across the entire engine
        """
        self.history = history

    def load(self, file_path: str) -> pd.DataFrame:
        """
        Load a file into a pandas DataFrame.

        Parameters:
        file_path (str): Path to the input data file

        Returns:
        pd.DataFrame: Loaded data

        Raises:
        ValueError: If file type is unsupported
        FileNotFoundError: If file does not exist
        """

        try:
            # 1️⃣ Check if file exists
            # WHY: Prevent silent failures and unclear pandas errors
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"File not found: {file_path}")

            # 2️⃣ Detect file extension
            _, extension = os.path.splitext(file_path)
            extension = extension.lower()

            # 3️⃣ Load based on file type
            if extension == ".csv":
                df = pd.read_csv(file_path)

            elif extension in [".xlsx", ".xls"]:
                df = pd.read_excel(file_path)

            elif extension == ".json":
                df = pd.read_json(file_path)

            else:
                # Unsupported file type
                raise ValueError(f"Unsupported file format: {extension}")

            # 4️⃣ Log successful load
            self.history.log(
                module="loader",
                action="load_file",
                status="success",
                details={
                    "file_path": file_path,
                    "rows": len(df),
                    "columns": len(df.columns)
                }
            )

            return df

        except Exception as e:
            # 5️⃣ Log failure
            self.history.log(
                module="loader",
                action="load_file",
                status="failed",
                details={"file_path": file_path},
                error=str(e)
            )

            # Re-raise error so engine knows something failed
            raise
