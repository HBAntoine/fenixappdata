@echo off
REM ========================================================================
REM Script de génération des index de photos pour la webapp handball
REM ========================================================================
REM 
REM UTILISATION : Double-cliquez sur ce fichier
REM 
REM Ce script va :
REM   1. Vérifier que Python est installé
REM   2. Scanner tous les dossiers d'équipes dans Effectifs/
REM   3. Générer un index.json pour chaque équipe
REM 
REM ========================================================================

echo.
echo ========================================================================
echo     WEBAPP HANDBALL - Generation des index de photos
echo ========================================================================
echo.

REM Vérifier que Python est installé
python --version >nul 2>&1
if errorlevel 1 (
    echo ERREUR : Python n'est pas installe !
    echo.
    echo Veuillez installer Python depuis https://www.python.org/downloads/
    echo IMPORTANT : Cochez "Add Python to PATH" pendant l'installation
    echo.
    pause
    exit /b 1
)

echo Python detecte : 
python --version
echo.

REM Exécuter le script Python
echo Execution du script de generation...
echo.
python "%~dp0generer-index.py"

REM Le script Python gère déjà la pause à la fin
exit /b 0
