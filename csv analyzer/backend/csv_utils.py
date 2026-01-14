import io
import uuid
from typing import Dict, Optional

import pandas as pd

_DATASETS: Dict[str, pd.DataFrame] = {}


def store_csv_in_memory(content: bytes, filename: str) -> str:
    dataset_id = str(uuid.uuid4())
    df = pd.read_csv(io.BytesIO(content))
    _DATASETS[dataset_id] = df
    return dataset_id


def get_dataset(dataset_id: str) -> Optional[pd.DataFrame]:
    return _DATASETS.get(dataset_id)


def build_dataset_metadata(df: pd.DataFrame) -> str:
    rows, cols = df.shape
    column_info = ", ".join([f"{name} ({dtype})" for name, dtype in df.dtypes.items()])
    head_str = df.head(5).to_markdown(index=False)
    meta = (
        f"Number of rows: {rows}\n"
        f"Number of columns: {cols}\n"
        f"Columns (name and dtype): {column_info}\n"
        f"Sample data (first 5 rows):\n{head_str}\n"
    )
    return meta

