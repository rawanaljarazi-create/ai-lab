@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-windows.ps1"
echo.
if errorlevel 1 (
  echo Setup failed.
) else (
  echo Setup finished.
)
pause
