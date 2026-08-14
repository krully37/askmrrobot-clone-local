@echo off
setlocal
cd /d "%~dp0"
start "Local Sim Dashboard" http://127.0.0.1:5173
call npm run dev
