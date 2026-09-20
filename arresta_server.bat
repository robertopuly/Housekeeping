@echo off
title Arresto Server Housekeeping
echo ================================================================
echo   ARRESTO SERVER HOUSEKEEPING (Porta 8765)
echo ================================================================
echo.
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8765" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
    echo Processo %%a terminato.
)
echo.
echo [OK] Server arrestato.
pause
