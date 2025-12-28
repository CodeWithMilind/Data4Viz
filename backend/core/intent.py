class IntentEngine:
    """
    Rule-based intent recognition system.
    Decides which service/action to trigger based on user input.
    """
    
    def determine_intent(self, query: str) -> str:
        """
        Analyzes the query string to determine the user's intent.
        """
        query = query.lower().strip()
        
        # Notebook / Code intent
        if any(w in query for w in ["notebook", "code", "script", "python", "jupyter"]):
            return "notebook"
            
        # Visualization intent
        if any(w in query for w in ["plot", "chart", "graph", "histogram", "scatter", "visualize", "show me"]):
            return "visualization"
            
        # Analysis / Stats intent
        if any(w in query for w in ["stats", "statistics", "describe", "mean", "median", "summary", "profile", "analyze", "overview", "columns", "info"]):
            return "analysis"
            
        # Data Cleaning intent
        if any(w in query for w in ["clean", "missing", "null", "drop", "fill", "na"]):
            return "cleaning"
            
        # General chat or unknown
        return "chat"
