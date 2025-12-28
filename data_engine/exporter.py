"""
exporter.py

Exports final processed data to disk.
"""

import pandas as pd
import os

from history import HistoryLogger


class DataExporter:
    """
    Handles data export operations.
    """

    def __init__(self, history: HistoryLogger):
        self.history = history

    def export(self, df: pd.DataFrame, output_path: str):
        """
        Export DataFrame based on file extension.
        """

        try:
            _, ext = os.path.splitext(output_path)
            ext = ext.lower()

            if ext == ".csv":
                df.to_csv(output_path, index=False)

            elif ext in [".xlsx", ".xls"]:
                df.to_excel(output_path, index=False)

            elif ext == ".json":
                df.to_json(output_path, orient="records", indent=4)

            else:
                raise ValueError(f"Unsupported export format: {ext}")

            self.history.log(
                module="exporter",
                action="export_data",
                status="success",
                details={"output_path": output_path}
            )

        except Exception as e:
            self.history.log(
                module="exporter",
                action="export_data",
                status="failed",
                error=str(e)
            )
            raise
