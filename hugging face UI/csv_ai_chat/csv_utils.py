import io
from typing import Optional

import pandas as pd


def load_csv(file) -> pd.DataFrame:
    """
    Load a CSV file (uploaded via Streamlit) into a pandas DataFrame.
    """
    if hasattr(file, "read"):
        content = file.read()
        if isinstance(content, bytes):
            content = content.decode("utf-8", errors="ignore")
        buffer = io.StringIO(content)
        df = pd.read_csv(buffer)
    else:
        df = pd.read_csv(file)
    return df


def dataframe_to_text(df: pd.DataFrame, max_rows: int = 5) -> str:
    """
    Convert a DataFrame to a short text representation with head and simple info.
    """
    if df.empty:
        return "The CSV is empty."

    lines = []
    lines.append(f"Number of rows: {len(df)}")
    lines.append(f"Number of columns: {len(df.columns)}")
    lines.append("Column names: " + ", ".join(map(str, df.columns)))

    head_rows = df.head(max_rows)
    lines.append("")
    lines.append(f"First {len(head_rows)} rows:")
    lines.append(head_rows.to_string(index=False))

    numeric_cols = df.select_dtypes(include="number")
    if not numeric_cols.empty:
        desc = numeric_cols.describe().transpose()
        lines.append("")
        lines.append("Basic statistics for numeric columns:")
        lines.append(desc.to_string())

    return "\n".join(lines)


def safe_dataframe_to_text(df: Optional[pd.DataFrame]) -> str:
    if df is None:
        return ""
    return dataframe_to_text(df)

