@echo off
echo ===================================================
echo   DetectiveMap - Auto Deploy to Cloudflare Pages
echo ===================================================
echo.

cd /d "%~dp0"

echo [1/2] Connecting to Cloudflare...
set CLOUDFLARE_ACCOUNT_ID=c7507f82f5078e81f58c2fcc1e7bfbdb

:: Run wrangler v3 deploy (compatible with Node v20)
call npx --yes wrangler@3 pages deploy public --project-name detectivemap --branch main

echo.
echo ===================================================
echo   Deployment finished! 
echo ===================================================
pause
