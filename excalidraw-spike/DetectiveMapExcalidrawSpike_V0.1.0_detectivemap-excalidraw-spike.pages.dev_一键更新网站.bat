@echo off
echo ===================================================
echo   DetectiveMapExcalidrawSpike - Auto Deploy to Cloudflare
echo   Domain: https://detectivemap-excalidraw-spike.pages.dev
echo ===================================================
echo.

cd /d "%~dp0"

:: Check if portable node exists
if not exist "..\node\node.exe" (
    echo [ERROR] Portable Node.js not found.
    pause
    exit /b 1
)

echo [1/3] Building Excalidraw Spike bundle...
set PATH=%~dp0..\node;%PATH%
call ..\node\npm.cmd run build

echo.
echo [2/3] Setting Cloudflare Account...
set CLOUDFLARE_ACCOUNT_ID=c7507f82f5078e81f58c2fcc1e7bfbdb

echo.
echo [3/3] Deploying to Cloudflare Pages...
call ..\node\npx.cmd --yes wrangler@3 pages deploy dist --project-name detectivemap-excalidraw-spike

echo.
echo ===================================================
echo   Deployment finished! 
echo   Live URL: https://detectivemap-excalidraw-spike.pages.dev
echo ===================================================
pause
