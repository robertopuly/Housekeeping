@echo off
title Avvio Automatico - Housekeeping Hotel
echo ================================================================
echo   INSTALLAZIONE AVVIO AUTOMATICO SERVER (Windows 11)
echo ================================================================
echo.
set "SRC=C:\Progetti\Housekeeping\start_silenzioso.vbs"
set "DST=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\HousekeepingServer.vbs"
copy /y "%SRC%" "%DST%" >nul
if %errorlevel% equ 0 (
    echo [OK] Configurazione completata!
    echo.
    echo Il server si avviera in background in modo completamente
    echo invisibile e automatico ad ogni accensione del PC.
    echo I tablet e il PC saranno sempre connessi.
) else (
    echo [ERRORE] Impossibile copiare il file nella cartella Startup.
)
echo.
pause
