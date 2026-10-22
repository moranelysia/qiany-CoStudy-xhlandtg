@echo off
chcp 65001 >nul
rem check-all.cmd - wrapper so users can double-click.
rem
rem Windows blocks .ps1 by default ("running scripts is disabled"),
rem so we pass -ExecutionPolicy Bypass for THIS process only.
rem
rem Keep this file ASCII-only: cmd.exe reads batch files in the OEM
rem code page, and non-ASCII text here can be split into bogus commands.
setlocal
set "PS=%ProgramFiles%\PowerShell\7\pwsh.exe"
if not exist "%PS%" set "PS=powershell"
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-all.ps1"
exit /b %ERRORLEVEL%