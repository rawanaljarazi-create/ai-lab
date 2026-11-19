@echo off
cd /d "%~dp0"
where py >nul 2>&1 && py -3 "%~dp0ios16-touch.py" && exit /b %ERRORLEVEL%
python "%~dp0ios16-touch.py"
exit /b %ERRORLEVEL%
