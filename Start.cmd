@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start.ps1" %*
set "START_EXIT=%errorlevel%"
if not "%START_EXIT%"=="0" pause
exit /b %START_EXIT%
