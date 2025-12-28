import pandas as pd
from typing import Optional, Dict, Any
from dataclasses import dataclass, field

@dataclass
class DatasetContext:
    """
    Holds the state of the currently loaded dataset and session.
    """
    dataset_id: str
    file_path: str
    df: Optional[pd.DataFrame] = None
    summary: Dict[str, Any] = field(default_factory=dict)
    notebook_state: Dict[str, Any] = field(default_factory=dict)

    def update_summary(self, summary_data: Dict[str, Any]):
        """Updates the summary data."""
        self.summary = summary_data

class ContextManager:
    """
    Singleton to manage active dataset contexts.
    In a real multi-user app, this would be a database or Redis.
    For a local workbench, a global dictionary is sufficient.
    """
    _instance = None
    _contexts: Dict[str, DatasetContext] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ContextManager, cls).__new__(cls)
        return cls._instance

    @classmethod
    def get_context(cls, dataset_id: str) -> Optional[DatasetContext]:
        return cls._contexts.get(dataset_id)

    @classmethod
    def set_context(cls, context: DatasetContext):
        cls._contexts[context.dataset_id] = context

    @classmethod
    def delete_context(cls, dataset_id: str):
        if dataset_id in cls._contexts:
            del cls._contexts[dataset_id]
            
    @classmethod
    def get_latest_context(cls) -> Optional[DatasetContext]:
        """Returns the most recently added context."""
        if not cls._contexts:
            return None
        # Return the last added one (Python 3.7+ dicts preserve insertion order)
        return list(cls._contexts.values())[-1]
