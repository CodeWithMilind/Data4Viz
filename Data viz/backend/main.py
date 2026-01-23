"""
FastAPI backend for intent-based chart generation.

Architecture:
- User sends intent (compare/trend/distribution), not chart type
- Backend analyzes data and decides visualization
- Returns Vega-Lite spec for frontend to render
- Supports optional manual overrides (AI-first, then customization)
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import altair as alt
from typing import Literal, Optional, Dict, Any
import os

app = FastAPI(title="Intent-Based Chart Generator")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load sample dataset
# Path resolution: works when running from project root or backend directory
DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "sample_data.csv")
if not os.path.exists(DATA_PATH):
    # Fallback: try current directory
    DATA_PATH = "sample_data.csv"
df = pd.read_csv(DATA_PATH)
df['date'] = pd.to_datetime(df['date'])


class ChartOverrides(BaseModel):
    """Optional manual overrides for chart customization."""
    chart_type: Optional[Literal["bar", "line", "area", "histogram"]] = None
    x: Optional[str] = None
    y: Optional[str] = None
    aggregation: Optional[Literal["sum", "avg", "count"]] = None
    params: Optional[Dict[str, Any]] = None


class ChartRequest(BaseModel):
    goal: Literal["compare", "trend", "distribution"]
    overrides: Optional[ChartOverrides] = None


class ChartDefaults(BaseModel):
    """AI-recommended defaults returned to frontend."""
    chart_type: str
    x: str
    y: str
    aggregation: str
    params: Dict[str, Any]


class ChartResponse(BaseModel):
    insight_text: str
    vega_lite_spec: dict
    ai_defaults: ChartDefaults


def get_column_metadata(data: pd.DataFrame) -> dict:
    """Return column types for frontend selectors."""
    numeric_cols = data.select_dtypes(include=['number']).columns.tolist()
    categorical_cols = data.select_dtypes(include=['object', 'category']).columns.tolist()
    date_cols = data.select_dtypes(include=['datetime64']).columns.tolist()
    
    return {
        "numeric": numeric_cols,
        "categorical": categorical_cols,
        "date": date_cols,
        "all": data.columns.tolist()
    }


def generate_chart_with_params(
    data: pd.DataFrame,
    chart_type: str,
    x_col: str,
    y_col: str,
    aggregation: str,
    params: Dict[str, Any]
) -> tuple[str, dict]:
    """
    Unified chart generation that respects all parameters.
    Architecture: Single function handles all chart types with parameters.
    """
    # Histogram is special - uses raw data, not aggregated
    if chart_type == "histogram":
        bins = params.get('bins', 15)
        chart = alt.Chart(data).mark_bar().encode(
            x=alt.X(f'{y_col}:Q', bin=alt.Bin(maxbins=bins), title=f'{y_col} Range'),
            y=alt.Y('count():Q', title='Frequency'),
            tooltip=['count():Q']
        ).properties(
            width=600,
            height=400,
            title='Value Distribution'
        )
        
        mean_val = data[y_col].mean()
        median_val = data[y_col].median()
        insight = f"Distribution centered around ${mean_val:,.0f} (mean) and ${median_val:,.0f} (median)."
        return insight, chart.to_dict()
    
    # For other chart types, aggregate data
    # Prepare data based on aggregation
    if aggregation == "sum":
        agg_data = data.groupby(x_col)[y_col].sum().reset_index()
    elif aggregation == "avg":
        agg_data = data.groupby(x_col)[y_col].mean().reset_index()
    elif aggregation == "count":
        agg_data = data.groupby(x_col)[y_col].count().reset_index()
        y_col_renamed = f"{y_col}_count"  # Rename for clarity
        agg_data.columns = [x_col, y_col_renamed]
        y_col = y_col_renamed
    else:
        agg_data = data.groupby(x_col)[y_col].sum().reset_index()
    
    # Determine column types
    x_is_date = pd.api.types.is_datetime64_any_dtype(data[x_col])
    x_type = 'T' if x_is_date else 'N'
    y_type = 'Q'
    
    # Sort if specified
    sort_order = params.get('sort', 'desc')
    if sort_order == 'desc':
        agg_data = agg_data.sort_values(y_col, ascending=False)
    elif sort_order == 'asc':
        agg_data = agg_data.sort_values(y_col, ascending=True)
    
    # Top N filter
    top_n = params.get('top_n')
    if top_n:
        agg_data = agg_data.head(top_n)
    
    # Generate chart based on type
    if chart_type == "bar":
        orientation = params.get('orientation', 'vertical')
        if orientation == 'horizontal':
            chart = alt.Chart(agg_data).mark_bar().encode(
                x=alt.X(f'{y_col}:{y_type}', title=y_col),
                y=alt.Y(f'{x_col}:{x_type}', sort='-x', title=x_col),
                color=alt.Color(f'{x_col}:{x_type}', legend=None)
            )
        else:
            chart = alt.Chart(agg_data).mark_bar().encode(
                x=alt.X(f'{x_col}:{x_type}', sort='-y' if sort_order == 'desc' else 'y', title=x_col),
                y=alt.Y(f'{y_col}:{y_type}', title=y_col),
                color=alt.Color(f'{x_col}:{x_type}', legend=None)
            )
    
    elif chart_type == "line":
        chart = alt.Chart(agg_data).mark_line(point=True).encode(
            x=alt.X(f'{x_col}:{x_type}', title=x_col),
            y=alt.Y(f'{y_col}:{y_type}', title=y_col),
            tooltip=[f'{x_col}:{x_type}', f'{y_col}:{y_type}']
        )
    
    elif chart_type == "area":
        chart = alt.Chart(agg_data).mark_area().encode(
            x=alt.X(f'{x_col}:{x_type}', title=x_col),
            y=alt.Y(f'{y_col}:{y_type}', title=y_col),
            tooltip=[f'{x_col}:{x_type}', f'{y_col}:{y_type}']
        )
    
    else:
        raise ValueError(f"Unknown chart type: {chart_type}")
    
    chart = chart.properties(
        width=600,
        height=400,
        title=f'{chart_type.capitalize()} Chart'
    )
    
    # Generate insight
    max_val = agg_data[y_col].max()
    max_label = agg_data.loc[agg_data[y_col].idxmax(), x_col]
    insight = f"Highest value: {max_label} with ${max_val:,.0f} ({aggregation})."
    
    return insight, chart.to_dict()


def generate_compare_chart(data: pd.DataFrame, overrides: Optional[ChartOverrides] = None) -> tuple[str, dict, ChartDefaults]:
    """
    Compare categories: AI defaults to bar chart with category vs value (sum).
    """
    # AI defaults
    defaults = ChartDefaults(
        chart_type="bar",
        x="category",
        y="value",
        aggregation="sum",
        params={"sort": "desc", "orientation": "vertical"}
    )
    
    # Merge with overrides
    chart_type = overrides.chart_type if overrides and overrides.chart_type else defaults.chart_type
    x_col = overrides.x if overrides and overrides.x else defaults.x
    y_col = overrides.y if overrides and overrides.y else defaults.y
    aggregation = overrides.aggregation if overrides and overrides.aggregation else defaults.aggregation
    params = {**defaults.params}
    if overrides and overrides.params:
        params.update(overrides.params)
    
    # Validate: For compare, x should be categorical
    if x_col not in data.select_dtypes(include=['object', 'category']).columns:
        x_col = defaults.x
    
    insight, spec = generate_chart_with_params(data, chart_type, x_col, y_col, aggregation, params)
    
    return insight, spec, defaults


def generate_trend_chart(data: pd.DataFrame, overrides: Optional[ChartOverrides] = None) -> tuple[str, dict, ChartDefaults]:
    """
    Show trend: AI defaults to line chart with date vs value (sum).
    """
    # AI defaults
    defaults = ChartDefaults(
        chart_type="line",
        x="date",
        y="value",
        aggregation="sum",
        params={}
    )
    
    # Merge with overrides
    chart_type = overrides.chart_type if overrides and overrides.chart_type else defaults.chart_type
    x_col = overrides.x if overrides and overrides.x else defaults.x
    y_col = overrides.y if overrides and overrides.y else defaults.y
    aggregation = overrides.aggregation if overrides and overrides.aggregation else defaults.aggregation
    params = {**defaults.params}
    if overrides and overrides.params:
        params.update(overrides.params)
    
    # Validate: For trend, x should be date
    if x_col not in data.select_dtypes(include=['datetime64']).columns:
        x_col = defaults.x
    
    insight, spec = generate_chart_with_params(data, chart_type, x_col, y_col, aggregation, params)
    
    return insight, spec, defaults


def generate_distribution_chart(data: pd.DataFrame, overrides: Optional[ChartOverrides] = None) -> tuple[str, dict, ChartDefaults]:
    """
    Show distribution: AI defaults to histogram with value distribution.
    """
    # AI defaults
    defaults = ChartDefaults(
        chart_type="histogram",
        x="category",  # Fallback if user overrides to non-histogram
        y="value",
        aggregation="count",
        params={"bins": 15}
    )
    
    # Merge with overrides
    chart_type = overrides.chart_type if overrides and overrides.chart_type else defaults.chart_type
    x_col = overrides.x if overrides and overrides.x else defaults.x
    y_col = overrides.y if overrides and overrides.y else defaults.y
    aggregation = overrides.aggregation if overrides and overrides.aggregation else defaults.aggregation
    params = {**defaults.params}
    if overrides and overrides.params:
        params.update(overrides.params)
    
    # Use unified chart generation
    insight, spec = generate_chart_with_params(data, chart_type, x_col, y_col, aggregation, params)
    
    return insight, spec, defaults


@app.get("/")
def root():
    return {"message": "Intent-Based Chart Generator API"}


@app.get("/columns")
def get_columns():
    """
    Return column metadata for frontend selectors.
    Architecture: Frontend needs to know which columns are valid for X/Y axes.
    """
    return get_column_metadata(df)


@app.post("/generate-chart", response_model=ChartResponse)
def generate_chart(request: ChartRequest):
    """
    Generate chart based on user intent with optional manual overrides.
    
    Architecture decision: 
    - AI always runs first (determines defaults based on intent)
    - Manual overrides are optional and merge with AI defaults
    - Backend validates and enforces safe combinations
    """
    goal = request.goal
    overrides = request.overrides
    
    if goal == "compare":
        insight, spec, defaults = generate_compare_chart(df, overrides)
    elif goal == "trend":
        insight, spec, defaults = generate_trend_chart(df, overrides)
    elif goal == "distribution":
        insight, spec, defaults = generate_distribution_chart(df, overrides)
    else:
        raise ValueError(f"Unknown goal: {goal}")
    
    return ChartResponse(
        insight_text=insight,
        vega_lite_spec=spec,
        ai_defaults=defaults
    )
