# Intent-Based Chart Generator - POC

**Proof of Concept**: All charts are generated in Python backend based on user intent (not chart type), and the frontend only renders the result.

**AI-First Philosophy**: AI-generated visualization always runs first. Manual customization is optional and comes after AI output.

## Architecture

- **Backend**: FastAPI + Pandas + Altair
  - Analyzes data based on intent (compare/trend/distribution)
  - Decides visualization internally (AI-first)
  - Supports optional manual overrides
  - Returns Vega-Lite spec + AI defaults
  
- **Frontend**: Minimal HTML
  - Renders Vega-Lite spec from backend
  - Optional customization controls (chart type, columns, aggregation, parameters)
  - No chart type selection logic in initial generation

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Start the backend:
```bash
cd backend
uvicorn main:app --reload
```

The API will run on `http://localhost:8000`

3. Open the frontend:
   - Open `frontend/index.html` in a web browser
   - Or serve it with a simple HTTP server:
     ```bash
     cd frontend
     python -m http.server 8080
     ```
     Then open `http://localhost:8080`

## Usage

### Step 1: AI Generation (Always First)
1. Click one of the three buttons: **Compare**, **Trend**, or **Distribution**
2. The backend analyzes the data and generates an appropriate chart
3. The frontend renders the Vega-Lite spec returned by the backend
4. An insight text is displayed above the chart

### Step 2: Optional Customization
1. Click **"Customize chart"** button below the generated chart
2. Adjust chart controls:
   - **Chart Type**: Switch between bar, line, area, histogram (AI recommendation shown)
   - **X-Axis**: Select categorical or date column
   - **Y-Axis**: Select numeric column
   - **Aggregation**: Choose sum, average, or count
   - **Parameters**: Chart-specific options (orientation, sort, bins, etc.)
3. Click **"Apply Changes"** to regenerate chart with overrides

## API Endpoints

### GET `/columns`
Returns column metadata for frontend selectors:
```json
{
  "numeric": ["value"],
  "categorical": ["category", "region"],
  "date": ["date"],
  "all": ["date", "category", "value", "region"]
}
```

### POST `/generate-chart`

Request (AI-only):
```json
{
  "goal": "compare"  // or "trend" or "distribution"
}
```

Request (with overrides):
```json
{
  "goal": "compare",
  "overrides": {
    "chart_type": "bar",
    "x": "category",
    "y": "value",
    "aggregation": "sum",
    "params": {
      "sort": "desc",
      "top_n": 5
    }
  }
}
```

Response:
```json
{
  "insight_text": "Electronics leads with $15,000...",
  "vega_lite_spec": { ... },
  "ai_defaults": {
    "chart_type": "bar",
    "x": "category",
    "y": "value",
    "aggregation": "sum",
    "params": { "sort": "desc", "orientation": "vertical" }
  }
}
```

## Key Design Decisions

1. **AI-First**: AI-generated visualization always runs first. Manual controls are optional.
2. **Intent-based, not chart-based**: User sends "compare" not "bar chart"
3. **Backend decides visualization**: Python logic chooses the best chart type
4. **Optional overrides**: Manual customization merges with AI defaults
5. **Backend validation**: Backend enforces safe column/chart combinations
6. **Frontend is dumb**: Only renders what backend provides, no chart logic
7. **Vega-Lite as bridge**: Standardized spec format between backend and frontend

## Project Structure

```
.
├── backend/
│   └── main.py          # FastAPI app with chart generation logic
├── frontend/
│   └── index.html       # Minimal HTML frontend
├── sample_data.csv      # Sample dataset
├── requirements.txt     # Python dependencies
└── README.md           # This file
```
