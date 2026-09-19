@echo off
setlocal
cd /d "%~dp0"
title AI Research OS - Frontend

echo ===================================================
echo   AI Research OS - Frontend Startup
echo ===================================================
echo.

if not exist "frontend" (
    echo [ERROR] 'frontend' directory not found!
    echo Please make sure you are running this from the project root directory.
    pause
    exit /b 1
)

cd frontend

echo [1/2] Installing frontend dependencies...
call npm install
if errorlevel 1 (
    echo [WARN] npm install encountered warnings or issues. Proceeding...
)
echo.

echo [2/2] Starting Next.js frontend dev server on http://localhost:3000 ...
call npm run dev

if errorlevel 1 (
    echo.
    echo [ERROR] Frontend server stopped with an error.
    pause
)
