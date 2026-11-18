@echo off
title Update Ropeworks
rem Downloads the latest Ropeworks Training Studio and installs it over this folder.
rem Your data (data\ropeworks.db) and your own seed.xlsx are never touched.

rem This file replaces itself during the update, so run a temporary copy of it instead.
if not "%~1"=="--from-temp" (
  copy /y "%~f0" "%TEMP%\ropeworks-updater.bat" >nul
  "%TEMP%\ropeworks-updater.bat" --from-temp "%~dp0"
)
cd /d "%~2"

echo.
echo  Updating Ropeworks Training Studio
echo  ----------------------------------
echo  Make sure the black Ropeworks window is CLOSED first. Your data is kept.
echo.
pause

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and try again.
  pause
  exit /b 1
)

set "RW_ZIP=%TEMP%\ropeworks-update.zip"
set "RW_DIR=%TEMP%\ropeworks-update"
set "RW_URL=https://github.com/reneb88/Athlete-Workout-Planner/archive/refs/heads/claude/ropeworks-training-studio-8u6hki.zip"

echo [1/3] Downloading the latest version...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri $env:RW_URL -OutFile $env:RW_ZIP; if (Test-Path $env:RW_DIR) { Remove-Item -Recurse -Force $env:RW_DIR }; Expand-Archive -Path $env:RW_ZIP -DestinationPath $env:RW_DIR"
if errorlevel 1 (
  echo.
  echo Download failed. Check the internet connection and try again.
  pause
  exit /b 1
)

set "RW_SRC="
for /d %%D in ("%RW_DIR%\*") do set "RW_SRC=%%D"
if not defined RW_SRC (
  echo The download looks empty. Try again later.
  pause
  exit /b 1
)

echo [2/3] Copying the new files (your data is kept)...
robocopy "%RW_SRC%" "%CD%" /E /NFL /NDL /NJH /NJS /NP /XF ropeworks.db ropeworks.db-wal ropeworks.db-shm seed.xlsx >nul
if %ERRORLEVEL% GEQ 8 (
  echo Copying the files failed. Is a Ropeworks window still open? Close it and try again.
  pause
  exit /b 1
)

echo [3/3] Installing - this takes a minute...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo Installing failed. Take a photo of this window and send it to Claude.
  pause
  exit /b 1
)
call npm run build
if errorlevel 1 (
  echo.
  echo Building failed. Take a photo of this window and send it to Claude.
  pause
  exit /b 1
)

echo.
echo  Updated! Double-click "Start Ropeworks (Windows)" to start.
echo.
pause
exit /b 0
