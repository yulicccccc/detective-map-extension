@echo off
echo ===================================================
echo   DetectiveMap V2.0 - Auto Deploy to Cloudflare Worker
echo   Domain: https://detectivemap.qchen9108.workers.dev
echo ===================================================
echo.

cd /d "%~dp0"

echo [1/3] Bundling latest assets...
call node scripts\bundle-assets.js
call node scripts\build-public.js

echo.
echo [2/3] Connecting to Cloudflare...
set CLOUDFLARE_ACCOUNT_ID=c7507f82f5078e81f58c2fcc1e7bfbdb

echo [3/3] Deploying Worker and Durable Objects with Workers AI...
call npx --yes wrangler@3 deploy

echo.
echo ===================================================
echo   Deployment finished! 
echo   Live URL: https://detectivemap.qchen9108.workers.dev
echo ===================================================
pause
