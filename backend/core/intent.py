from typing import Dict, Any

class IntentEngine:
    """
    Rule-based intent recognition system.
    Decides which analysis tool to use based on keywords.
    """
    
    def determine_intent(self, query: str) -> str:
        query = query.lower()
        
        if any(w in query for w in ["eda", "report", "sweetviz", "summary"]):
            return "sweetviz"
        
        if any(w in query for w in ["profile", "profiling", "overview", "quality"]):
            return "basic_stats" # Fallback to basic stats if ydata is too heavy, or "ydata"
        
        if any(w in query for w in ["plot", "chart", "graph", "visual", "autoviz"]):
            return "autoviz"
            
        if any(w in query for w in ["stats", "describe", "count", "mean", "average"]):
            return "basic_stats"
            
        return "unknown"
