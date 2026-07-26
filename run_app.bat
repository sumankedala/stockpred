@echo off
title QuantPred Pro Launcher
echo Starting QuantPred Pro platform...
echo ====================================
echo.

:: Launch FastAPI Backend Server
echo [1/2] Launching Python FastAPI Server (Port 8081)...
start "QuantPred API Backend" cmd /c "python -m uvicorn main:app --host 0.0.0.0 --port 8081 --reload"

:: Launch Vite React Frontend Server
echo [2/2] Launching Vite React Dev Server (Port 5173)...
cd frontend
start "QuantPred React Frontend" cmd /c "npm run dev"

echo.
echo ====================================
echo Platform successfully launched.
echo Backend API:  http://localhost:8081
echo Frontend App:  http://localhost:5173
echo.
echo Press any key to exit this launcher (processes will keep running in the background)...
echo ====================================
pause > null
del null
