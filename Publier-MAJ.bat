@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

echo ======================================================================
echo   PUBLICATION MISE A JOUR - FENIX HANDBALL APP
echo ======================================================================
echo.

:: -------------------------------------------------------
:: ETAPE 1 : Generer data.js depuis Events.csv
:: -------------------------------------------------------
echo [1/4] Generation de data.js depuis Events.csv...
echo.

python "%~dp0generer-data-js.py"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERREUR : La generation de data.js a echoue !
    echo Verifiez que Events.csv existe et que Python est installe.
    echo.
    if "%1"=="" pause
    exit /b 1
)

:: -------------------------------------------------------
:: ETAPE 2 : Generer photos-index.js depuis Effectifs/
:: -------------------------------------------------------
echo.
echo [2/4] Generation de photos-index.js depuis Effectifs/...
echo.

python "%~dp0generer-index.py"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERREUR : La generation de photos-index.js a echoue !
    echo.
    if "%1"=="" pause
    exit /b 1
)

:: -------------------------------------------------------
:: ETAPE 3 : Git add + commit
:: -------------------------------------------------------
echo.
echo [3/4] Commit des modifications...
echo.

cd /d "%~dp0"

:: Verifier que git est disponible
git --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERREUR : Git n'est pas installe ou pas dans le PATH !
    echo Installez Git depuis https://git-scm.com
    echo.
    if "%1"=="" pause
    exit /b 1
)

:: Verifier qu'on est dans un repo git
git rev-parse --is-inside-work-tree >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERREUR : Ce dossier n'est pas un repo Git !
    echo Executez d'abord : git init ^&^& git remote add origin VOTRE_URL_GITHUB
    echo.
    if "%1"=="" pause
    exit /b 1
)

:: Ajouter les fichiers generes + les photos
git add data.js photos-index.js Effectifs/

:: Verifier s'il y a des changements
git diff --cached --quiet 2>nul
if %ERRORLEVEL% EQU 0 (
    echo   Aucun changement detecte - rien a publier.
    echo   Les donnees sont deja a jour !
    echo.
    if "%1"=="" pause
    exit /b 0
)

:: Generer le message de commit avec date
for /f "tokens=1-3 delims=/" %%a in ('date /t') do set DATEJOUR=%%a/%%b/%%c
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set HEURE=%%a:%%b

git commit -m "MAJ donnees %DATEJOUR% %HEURE%"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERREUR : Le commit a echoue !
    echo.
    if "%1"=="" pause
    exit /b 1
)

:: -------------------------------------------------------
:: ETAPE 4 : Push vers GitHub
:: -------------------------------------------------------
echo.
echo [4/4] Push vers GitHub...
echo.

git push
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERREUR : Le push a echoue !
    echo Verifiez votre connexion internet et vos identifiants GitHub.
    echo.
    echo Essayez manuellement : git push -u origin main
    echo.
    if "%1"=="" pause
    exit /b 1
)

:: -------------------------------------------------------
:: TERMINE !
:: -------------------------------------------------------
echo.
echo ======================================================================
echo   PUBLICATION REUSSIE !
echo ======================================================================
echo.
echo   data.js          : mis a jour
echo   photos-index.js  : mis a jour
echo   GitHub           : push effectue
echo.
echo   Netlify va redeployer automatiquement dans ~30 secondes.
echo   URL : https://fenixappdata.netlify.app
echo.
echo ======================================================================
echo.
if "%1"=="" pause
