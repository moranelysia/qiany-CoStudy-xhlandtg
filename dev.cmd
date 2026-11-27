@echo off
setlocal

if "%~1"=="" (
  echo Usage: dev.cmd ^<script^> [args]
  echo Scripts: dev, build, typecheck, preview
  exit /b 0
)

where pnpm.cmd >nul 2>&1
if errorlevel 1 (
  echo [x] pnpm is not on PATH. Install pnpm and open a new terminal.
  exit /b 1
)

pushd "%~dp0" || exit /b 1
call pnpm.cmd run %*
set "DEV_EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %DEV_EXIT_CODE%
