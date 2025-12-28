"""
transformer.py

This module is responsible for transforming the structure
of the dataset without cleaning or validating it.

Supported transformations:
- Column renaming
- Column name standardization
- Categorical encoding
"""

import pandas as pd
from typing import Dict, List

from history import HistoryLogger


class DataTransformer:
    """
    DataTransformer applies structural changes
    to the dataset.

    WHY a class?
    - Controlled transformations
    - Clean engine integration
    """

    def __init__(self, history: HistoryLogger):
        """
        Initialize transformer with shared history logger.
        """
        self.history = history

    def rename_columns(self, df: pd.DataFrame, mapping: Dict[str, str]) -> pd.DataFrame:
        """
        Rename columns using a mapping dictionary.

        WHY:
        - Explicit renaming avoids silent mistakes
        """

        try:
            df = df.rename(columns=mapping)

            self.history.log(
                module="transformer",
                action="rename_columns",
                status="success",
                details={"mapping": mapping}
            )

            return df

        except Exception as e:
            self.history.log(
                module="transformer",
                action="rename_columns",
                status="failed",
                error=str(e)
            )
            raise

    def standardize_column_names(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Convert column names to lowercase and replace spaces with underscores.

        WHY:
        - Prevents bugs
        - Industry standard practice
        """

        try:
            df.columns = (
                df.columns
                .str.strip()
                .str.lower()
                .str.replace(" ", "_")
            )

            self.history.log(
                module="transformer",
                action="standardize_column_names",
                status="success"
            )

            return df

        except Exception as e:
            self.history.log(
                module="transformer",
                action="standardize_column_names",
                status="failed",
                error=str(e)
            )
            raise

    def encode_categorical(self, df: pd.DataFrame, columns: List[str]) -> pd.DataFrame:
        """
        Encode categorical columns using one-hot encoding.

        WHY:
        - Safe
        - Reversible
        - No loss of information
        """

        try:
            df = pd.get_dummies(df, columns=columns)

            self.history.log(
                module="transformer",
                action="encode_categorical",
                status="success",
                details={"encoded_columns": columns}
            )

            return df

        except Exception as e:
            self.history.log(
                module="transformer",
                action="encode_categorical",
                status="failed",
                error=str(e)
            )
            raise
