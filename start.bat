@echo off
chcp 65001 >nul
title Housekeeping Hotel - Server
color 0B

echo ==========================================================
echo        HOUSEKEEPING HOTEL - AVVIO APPLICAZIONE
echo =========================================================
echo

:: Controllo installazione Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRORE] Node.js non trovato!
    echo Per favore installa Node.js da https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Controllo presenza node_modules
if not exist "node_modules\" (
    echo [INFO] Installazione dipendenze in corso...
    call npm install --strict-ssl=false
    if %errorlevel% neq 0 (
        echo [ERRORE] Errore durante l'installazione delle dipendenze.
        pause
        exit /b 1
    )
    echo [OK] Dipendenze installate con successo!
    echo.
)

:: Avvio del server
echo [INFO] Avvio server su porta 8765...
echo.
node server.js

pause
