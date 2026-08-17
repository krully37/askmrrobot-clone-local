@echo off
setlocal
cd /d "%~dp0"
:: Always read SIMC_PATH from user registry so Explorer's stale env doesn't win
for /f "usebackq tokens=*" %%V in (`powershell -NoProfile -Command "[System.Environment]::GetEnvironmentVariable('SIMC_PATH','User')"`) do set SIMC_PATH=%%V
start "Local Sim Dashboard" http://127.0.0.1:5173
call npm run dev
