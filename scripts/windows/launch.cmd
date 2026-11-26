@echo off
setlocal
set "ELECTRON_RUN_AS_NODE="
set "APP_DIR=%~dp0app"
start "" /d "%APP_DIR%" "%~dp0electron\electron.exe" "%APP_DIR%"
