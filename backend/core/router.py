from typing import Dict, Any

class IntentRouter:
    """
    Routes parsed intents to the appropriate service.
    """
    
    @staticmethod
    def route(intent: str, context_id: str, payload: Dict[str, Any] = None):
        """
        Dispatches the intent to the correct service.
        
        Args:
            intent (str): The detected intent (e.g., 'summary', 'plot', 'notebook').
            context_id (str): The ID of the dataset context.
            payload (dict): Additional parameters for the action.
        """
        # This will be connected to the actual services later.
        # For now, it defines the contract.
        print(f"Routing intent: {intent} for context: {context_id}")
        return {"status": "routed", "intent": intent}
