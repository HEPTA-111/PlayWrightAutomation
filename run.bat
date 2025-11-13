@echo off
SETLOCAL
TITLE Playwright Automation Runner
COLOR 0A

SET BASE=%~dp0

echo ========================================
echo   Playwright Automation Runner
echo ========================================
echo.
echo Starting launcher...
echo.

REM --- BEGIN FIX: Set Browser Path Environment Variable ---
SET "PLAYWRIGHT_BROWSERS_PATH=%BASE%my-browsers"
echo [RUN.BAT] Set PLAYWRIGHT_BROWSERS_PATH to: %PLAYWRIGHT_BROWSERS_PATH%
REM --- END FIX ---

REM Use bundled portable node to run launcher
"%BASE%portable-node\node.exe" "%BASE%launcher.js"

IF ERRORLEVEL 1 (
    echo.
    echo ========================================
    echo   ERROR: Launcher failed
    echo ========================================
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Execution completed
echo ========================================
pause