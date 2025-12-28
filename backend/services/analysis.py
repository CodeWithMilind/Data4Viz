from typing import Dict, Any, Optional
from ..core.context import DatasetContext
from ..data_utils.summary import DataSummary
from ..data_utils.stats import DataStats
from ..data_utils.schema import DataSchema

class AnalysisService:
    """
    Service for performing data analysis.
    """
    
    @staticmethod
    def get_summary(context: DatasetContext) -> Dict[str, Any]:
        """
        Returns the full summary of the dataset.
        """
        if context.df is None:
            return {"error": "No dataset loaded"}
            
        # Check if summary is already cached in context
        if not context.summary:
            print(f"Generating summary for {context.dataset_id}...")
            context.summary = DataSummary.summarize_data(context.df)
            
        return context.summary
    
    @staticmethod
    def get_missing_report(context: DatasetContext) -> Dict[str, Any]:
        if context.df is None:
            return {}
        return DataStats.missing_report(context.df)
        
    @staticmethod
    def get_basic_stats(context: DatasetContext) -> Dict[str, Any]:
        if context.df is None:
            return {}
        return DataStats.basic_stats(context.df)
