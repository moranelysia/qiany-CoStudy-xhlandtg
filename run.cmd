@echo off
REM ============================================================
REM  Launch the built app.
REM  - clears ELECTRON_RUN_AS_NODE (it forces Node mode, where
REM    require('electron') returns a path string instead of the API)
REM  - passes the app DIRECTORY so Electron reads package.json
REM    (app.getName(), version, main all come from there).
REM    NOTE: "%~dp0" ends with a backslash which escapes the closing
REM    quote, so we append "." -> "%~dp0." to get a clean path.
REM  Usage:  run.cmd [--smoke]
REM ============================================================
setlocal
set "ELECTRON_RUN_AS_NODE="
set "NODE_OPTIONS="

set "APP_DIR=%~dp0."
set "ENTRY=%~dp0out\main\index.js"

if not exist "%ENTRY%" (
  echo [x] Entry not found: %ENTRY%
  echo     Run:  dev.cmd build
  exit /b 1
)

"%~dp0node_modules\electron\dist\electron.exe" "%APP_DIR%" %*
exit /b %ERRORLEVEL%
