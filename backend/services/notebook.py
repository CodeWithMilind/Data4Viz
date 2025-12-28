import sys
import io
import contextlib
import traceback
from typing import Dict, Any
from ..core.context import DatasetContext

class NotebookService:
    """
    Provides an embedded Python execution environment.
    Simulates a Jupyter Notebook kernel by maintaining state across executions.
    """
    
    @staticmethod
    def execute_cell(context: DatasetContext, code: str) -> Dict[str, Any]:
        """
        Executes a block of Python code within the context of the dataset.
        
        Args:
            context: The dataset context.
            code: The Python code to execute.
            
        Returns:
            dict: Output (stdout), errors (stderr), and execution status.
        """
        
        # Initialize notebook state if empty
        if not context.notebook_state:
            # Inject the dataframe as 'df'
            context.notebook_state = {
                'df': context.df,
                'pd': sys.modules['pandas'],
                'plt': sys.modules['matplotlib.pyplot'],
                'sns': sys.modules['seaborn'],
                'vizion': sys.modules.get('backend.vizion') # Allow access to vizion if imported
            }
            
        # Capture stdout and stderr
        stdout_capture = io.StringIO()
        stderr_capture = io.StringIO()
        
        result = None
        status = "success"
        
        try:
            with contextlib.redirect_stdout(stdout_capture), contextlib.redirect_stderr(stderr_capture):
                # Execute the code in the context's namespace
                exec(code, context.notebook_state)
                
        except Exception:
            # Capture the full traceback
            traceback.print_exc(file=stderr_capture)
            status = "error"
            
        return {
            "stdout": stdout_capture.getvalue(),
            "stderr": stderr_capture.getvalue(),
            "status": status
        }
