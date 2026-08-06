# AI Research OS — Single-command startup script
# Starts both FastAPI backend and Next.js frontend in parallel
# Usage: .\start.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AI Research OS — Starting Services   " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- Validate .env ---
$envFile = Join-Path $PSScriptRoot ".env"
if (-Not (Test-Path $envFile)) {
    Write-Host "[WARN] No .env file found. Copy .env.example and fill in GROQ_API_KEY." -ForegroundColor Yellow
} else {
    $envContent = Get-Content $envFile -Raw
    if (-Not ($envContent -match "GROQ_API_KEY\s*=\s*.+")) {
        Write-Host "[WARN] GROQ_API_KEY is not set in .env. Chat will fall back to local Ollama." -ForegroundColor Yellow
    } else {
        Write-Host "[OK] GROQ_API_KEY detected in .env" -ForegroundColor Green
    }
}

# --- Check Ollama ---
Write-Host ""
try {
    $ollamaCheck = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 3 -ErrorAction Stop
    $models = ($ollamaCheck.models | ForEach-Object { $_.name }) -join ", "
    Write-Host "[OK] Ollama running — available models: $models" -ForegroundColor Green
} catch {
    Write-Host "[WARN] Ollama not detected at localhost:11434. Local LLM fallback won't work." -ForegroundColor Yellow
    Write-Host "       Run: ollama serve" -ForegroundColor DarkGray
}

# --- Check Qdrant ---
try {
    $qdrantCheck = Invoke-RestMethod -Uri "http://localhost:6333/healthz" -TimeoutSec 3 -ErrorAction Stop
    Write-Host "[OK] Qdrant vector store running" -ForegroundColor Green
} catch {
    Write-Host "[WARN] Qdrant not detected at localhost:6333. Vector search will use in-memory fallback." -ForegroundColor Yellow
    Write-Host "       Run: docker run -p 6333:6333 qdrant/qdrant" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Starting Backend (FastAPI) ..." -ForegroundColor Blue
$backendJob = Start-Job -ScriptBlock {
    Set-Location $using:PSScriptRoot
    & ".\venv\Scripts\python.exe" "run_backend.py"
}

Start-Sleep -Seconds 2

Write-Host "Starting Frontend (Next.js) ..." -ForegroundColor Blue
$frontendJob = Start-Job -ScriptBlock {
    Set-Location (Join-Path $using:PSScriptRoot "frontend")
    & "npm" "run" "dev"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Services Started!" -ForegroundColor Green  
Write-Host "  Backend:  http://localhost:8000" -ForegroundColor Cyan
Write-Host "  Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "  API Docs: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop both services." -ForegroundColor DarkGray
Write-Host ""

# Stream output from both jobs
try {
    while ($true) {
        $backendJob | Receive-Job | ForEach-Object { Write-Host "[Backend] $_" -ForegroundColor DarkCyan }
        $frontendJob | Receive-Job | ForEach-Object { Write-Host "[Frontend] $_" -ForegroundColor DarkYellow }
        Start-Sleep -Milliseconds 500
    }
} finally {
    Write-Host "" 
    Write-Host "Shutting down..." -ForegroundColor Red
    Stop-Job $backendJob, $frontendJob -ErrorAction SilentlyContinue
    Remove-Job $backendJob, $frontendJob -ErrorAction SilentlyContinue
    Write-Host "Done." -ForegroundColor DarkGray
}
