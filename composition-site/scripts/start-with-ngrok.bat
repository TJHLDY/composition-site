@echo off
setlocal
set "NGROK_AUTHTOKEN=%NGROK_AUTHTOKEN%"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-with-ngrok.ps1" -NgrokAuthtoken "%NGROK_AUTHTOKEN%" %*
pause
