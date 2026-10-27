@echo off
cd /d "%~dp0"
echo ========================================================
echo   Starting VetLink Clinical Support System
echo ========================================================
echo.
echo [1/2] Starting Python FastAPI Backend on port 8000...
start "VetLink AI Backend (Port 8000)" cmd /k "python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload"

echo [2/2] Starting Vite Frontend on port 5173...
start "VetLink PWA Frontend (Port 5173)" cmd /k "npm run dev -- --host"

echo.
echo All services launched!
echo Access VetLink at: http://localhost:5173/
echo Network Access:    http://192.168.1.9:5173/
echo API Docs at:       http://localhost:8000/docs
echo ========================================================
timeout /t 3 > nul
