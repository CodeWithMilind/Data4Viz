from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..core.context import ContextManager
from ..core.intent import IntentEngine
from ..services.analysis import AnalysisService
from ..services.visualization import VisualizationService
from ..services.notebook import NotebookService

router = APIRouter()
intent_engine = IntentEngine()

class ChatRequest(BaseModel):
    message: str
    dataset_id: Optional[str] = None

@router.post("/chat")
async def chat_interaction(request: ChatRequest):
    """
    Handles user chat messages, determines intent, and executes actions.
    """
    try:
        # Get context
        context = None
        if request.dataset_id:
            context = ContextManager.get_context(request.dataset_id)
        
        # Use latest context if not provided
        if not context:
            context = ContextManager.get_latest_context()
            
        if not context:
             return {
                "response": "Please upload a dataset first so I can help you analyze it.",
                "action": "none"
            }

        # Determine Intent
        intent = intent_engine.determine_intent(request.message)
        response_data = {"action": intent, "response": ""}
        
        if intent == "analysis":
            summary = AnalysisService.get_summary(context)
            rows = summary.get('shape', {}).get('rows', 0)
            cols = summary.get('shape', {}).get('columns', 0)
            response_data["response"] = f"I've analyzed your dataset. It contains {rows} rows and {cols} columns. Here is the statistical overview."
            response_data["data"] = summary
            
        elif intent == "visualization":
            # Smart Plot Generation
            plot = VisualizationService.get_smart_plot(context, request.message)
            if plot:
                response_data["response"] = "I've generated a visualization based on your data."
                response_data["image"] = plot
            else:
                response_data["response"] = "I couldn't find suitable numeric data to plot automatically. Try asking for specific columns."
                
        elif intent == "notebook":
            response_data["response"] = "I've opened the notebook environment for you. The dataset is pre-loaded as 'df'."
            
        else:
            # Better Fallback
            response_data["response"] = "I can help you analyze this data. Try asking to 'summarize data', 'show statistics', or 'plot charts'."
            
        return response_data

    except Exception as e:
        print(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
