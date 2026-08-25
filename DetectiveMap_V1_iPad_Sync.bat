@echo off
title Detective Map - iPad Zero-Admin Sync Server
cd /d "%~dp0"
echo ===================================================
echo   Detective Map - iPad LAN Sync Server (Zero Admin)
echo ===================================================
echo.
echo Starting server on port 3000...
echo.
node server.js
pause
