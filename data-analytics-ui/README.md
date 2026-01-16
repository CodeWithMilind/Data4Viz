# Data4Viz

Professional data science web application for data cleaning, visualization, and analysis.

## Project Structure

```
Data4Viz/
├── frontend/     → Next.js application (port 3000)
└── backend/      → FastAPI application (port 8000)
```

## Prerequisites

- Node.js 18+ and pnpm
- Python 3.10+
- Backend must be running before frontend

## Running the Project

### Backend (Required First)

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend will be available at: `http://localhost:8000`

**IMPORTANT:** Backend must be running before starting the frontend.

### Frontend

```bash
cd frontend  # or root directory if frontend is integrated
pnpm install
pnpm dev
```

Frontend will be available at: `http://localhost:3000`

## Important Notes

### Backend is Single Source of Truth

- **NO fake data** - Frontend shows empty state until backend provides data
- **NO hardcoded datasets** - All dataset names come from backend API
- **NO default selections** - Dataset selection is `null` until backend responds

### Expected Behavior

1. **Backend running, datasets available:**
   - Frontend fetches dataset list from `GET /datasets`
   - Dataset dropdown shows real CSV filenames
   - User can select and clean datasets

2. **Backend running, no datasets:**
   - Frontend shows "No datasets available"
   - Empty state displayed

3. **Backend not running:**
   - Frontend shows empty state
   - Network errors logged to console
   - No fake data displayed

### Data Cleaning Workflow

1. Backend scans `/backend/data` directory for CSV files
2. Frontend calls `GET /datasets` to get list
3. User selects a dataset
4. Cleaning operations call:
   - `POST /cleaning/preview` - Preview changes
   - `POST /cleaning/apply` - Apply and save changes

## Development

- Frontend: Next.js with React 19, TypeScript, shadcn/ui
- Backend: FastAPI with pandas, numpy
- Communication: HTTP JSON only (no shared code)

## Troubleshooting

**Empty UI on startup:**
- This is expected if backend has no datasets
- Check backend logs for errors
- Verify CSV files exist in `/backend/data`

**Hydration warnings:**
- All dataset-dependent UI renders client-side only
- Initial render shows loading state (same on server/client)

**Network errors:**
- Ensure backend is running on port 8000
- Check CORS settings in backend
- Verify `NEXT_PUBLIC_API_URL` if using custom backend URL
