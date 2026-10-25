@echo off
REM ============================================================
REM  Launch the built app.
REM
REM  Two modes:
REM    run.cmd                 -> start detached; this console closes at once
REM    run.cmd --smoke [...]   -> run attached so stdout/stderr are visible
REM
REM  Why the detached branch:
REM    cmd.exe waits for its child to exit. A plain call therefore leaves a
REM    black console window sitting behind the app the whole time.
REM    `start` returns immediately, so the console disappears right after.
REM
REM  - clears ELECTRON_RUN_AS_NODE (it forces Node mode, where
REM    require('electron') returns a path string instead of the API)
REM  - passes the app DIRECTORY so Electron reads package.json
REM    (app.getName(), version, main all come from there).
REM    NOTE: "%~dp0" ends with a backslash which escapes the closing
REM    quote, so we append "." -> "%~dp0." to get a clean path.
REM ============================================================
setlocal
set "ELECTRON_RUN_AS_NODE="
set "NODE_OPTIONS="

set "APP_DIR=%~dp0."
set "ENTRY=%~dp0out\main\index.js"
set "EXE=%~dp0node_modules\electron\dist\electron.exe"

if not exist "%ENTRY%" (
  echo [x] Entry not found: %ENTRY%
  echo     Run:  dev.cmd build
  exit /b 1
)
if not exist "%EXE%" (
  echo [x] Electron not found: %EXE%
  exit /b 1
)

REM Any argument means "run attached" (tests need stdout and the exit code).
if not "%~1"=="" (
  "%EXE%" "%APP_DIR%" %*
  exit /b %ERRORLEVEL%
)

REM No arguments: launch detached and get out of the way immediately.
start "" "%EXE%" "%APP_DIR%"
exit /b 0
