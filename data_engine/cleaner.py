"""
cleaner.py

Responsible for cleaning common data issues:
- Missing values
- Duplicate rows
"""

import pandas as pd
from typing import Optional

from history import HistoryLogger


class DataCleaner:
    """
    DataCleaner fixes basic data quality issues.
    """

    def __init__(self, history: HistoryLogger):
        self.history = history

    def drop_missing(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Drop rows with missing values.

        WHY:
        - Simple
        - Predictable
        """

        try:
            before = len(df)
            df = df.dropna()
            after = len(df)

            self.history.log(
                module="cleaner",
                action="drop_missing",
                status="success",
                details={"rows_removed": before - after}
            )

            return df

        except Exception as e:
            self.history.log(
                module="cleaner",
                action="drop_missing",
                status="failed",
                error=str(e)
            )
            raise

    def drop_duplicates(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Remove duplicate rows.
        """

        try:
            before = len(df)
            df = df.drop_duplicates()
            after = len(df)

            self.history.log(
                module="cleaner",
                action="drop_duplicates",
                status="success",
                details={"duplicates_removed": before - after}
            )

            return df

        except Exception as e:
            self.history.log(
                module="cleaner",
                action="drop_duplicates",
                status="failed",
                error=str(e)
            )
            raise
