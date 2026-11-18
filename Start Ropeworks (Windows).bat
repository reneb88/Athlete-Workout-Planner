@echo off
title Ropeworks Training Studio
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed yet.
  echo  Your browser will open the download page. Install the "LTS" version,
  echo  then double-click this file again.
  start "" https://nodejs.org/en/download
  pause
  exit /b
)
if not exist node_modules (
  echo Installing for the first time - this takes a minute...
  call npm install
)
(
  call npm run build
)
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3001"
node --disable-warning=ExperimentalWarning server/index.js
pause
