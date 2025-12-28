@echo off
setlocal enabledelayedexpansion

:: ========================================================
::   Data4Viz AI Workbench - One-Click Launcher
:: ========================================================
echo.
echo ========================================================
echo   Starting Data4Viz AI Workbench...
echo ========================================================
echo.

:: 1. Check/Create Virtual Environment
if not exist "venv" (
    echo [Setup] Virtual environment not found. Creating 'venv'...
    python -m venv venv
    if !errorlevel! neq 0 (
        echo [Error] Failed to create virtual environment. Do you have Python installed?
        pause
        exit /b
    )
    echo [Setup] 'venv' created successfully.
)

:: 2. Activate Virtual Environment
echo [Setup] Activating virtual environment...
call venv\Scripts\activate.bat
if !errorlevel! neq 0 (
    echo [Error] Failed to activate virtual environment.
    pause
    exit /b
)

:: 3. Install Dependencies
echo [Setup] Checking and installing dependencies...
pip install -r requirements.txt
if !errorlevel! neq 0 (
    echo [Warning] Some dependencies failed to install. Trying to proceed...
) else (
    echo [Setup] Dependencies are ready.
)

:: 4. Start the Application
echo.
echo ========================================================
echo   LAUNCHING APP...
echo   Open your browser at: http://localhost:8000/
echo   Press Ctrl+C to stop the server.
echo ========================================================
echo.

python main.py

if !errorlevel! neq 0 (
    echo.
    echo [Error] The application crashed or stopped unexpectedly.
    pause
)
