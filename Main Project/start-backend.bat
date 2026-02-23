@echo off
REM Start Data4Viz Backend API on port 3001
REM Run this from the project root directory

echo.
echo ========================================
echo  Data4Viz Backend Startup Script
echo ========================================
echo.

REM Change to backend directory
cd backend

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found in PATH
    echo Please install Python or add it to PATH
    pause
    exit /b 1
)

echo Checking Python version...
python --version

echo.
echo Checking for uvicorn...
python -m pip list | findstr uvicorn >nul 2>&1
if errorlevel 1 (
    echo WARNING: uvicorn not found
    echo Installing dependencies from requirements.txt...
    python -m pip install -r requirements.txt
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

echo.
echo ========================================
echo Starting Backend API on port 3001...
echo ========================================
echo.
echo Backend will be available at:
echo   - API: http://localhost:3001
echo   - Swagger UI: http://localhost:3001/docs
echo   - ReDoc: http://localhost:3001/redoc
echo.
echo Press Ctrl+C to stop the server
echo.

python -m uvicorn app.main:app --host 0.0.0.0 --port 3001 --reload

if errorlevel 1 (
    echo.
    echo ERROR: Backend failed to start
    echo Check the error message above for details
    pause
    exit /b 1
)
