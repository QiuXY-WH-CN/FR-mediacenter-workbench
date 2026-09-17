@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto missing
node scripts/dev.mjs --lan
pause
exit /b
:missing
echo Please install Node.js 24 and retry.
pause
