@echo off
chcp 65001 >nul
title CanCut - Subir a GitHub
cd /d "%~dp0"
setlocal

where git >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERROR] Git no esta instalado. Descargalo de https://git-scm.com/download/win
  echo         Instalalo, cierra esta ventana y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)

echo.
echo  ================================================
echo     CanCut  -  Subir el proyecto a GitHub
echo  ================================================
echo.
echo  1. Crea un repositorio VACIO en https://github.com/new
echo     (por ejemplo: cancut, sin README ni licencia)
echo  2. Copia su URL. Ejemplo: https://github.com/TU_USUARIO/cancut.git
echo.
set "REPO="
set /p "REPO=Pega aqui la URL del repositorio y presiona Enter: "
if "%REPO%"=="" (
  echo No escribiste ninguna URL.
  pause
  exit /b 1
)

if not exist ".git" (
  git init
)

git config user.name >nul 2>nul
if errorlevel 1 (
  set /p "GITNAME=Tu nombre para Git: "
  call git config user.name "%%GITNAME%%"
)
git config user.email >nul 2>nul
if errorlevel 1 (
  set /p "GITMAIL=Tu correo de GitHub: "
  call git config user.email "%%GITMAIL%%"
)

git add -A
git commit -m "CanCut: editor de video profesional en el navegador"
git branch -M main
git remote remove origin >nul 2>nul
git remote add origin "%REPO%"

echo.
echo Subiendo a GitHub (puede pedirte iniciar sesion en el navegador)...
git push -u origin main
if errorlevel 1 (
  echo.
  echo [ERROR] No se pudo subir. Revisa la URL, tu conexion o tus permisos en GitHub.
  pause
  exit /b 1
)

echo.
echo  =====================  LISTO  =====================
echo  Ultimo paso (solo la primera vez):
echo    En GitHub abre tu repositorio ^> Settings ^> Pages
echo    En "Build and deployment" elige Source: GitHub Actions
echo.
echo  En unos 2 minutos tu editor estara en:
echo    https://TU_USUARIO.github.io/NOMBRE_DEL_REPOSITORIO/
echo  (puedes ver el progreso en la pestana Actions)
echo  ====================================================
echo.
pause
