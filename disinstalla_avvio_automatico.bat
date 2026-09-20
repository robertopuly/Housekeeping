@echo off
title Rimozione Avvio Automatico - Housekeeping Hotel
echo ================================================================
echo   RIMOZIONE AVVIO AUTOMATICO SERVER
echo ================================================================
echo.
set "DST=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\HousekeepingServer.vbs"
if exist "%DST%" (
    del /f /q "%DST%"
    echo [OK] Avvio automatico rimosso con successo!
) else (
    echo [INFO] Nessun avvio automatico trovato.
)
echo.
pause
