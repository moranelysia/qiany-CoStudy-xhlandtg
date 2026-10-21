@echo off
REM Launch the built app (clears ELECTRON_RUN_AS_NODE which forces Node mode).
setlocal
set "ELECTRON_RUN_AS_NODE="
set "NODE_OPTIONS="
"%~dp0node_modules\electron\dist\electron.exe" "%~dp0" %*
exit /b %ERRORLEVEL%
