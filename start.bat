@echo off
rem Double-click this file to start the budget tracker on Windows.
title Budget Tracker

rem Work from the folder this file is in, wherever it was launched from.
cd /d "%~dp0"

rem 1. Node.js must be installed.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Download the LTS version from https://nodejs.org, install it, then try again.
  pause
  exit /b 1
)

rem 2. First run only: download the libraries the app uses.
if not exist node_modules (
  echo First run: installing. This takes a minute...
  call npm install
  if errorlevel 1 (
    echo.
    echo Install failed. Read the messages above.
    pause
    exit /b 1
  )
)

rem 3. Start the app and open it in your browser.
rem    Keep this window open while you use it. Close it to stop the app.
set OPEN_BROWSER=1
call npm start

rem If the app stopped with an error, keep the window open so you can read it.
pause
