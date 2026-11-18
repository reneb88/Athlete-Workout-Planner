@echo off
cd /d "%~dp0"
call npm install
call npm run build
echo Updated. You can start Ropeworks again.
pause
