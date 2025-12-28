import pandas as pd
import sweetviz as sv
import os
import glob
from typing import Dict, Any

class AnalysisService:
    def __init__(self, output_dir: str = "outputs"):
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)

    def generate_sweetviz_report(self, csv_path: str) -> Dict[str, Any]:
        """
        Generates a Sweetviz HTML report.
        """
        try:
            df = pd.read_csv(csv_path)
            report_name = f"sweetviz_{os.path.basename(csv_path)}.html"
            output_path = os.path.join(self.output_dir, report_name)
            
            # Create report
            report = sv.analyze(df)
            report.show_html(filepath=output_path, open_browser=False)
            
            return {
                "type": "report",
                "tool": "sweetviz",
                "url": f"/outputs/{report_name}",
                "message": "Sweetviz EDA Report generated successfully."
            }
        except Exception as e:
            return {"error": str(e)}

    def generate_basic_stats(self, csv_path: str) -> Dict[str, Any]:
        """
        Generates basic statistics using Pandas and returns JSON.
        """
        try:
            df = pd.read_csv(csv_path)
            description = df.describe().to_dict()
            missing = df.isnull().sum().to_dict()
            columns = df.columns.tolist()
            head = df.head(5).to_dict(orient="records")
            
            return {
                "type": "data",
                "tool": "pandas",
                "data": {
                    "columns": columns,
                    "missing": missing,
                    "stats": description,
                    "sample": head
                },
                "message": "Basic statistics calculated."
            }
        except Exception as e:
            return {"error": str(e)}

    # Placeholder for AutoViz and YData-Profiling (simulated for speed/stability if needed)
    # In a real environment, we would import autoviz and ydata_profiling
    def generate_autoviz_plots(self, csv_path: str) -> Dict[str, Any]:
        """
        Simulates AutoViz execution (since it's heavy to install/run in this constrained env).
        Returns a message that it would generate plots.
        """
        # NOTE: For this demo, we will use basic stats as a proxy or simple seaborn plots if requested.
        # Real AutoViz requires: from autoviz.AutoViz_Class import AutoViz_Class
        return {
            "type": "text",
            "tool": "autoviz",
            "message": "AutoViz would generate charts here. (Simulated for this demo to ensure stability)"
        }
