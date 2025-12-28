# Data4Viz - AI Data Science Workbench
## System Overview for Technical Review

### 1. Project Goal
Data4Viz is a **local, privacy-first AI Workbench for Data Scientists**. It mimics the experience of modern AI tools like Perplexity or Comet but focuses entirely on **automated data analysis (EDA)** and **visualization**. 

Unlike a standard chatbot, this system:
- Takes raw CSV data.
- Detects user intent ("Analyze this", "Show stats", "Plot distribution").
- **Executes real Python code** (Pandas, Sweetviz) to generate insights.
- Returns interactive HTML reports or visualizations directly in the UI.

---

### 2. Architecture

The system follows a **Client-Server Architecture**:

#### **Frontend (The "Face")**
- **Tech Stack**: HTML5, CSS3 (Grid/Flexbox), Vanilla JavaScript.
- **Library**: Plotly.js (for interactive charts).
- **Design**: 
  - **Left Sidebar**: Data controls (Upload, Columns, Metrics).
  - **Center Canvas**: Main workspace where reports (Sweetviz) and charts appear.
  - **Assistant Panel**: Chat interface where users give natural language commands.

#### **Backend (The "Brain")**
- **Tech Stack**: Python 3.10+, FastAPI, Uvicorn.
- **Core Logic**:
  - **`main.py`**: The API Gateway. Handles HTTP requests (Upload, Chat).
  - **`backend/core/intent.py`**: A rule-based NLP engine. It scans user queries for keywords (e.g., "eda" -> triggers Sweetviz, "stats" -> triggers Pandas) to decide *which* tool to call.
  - **`backend/services/analysis.py`**: The worker service. It wraps complex libraries (Sweetviz, Pandas) into simple function calls.

---

### 3. Key Workflows

#### **A. File Upload Workflow**
1. User clicks "Upload CSV" in Frontend.
2. Frontend sends `POST /upload` with the file.
3. Backend saves the file to `uploads/` folder with a UUID.
4. Backend immediately runs `df.describe()` (Pandas) to extract column names.
5. Backend returns column metadata to Frontend.
6. Frontend updates the "Fields" list in the sidebar.

#### **B. AI Analysis Workflow**
1. User types "Generate an EDA report" in the Assistant Panel.
2. Frontend sends `POST /chat` with the query string.
3. **Intent Engine** parses the string:
   - Detects "report" or "eda".
   - Returns intent: `sweetviz`.
4. **Analysis Service** executes:
   - Loads CSV from `uploads/`.
   - Runs `sweetviz.analyze(df)`.
   - Saves HTML report to `outputs/`.
   - Returns the URL (e.g., `/outputs/report.html`).
5. Frontend receives the URL and dynamically creates an `<iframe>` in the center canvas to display the full interactive report.

---

### 4. File Structure
```text
Data4Viz/
├── backend/
│   ├── core/
│   │   └── intent.py       # "Brain": Decides what analysis to run
│   └── services/
│       └── analysis.py     # "Hands": Runs Pandas/Sweetviz logic
├── frontend/               # UI Code (HTML/CSS/JS)
├── uploads/                # Raw CSV files storage
├── outputs/                # Generated HTML reports
├── main.py                 # FastAPI Server Entrypoint
├── run.bat                 # One-click Windows Launcher
└── requirements.txt        # Python dependencies
```

### 5. Why This Approach?
- **No Cloud/LLM Dependency**: Uses rule-based logic initially. Fast, free, and works offline.
- **Extensible**: The `AnalysisService` is designed to easily plug in new tools (e.g., AutoViz, Scikit-learn models) without changing the frontend.
- **Separation of Concerns**: The frontend handles display, while the backend handles heavy data processing.
