@echo off
setlocal
cd /d "%~dp0"
title AI Research OS - Launcher

echo ===================================================
echo   AI Research OS - Starting Full Application
echo ===================================================
echo.
echo [1/2] Launching Backend (FastAPI + Qdrant Docker)...
start "AI Research OS - Backend" cmd /k ""%~dp0start_backend.bat""

echo [2/2] Launching Frontend (Next.js)...
start "AI Research OS - Frontend" cmd /k ""%~dp0start_frontend.bat""

echo.
echo ===================================================
echo Both services are starting in separate windows!
echo   - Backend API: http://localhost:8000
echo   - API Docs:    http://localhost:8000/docs
echo   - Frontend:    http://localhost:3000
echo   - Qdrant DB:   http://localhost:6333/dashboard
echo ===================================================
echo.
echo You can keep this launcher window or close it.
timeout /t 5
