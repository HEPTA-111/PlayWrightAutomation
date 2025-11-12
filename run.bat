@echo off
SETLOCAL
SET BASE=%~dp0
REM If launcher.js exists in bundle, run it; otherwise fall back to dist\run-my-test.js
IF EXIST "%~dp0launcher.js" (
  "%BASE%portable-node\node.exe" "%~dp0launcher.js"
) ELSE (
  "%BASE%portable-node\node.exe" "%BASE%dist\run-my-test.js"
)
pause
