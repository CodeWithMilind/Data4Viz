import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import numpy as np
import io
import base64
from typing import Optional, List
from ..core.context import DatasetContext

class VisualizationService:
    """
    Service for generating static visualizations with smart defaults.
    """
    
    @staticmethod
    def _to_numeric(df: pd.DataFrame, col: str) -> pd.Series:
        """Attempts to convert a column to numeric, coercing errors."""
        return pd.to_numeric(df[col], errors='coerce')

    @staticmethod
    def get_smart_plot(context: DatasetContext, query: str = "") -> Optional[str]:
        """
        Decides the best plot to generate based on dataset content and user query.
        """
        if context.df is None:
            return None
            
        df = context.df.copy()
        query = query.lower()
        
        # 0. Parse Query for Explicit Intent
        found_cols = []
        for col in df.columns:
            if col.lower() in query:
                found_cols.append(col)
        
        plot_type = 'bar' # Default
        if 'scatter' in query: plot_type = 'scatter'
        elif 'line' in query: plot_type = 'line'
        elif 'hist' in query: plot_type = 'histogram'
        elif 'box' in query: plot_type = 'box'
        
        # If columns found in query, try to plot them
        if found_cols:
            x = found_cols[0]
            y = found_cols[1] if len(found_cols) > 1 else None
            
            # Smart swap if necessary (e.g. if x is numeric and y is categorical for a bar chart)
            if y and plot_type == 'bar':
                is_x_numeric = pd.api.types.is_numeric_dtype(df[x])
                is_y_numeric = pd.api.types.is_numeric_dtype(df[y])
                if is_x_numeric and not is_y_numeric:
                    x, y = y, x # Swap so categorical is on X
            
            # If only 1 column and it's numeric, histogram is better than bar
            if not y and pd.api.types.is_numeric_dtype(df[x]) and plot_type == 'bar':
                plot_type = 'histogram'

            return VisualizationService.generate_plot(context, plot_type, x, y)
        
        # --- Fallback to Heuristics (existing logic) ---
        
        # 1. Identify Column Types
        num_cols = df.select_dtypes(include=['number']).columns.tolist()
        cat_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
        
        # Try to convert object columns that might be numeric
        for col in cat_cols:
            if df[col].nunique() > 0:
                sample = df[col].dropna().iloc[0]
                if isinstance(sample, str) and sample.replace('.', '', 1).isdigit():
                    df[col] = pd.to_numeric(df[col], errors='coerce')
                    num_cols.append(col)
                    if col in cat_cols: cat_cols.remove(col)

        # 2. Heuristics
        # If we have numeric columns, plot the first one as a distribution
        if num_cols:
            plt.figure(figsize=(10, 6))
            sns.histplot(data=df, x=num_cols[0], kde=True, color='#6366F1')
            plt.title(f"Distribution of {num_cols[0]}")
            plt.grid(True, alpha=0.1)
            return VisualizationService._save_plot()
            
        # If no numeric, but categorical, plot counts of top categorical
        if cat_cols:
            target_col = cat_cols[0]
            # Check cardinality
            if df[target_col].nunique() > 20:
                # Find a better one or take top 10
                top_counts = df[target_col].value_counts().head(10).index
                df = df[df[target_col].isin(top_counts)]
            
            plt.figure(figsize=(10, 6))
            sns.countplot(data=df, y=target_col, palette='viridis')
            plt.title(f"Count of {target_col}")
            plt.grid(True, alpha=0.1)
            return VisualizationService._save_plot()
            
        return None

    @staticmethod
    def generate_plot(context: DatasetContext, plot_type: str, x: str, y: Optional[str] = None, aggregation: Optional[str] = None) -> Optional[str]:
        # Existing logic kept but improved error handling
        if context.df is None: return None
        df = context.df.copy()
        
        # Apply Aggregation if requested
        if aggregation and aggregation != 'none' and y:
            try:
                # Ensure y is numeric for aggregation
                df[y] = pd.to_numeric(df[y], errors='coerce')
                df = df.dropna(subset=[y])
                
                # Group by X and aggregate Y
                df = df.groupby(x)[y].agg(aggregation).reset_index()
            except Exception as e:
                print(f"Aggregation failed: {e}")
                # Fallback to original df if aggregation fails
                pass

        plt.figure(figsize=(10, 6))
        try:
            if plot_type == 'histogram':
                sns.histplot(data=df, x=x, kde=True)
            elif plot_type == 'scatter' and y:
                sns.scatterplot(data=df, x=x, y=y)
            elif plot_type == 'box':
                sns.boxplot(data=df, x=x, y=y)
            elif plot_type == 'bar':
                sns.barplot(data=df, x=x, y=y)
            elif plot_type == 'line':
                sns.lineplot(data=df, x=x, y=y)
            
            title = f"{plot_type.capitalize()} of {x}"
            if y:
                title += f" vs {y}"
            if aggregation and aggregation != 'none':
                title += f" ({aggregation})"
                
            plt.title(title)
            plt.grid(True, alpha=0.1)
            return VisualizationService._save_plot()
        except Exception:
            return None

    @staticmethod
    def _save_plot():
        plt.tight_layout()
        buf = io.BytesIO()
        plt.savefig(buf, format='png', transparent=True)
        buf.seek(0)
        img_str = base64.b64encode(buf.read()).decode('utf-8')
        plt.close()
        return img_str
