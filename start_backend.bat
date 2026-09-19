@echo off
setlocal
cd /d "%~dp0"
title AI Research OS - Backend

echo ===================================================
echo   AI Research OS - Backend Startup
echo ===================================================
echo.

:: 1. Start Qdrant in Docker (if Docker is available)
echo [1/3] Checking Qdrant Vector Database...
curl.exe -s --max-time 2 http://localhost:6333/healthz >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Qdrant is already running at http://localhost:6333
) else (
    echo Starting Qdrant container...
    docker start qdrant >nul 2>&1
    if errorlevel 1 (
        docker run -d -p 6333:6333 --name qdrant qdrant/qdrant >nul 2>&1
        if errorlevel 1 (
            echo [WARN] Could not start Qdrant via Docker.
            echo        Backend will automatically fall back to in-memory vector search.
        ) else (
            echo [OK] Qdrant started in Docker container on port 6333.
        )
    ) else (
        echo [OK] Existing Qdrant container started on port 6333.
    )
)
echo.

:: 2. Setup & Activate Virtual Environment
echo [2/3] Activating Python Virtual Environment...
if not exist "venv\Scripts\activate.bat" (
    echo Virtual environment not found. Creating 'venv' and installing dependencies...
    python -m venv venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment with Python.
        echo Please ensure Python 3.10+ is installed and added to PATH.
        pause
        exit /b 1
    )
    call .\venv\Scripts\activate.bat
    echo Installing dependencies (first-time setup)...
    pip install -r requirements.txt
) else (
    call .\venv\Scripts\activate.bat
)
echo.

:: 3. Launch Backend
echo [3/3] Starting FastAPI backend on http://localhost:8000 ...
python run_backend.py

if errorlevel 1 (
    echo.
    echo [ERROR] Backend process exited unexpectedly.
    pause
)
