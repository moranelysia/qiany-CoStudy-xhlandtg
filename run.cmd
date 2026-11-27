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
  echo     Run:  pnpm run build
  exit /b 1
)
if not exist "%EXE%" (
  echo [x] Electron not found: %EXE%
  echo     Run:  pnpm exec install-electron
  exit /b 1
)

REM Any argument means "run attached" (tests need stdout and the exit code).
REM
REM Do NOT put the attached branch inside a parenthesised block:
REM   if not "%~1"=="" (
REM     "%EXE%" "%APP_DIR%" %*
REM     exit /b %ERRORLEVEL%
REM   )
REM cmd.exe expands %ERRORLEVEL% when it PARSES the whole block, i.e. before
REM electron has run, so it always reports 0 -- every failing self-test then
REM looks green (check-all was silently all-green because of this).
REM Keep this file ASCII-only: cmd.exe reads batch files in the OEM code page.
if "%~1"=="" goto :detached
"%EXE%" "%APP_DIR%" %*
exit /b %ERRORLEVEL%

:detached
REM No arguments: launch detached and get out of the way immediately.
start "" "%EXE%" "%APP_DIR%"
exit /b 0
