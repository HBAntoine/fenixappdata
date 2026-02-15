@echo off
cd /d "%~dp0"

:: Lance le serveur Python en arriere-plan (invisible)
start /B pythonw -m http.server 8000 2>nul

:: Attend 3 secondes que le serveur demarre
ping -n 4 127.0.0.1 >nul

:: Ouvre le navigateur par defaut
start http://localhost:8000/index.html

:: Attend 10 secondes pour que le navigateur etablisse la connexion
ping -n 11 127.0.0.1 >nul

:: Surveille le port 8000 : tant qu'une connexion ESTABLISHED existe, le navigateur est ouvert
:boucle
netstat -ano | findstr ":8000.*ESTABLISHED" >nul 2>&1
if %errorlevel%==0 (
    ping -n 4 127.0.0.1 >nul
    goto boucle
)

:: Plus aucune connexion active = navigateur ferme, on tue le serveur
taskkill /F /IM pythonw.exe >nul 2>&1
exit
