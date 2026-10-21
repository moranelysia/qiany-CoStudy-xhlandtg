@echo off
REM ============================================================
REM  costudy dev helper
REM  Adds the bundled Node + a pnpm shim to PATH, then runs a script.
REM  Usage:  dev.cmd <script>   e.g.  dev.cmd build
REM ============================================================
setlocal

set "NODE_DIR=C:\Users\Lenovo\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin"
set "PNPM_JS=C:\Users\Lenovo\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs"
set "SHIM_DIR=%~dp0.tools"
set "PNPM_HOME=%SHIM_DIR%"

if not exist "%NODE_DIR%\node.exe" (
  echo [x] Node not found at %NODE_DIR%
  exit /b 1
)

set "PATH=%SHIM_DIR%;%NODE_DIR%;%PATH%"

if "%1"=="" (
  echo Usage: dev.cmd ^<script^>   ^(dev / build / typecheck / preview^)
  exit /b 0
)

if "%1"=="dev" (
  node "%PNPM_JS%" run dev
) else if "%1"=="build" (
  node "%PNPM_JS%" run build
) else if "%1"=="typecheck" (
  node "%PNPM_JS%" run typecheck
) else if "%1"=="preview" (
  node "%PNPM_JS%" run preview
) else (
  node "%PNPM_JS%" run %1
)

exit /b %ERRORLEVEL%
