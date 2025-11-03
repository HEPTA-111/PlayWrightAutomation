@echo off
SETLOCAL EnableDelayedExpansion

echo ========================================
echo Playwright Automation Runner
echo ========================================
echo.

SET BASE=%~dp0

echo Checking environment...
echo Base directory: %BASE%
echo.

REM Check if portable node exists
if not exist "%BASE%portable-node\node.exe" (
    echo ERROR: portable-node\node.exe not found!
    echo Expected at: %BASE%portable-node\node.exe
    echo.
    pause
    exit /b 1
)

REM Check if dist folder exists
if not exist "%BASE%dist" (
    echo ERROR: dist\ folder not found!
    echo Expected at: %BASE%dist
    echo.
    pause
    exit /b 1
)

REM Check if my-browsers folder exists
if not exist "%BASE%my-browsers" (
    echo WARNING: my-browsers\ folder not found!
    echo Playwright may fail to launch browsers.
    echo Expected at: %BASE%my-browsers
    echo.
)

echo Environment check passed.
echo.
echo Starting Playwright tests...
echo Browser will be visible (headed mode)
echo.
echo ========================================
echo.

REM Set environment variable for headed mode (show browser)
SET PLAYWRIGHT_HEADED=true

REM Run the test
"%BASE%portable-node\node.exe" "%BASE%dist\run-my-test.js"

SET EXIT_CODE=%ERRORLEVEL%

echo.
echo ========================================
echo Test execution completed with code: %EXIT_CODE%
echo ========================================
echo.

if %EXIT_CODE% NEQ 0 (
    echo Tests failed or were interrupted.
    echo Check playwright_cli_debug.txt for details.
) else (
    echo Tests completed successfully!
)

echo.
echo Output files are in: %BASE%
echo.
pause
exit /b %EXIT_CODE%