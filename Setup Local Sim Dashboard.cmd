@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Local Sim Dashboard - Setup
cd /d "%~dp0"

echo.
echo =============================================================
echo                  LOCAL SIM DASHBOARD SETUP
echo =============================================================
echo This runs only on your computer. It does not scan your files
echo or send your character data anywhere.
echo.

where node >nul 2>nul
if errorlevel 1 goto :missing_node
where npm >nul 2>nul
if errorlevel 1 goto :missing_node

if not exist "node_modules" (
  echo First-time setup: installing the dashboard's required files...
  echo This can take a few minutes and uses your internet connection once.
  call npm install
  if errorlevel 1 goto :install_failed
)

:: Use an existing saved choice first. This does not search the PC.
for /f "usebackq tokens=*" %%V in (`powershell -NoProfile -Command "[System.Environment]::GetEnvironmentVariable('SIMC_PATH','User')"`) do set "SIMC_PATH=%%V"
if defined SIMC_PATH if exist "%SIMC_PATH%" goto :start

echo.
echo SimulationCraft needs to be selected once before the dashboard can run sims.
echo A normal Windows file picker will open. Select the file named simc.exe.
echo Nothing else on your computer will be searched or changed.
echo.
for /f "usebackq delims=" %%V in (`powershell -NoProfile -STA -Command "Add-Type -AssemblyName System.Windows.Forms; $picker=New-Object System.Windows.Forms.OpenFileDialog; $picker.Title='Select SimulationCraft simc.exe'; $picker.Filter='SimulationCraft (simc.exe)|simc.exe|Programs (*.exe)|*.exe'; if($picker.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){[Console]::Write($picker.FileName)}"`) do set "SIMC_PATH=%%V"

if not defined SIMC_PATH goto :no_simc
if not exist "%SIMC_PATH%" goto :no_simc

setx SIMC_PATH "%SIMC_PATH%" >nul
echo Saved your SimulationCraft location for future launches.

:start
echo.
echo Starting Local Sim Dashboard...
echo Keep this window open while you use the dashboard.
start "Local Sim Dashboard" http://127.0.0.1:5173
call npm run dev
goto :end

:missing_node
echo.
echo Node.js is not installed yet.
echo Download and install the LTS version from https://nodejs.org/en/download
echo Then run this file again.
goto :end

:install_failed
echo.
echo Setup could not finish installing the dashboard files.
echo Check that you are connected to the internet, then run this file again.
goto :end

:no_simc
echo.
echo No usable simc.exe was selected, so the dashboard was not started.
echo Download and extract SimulationCraft first, then run this file again.
echo https://www.simulationcraft.org/download.html

:end
echo.
pause
