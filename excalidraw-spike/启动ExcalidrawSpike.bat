@echo off
echo ===================================================
echo   Detective Map - Excalidraw Spike Local Dev Server
echo ===================================================
echo.

cd /d "%~dp0"

echo Starting Vite Dev Server on http://localhost:5173 ...
call ..\node\npm.cmd run dev

pause
