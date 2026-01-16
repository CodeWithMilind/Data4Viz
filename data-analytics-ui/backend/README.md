# Data4Viz Backend

Backend data-cleaning engine for the Data4Viz web application.

## Tech Stack

- Python 3.10+
- FastAPI
- pandas
- numpy
- uvicorn

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Create data directory (if it doesn't exist):
```bash
mkdir -p data
```

3. Place your CSV datasets in the `data/` directory.

## Running the Server

**IMPORTANT:** Backend must be running before starting the frontend.

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

## Frontend Connection

- Frontend expects backend at `http://localhost:8000`
- CORS is enabled for `http://localhost:3000`
- Frontend will show empty state if backend is not running
- This is expected behavior - no fake data is displayed

## API Endpoints

### POST `/cleaning/preview`
Preview a cleaning operation without saving changes.

### POST `/cleaning/apply`
Apply a cleaning operation and save the cleaned dataset.

### Request Format

```json
{
  "dataset_id": "sample.csv",
  "operation": "missing_values",
  "column": "Age",
  "action": "fill_mean",
  "preview": true,
  "parameters": {}
}
```

### Response Format

```json
{
  "affected_rows": 10,
  "affected_percentage": 5.2,
  "before_sample": [...],
  "after_sample": [...],
  "warning": "Optional warning message",
  "summary": "Human-readable summary",
  "success": true
}
```

## Supported Operations

### Missing Values
- `drop_rows`: Remove rows with missing values
- `fill_mean`: Fill with column mean (numeric only)
- `fill_median`: Fill with column median (numeric only)
- `fill_mode`: Fill with most frequent value
- `fill_custom`: Fill with custom value

### Duplicates
- `keep_first`: Keep first occurrence (default)
- `keep_last`: Keep last occurrence
- `remove_all`: Remove all duplicate rows

### Invalid Formats
- `safe_convert`: Convert only parseable values
- `remove_invalid`: Remove rows with invalid values
- `replace_invalid`: Replace invalid values (requires method parameter)

### Outliers
- `cap`: Cap outliers to bounds
- `remove`: Remove rows with outliers
- `ignore`: Keep outliers as-is

## Error Handling

- `404`: Dataset not found
- `400`: Invalid request (missing parameters, invalid action, etc.)
- `500`: Internal server error

## CORS

CORS is enabled for `http://localhost:3000` to allow frontend communication.
