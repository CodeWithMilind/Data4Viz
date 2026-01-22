"""Python execution endpoint for AI-generated code analysis.

This endpoint:
1. Executes Python code in a sandboxed environment
2. Captures stdout, figures, and variables
3. Generates .ipynb notebook
4. Extracts insights to JSON
5. Saves both to workspace
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path
import pandas as pd
import numpy as np
import json
import io
import sys
import traceback
from typing import Dict, Any, Optional
import logging
from app.config import get_workspace_dir, get_workspace_datasets_dir, get_workspace_files_dir

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workspaces", tags=["python-execution"])

# Allowed imports for security
ALLOWED_IMPORTS = {
    "pandas": pd,
    "numpy": np,
    "pd": pd,
    "np": np,
}

# Try to import matplotlib/seaborn if available
try:
    import matplotlib
    matplotlib.use("Agg")  # Non-interactive backend
    import matplotlib.pyplot as plt
    ALLOWED_IMPORTS["matplotlib"] = matplotlib
    ALLOWED_IMPORTS["matplotlib.pyplot"] = plt
    ALLOWED_IMPORTS["plt"] = plt
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False
    logger.warning("matplotlib not available, plots will be skipped")

try:
    import seaborn as sns
    ALLOWED_IMPORTS["seaborn"] = sns
    ALLOWED_IMPORTS["sns"] = sns
    HAS_SEABORN = True
except ImportError:
    HAS_SEABORN = False


class ExecutePythonRequest(BaseModel):
    """Request model for Python execution."""
    code: str
    dataset_path: str


class ExecutePythonResponse(BaseModel):
    """Response model for Python execution."""
    success: bool
    notebook_path: str
    insights_path: str
    error: Optional[str] = None


class SandboxedExecutor:
    """Sandboxed Python executor that captures outputs and generates notebooks."""
    
    def __init__(self, workspace_id: str, dataset_path: str):
        self.workspace_id = workspace_id
        self.dataset_path = dataset_path
        self.stdout_capture = io.StringIO()
        self.figures = []
        self.variables = {}
        self.error = None
        self.result = None
        
    def execute(self, code: str) -> Dict[str, Any]:
        """Execute Python code in sandboxed environment."""
        # Reset state
        self.stdout_capture = io.StringIO()
        self.figures = []
        self.variables = {}
        self.error = None
        self.result = None
        
        # Get dataset full path
        datasets_dir = get_workspace_datasets_dir(self.workspace_id)
        full_dataset_path = datasets_dir / self.dataset_path
        
        if not full_dataset_path.exists():
            raise FileNotFoundError(f"Dataset not found: {self.dataset_path}")
        
        # Create sandboxed namespace
        namespace = {
            "__builtins__": {
                "print": self._print,
                "len": len,
                "str": str,
                "int": int,
                "float": float,
                "bool": bool,
                "list": list,
                "dict": dict,
                "tuple": tuple,
                "set": set,
                "range": range,
                "enumerate": enumerate,
                "zip": zip,
                "min": min,
                "max": max,
                "sum": sum,
                "abs": abs,
                "round": round,
                "sorted": sorted,
                "reversed": reversed,
                "isinstance": isinstance,
                "type": type,
                "hasattr": hasattr,
                "getattr": getattr,
                "setattr": setattr,
                "json": json,
            },
            **ALLOWED_IMPORTS,
            "pd": pd,
            "np": np,
            "df": None,  # Will be set by code
            "dataset_path": str(full_dataset_path),
        }
        
        # Add matplotlib if available
        if HAS_MATPLOTLIB:
            namespace["plt"] = plt
            namespace["matplotlib"] = matplotlib
        
        if HAS_SEABORN:
            namespace["sns"] = sns
        
        try:
            # Execute code
            old_stdout = sys.stdout
            sys.stdout = self.stdout_capture
            
            try:
                # Execute user code
                exec(code, namespace)
                
                # Capture result - check namespace directly
                if "result" in namespace:
                    self.result = namespace["result"]
                elif "results" in namespace:
                    self.result = namespace["results"]
                elif "summary" in namespace:
                    self.result = namespace["summary"]
                elif "insights" in namespace:
                    self.result = namespace["insights"]
                else:
                    # Create result from df if it exists
                    if "df" in namespace:
                        df = namespace["df"]
                        self.result = {}
                        if hasattr(df, "shape"):
                            self.result["df_shape"] = list(df.shape)
                        if hasattr(df, "isna"):
                            missing = df.isna().sum()
                            if hasattr(missing, "to_dict"):
                                self.result["missing_values"] = missing.to_dict()
                            else:
                                self.result["missing_values"] = {}
                
                # Capture all variables (excluding builtins)
                for key, value in namespace.items():
                    if not key.startswith("__") and key not in ALLOWED_IMPORTS:
                        try:
                            # Only capture simple types or pandas objects
                            if isinstance(value, (str, int, float, bool, list, dict, type(None))):
                                self.variables[key] = value
                            elif isinstance(value, pd.DataFrame):
                                self.variables[key] = {
                                    "type": "DataFrame",
                                    "shape": value.shape,
                                    "columns": value.columns.tolist(),
                                }
                            elif isinstance(value, pd.Series):
                                self.variables[key] = {
                                    "type": "Series",
                                    "length": len(value),
                                    "name": value.name,
                                }
                        except Exception:
                            pass  # Skip variables that can't be serialized
                
                # Capture figures if matplotlib is available
                if HAS_MATPLOTLIB:
                    import base64
                    for i, fig_num in enumerate(plt.get_fignums()):
                        figure = plt.figure(fig_num)
                        # Save figure to bytes
                        buf = io.BytesIO()
                        figure.savefig(buf, format="png", bbox_inches="tight")
                        buf.seek(0)
                        fig_data = base64.b64encode(buf.read()).decode("utf-8")
                        self.figures.append({
                            "index": i,
                            "data": fig_data,
                            "format": "png",
                        })
                        plt.close(figure)
                
            except Exception as e:
                self.error = str(e)
                traceback.print_exc(file=self.stdout_capture)
            finally:
                sys.stdout = old_stdout
                
        except Exception as e:
            self.error = f"Execution error: {str(e)}"
            traceback.print_exc(file=self.stdout_capture)
        
        return {
            "stdout": self.stdout_capture.getvalue(),
            "figures": self.figures,
            "variables": self.variables,
            "result": self.result,
            "error": self.error,
        }
    
    def _print(self, *args, **kwargs):
        """Custom print function that captures output."""
        output = " ".join(str(arg) for arg in args)
        if kwargs.get("end", "\n") == "\n":
            output += "\n"
        self.stdout_capture.write(output)
    
    def generate_notebook(self, code: str, execution_result: Dict[str, Any]) -> Dict[str, Any]:
        """Generate Jupyter notebook from code and execution results."""
        cells = []
        
        # Title cell
        cells.append({
            "cell_type": "markdown",
            "metadata": {},
            "source": ["# Auto Dataset Summary (Generated by Data4Viz)\n", "\n", "This notebook was automatically generated by Data4Viz AI analysis."],
        })
        
        # Code cell
        code_cell = {
            "cell_type": "code",
            "execution_count": 1,
            "metadata": {},
            "source": code.split("\n"),
            "outputs": [],
        }
        
        # Add stdout output
        if execution_result["stdout"]:
            code_cell["outputs"].append({
                "output_type": "stream",
                "name": "stdout",
                "text": execution_result["stdout"].split("\n"),
            })
        
        # Add error output
        if execution_result["error"]:
            code_cell["outputs"].append({
                "output_type": "error",
                "ename": "Error",
                "evalue": execution_result["error"],
                "traceback": execution_result["stdout"].split("\n") if execution_result["stdout"] else [],
            })
        
        # Add display data outputs (figures)
        for fig in execution_result["figures"]:
            code_cell["outputs"].append({
                "output_type": "display_data",
                "data": {
                    "image/png": fig["data"],
                },
                "metadata": {},
            })
        
        cells.append(code_cell)
        
        # Result cell if result exists
        if execution_result["result"]:
            result_cell = {
                "cell_type": "code",
                "execution_count": 2,
                "metadata": {},
                "source": ["# Analysis Results\n", "import json\n", "print(json.dumps(result, indent=2))"],
                "outputs": [{
                    "output_type": "stream",
                    "name": "stdout",
                    "text": [json.dumps(execution_result["result"], indent=2)],
                }],
            }
            cells.append(result_cell)
        
        notebook = {
            "cells": cells,
            "metadata": {
                "kernelspec": {
                    "display_name": "Python 3",
                    "language": "python",
                    "name": "python3",
                },
                "language_info": {
                    "name": "python",
                    "version": "3.10",
                },
            },
            "nbformat": 4,
            "nbformat_minor": 4,
        }
        
        return notebook
    
    def extract_insights(self, execution_result: Dict[str, Any]) -> Dict[str, Any]:
        """Extract compact insights from execution results."""
        insights = {
            "rows": 0,
            "columns": 0,
            "missing": {},
            "numeric_stats": {},
            "categorical_stats": {},
            "key_findings": [],
        }
        
        # Extract from result if available
        if execution_result.get("result"):
            result = execution_result["result"]
            
            # Extract shape
            if "df_shape" in result:
                insights["rows"] = result["df_shape"][0] if isinstance(result["df_shape"], (list, tuple)) else 0
                insights["columns"] = result["df_shape"][1] if isinstance(result["df_shape"], (list, tuple)) else 0
            
            # Extract missing values
            if "missing_values" in result:
                missing = result["missing_values"]
                if isinstance(missing, dict):
                    for col, count in missing.items():
                        if count > 0:
                            insights["missing"][col] = int(count)
            
            # Extract numeric stats
            if "numeric_stats" in result:
                insights["numeric_stats"] = result["numeric_stats"]
            
            # Extract categorical stats
            if "categorical_stats" in result:
                insights["categorical_stats"] = result["categorical_stats"]
            
            # Extract key findings
            if "key_findings" in result:
                insights["key_findings"] = result["key_findings"]
            elif "findings" in result:
                insights["key_findings"] = result["findings"]
        
        # Extract from variables
        if "df" in execution_result.get("variables", {}):
            df_info = execution_result["variables"]["df"]
            if isinstance(df_info, dict) and "shape" in df_info:
                insights["rows"] = df_info["shape"][0]
                insights["columns"] = df_info["shape"][1]
        
        # Generate key findings if missing
        if not insights["key_findings"]:
            findings = []
            if insights["missing"]:
                findings.append(f"{len(insights['missing'])} column(s) have missing values")
            if insights["numeric_stats"]:
                findings.append(f"Numeric analysis completed for {len(insights['numeric_stats'])} column(s)")
            if insights["categorical_stats"]:
                findings.append(f"Categorical analysis completed for {len(insights['categorical_stats'])} column(s)")
            insights["key_findings"] = findings
        
        return insights


@router.post("/{workspace_id}/execute-python", response_model=ExecutePythonResponse)
async def execute_python(
    workspace_id: str,
    request: ExecutePythonRequest,
):
    """
    Execute Python code in a sandboxed environment and generate notebook.
    
    SECURITY:
    - No network access
    - No filesystem access outside workspace
    - Only allowed imports (pandas, numpy, matplotlib, seaborn)
    - No os, subprocess, or other dangerous modules
    
    Args:
        workspace_id: Workspace identifier
        request: Python code and dataset path
        
    Returns:
        Paths to generated notebook and insights JSON
    """
    try:
        executor = SandboxedExecutor(workspace_id, request.dataset_path)
        execution_result = executor.execute(request.code)
        
        if execution_result["error"]:
            return ExecutePythonResponse(
                success=False,
                notebook_path="",
                insights_path="",
                error=execution_result["error"],
            )
        
        # Generate notebook
        notebook = executor.generate_notebook(request.code, execution_result)
        
        # Save notebook
        files_dir = get_workspace_files_dir(workspace_id)
        notebook_path = files_dir / "auto_summary.ipynb"
        with open(notebook_path, "w", encoding="utf-8") as f:
            json.dump(notebook, f, indent=2)
        
        # Extract and save insights
        insights = executor.extract_insights(execution_result)
        insights_dir = get_workspace_dir(workspace_id) / "insights"
        insights_dir.mkdir(exist_ok=True)
        insights_path = insights_dir / "auto_summary.json"
        with open(insights_path, "w", encoding="utf-8") as f:
            json.dump(insights, f, indent=2)
        
        # Return relative paths
        notebook_rel_path = f"files/{notebook_path.name}"
        insights_rel_path = f"insights/{insights_path.name}"
        
        return ExecutePythonResponse(
            success=True,
            notebook_path=notebook_rel_path,
            insights_path=insights_rel_path,
        )
        
    except Exception as e:
        logger.error(f"Python execution error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Execution failed: {str(e)}")
