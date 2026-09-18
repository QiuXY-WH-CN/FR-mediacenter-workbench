@echo off
chcp 65001 >nul
cd /d "%~dp0web"

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8766 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1
timeout /t 1 /nobreak >nul

start "fengru-server" /min node scripts/dev.mjs
start "fengru-tunnel" /min "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:8766 --no-autoupdate

timeout /t 5 /nobreak >nul
start http://127.0.0.1:8766/
echo.
echo Fengru workbench started.
echo Local: http://127.0.0.1:8766/
echo Public tunnel is shown in the minimized cloudflared window.
pause
