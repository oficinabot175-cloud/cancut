@echo off
chcp 65001 >nul
title NovaCut Studio - Servidor local
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Necesitas Node.js 20 o superior: https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Instalando dependencias por primera vez...
  call npm install
)

echo Abriendo NovaCut Studio en http://localhost:5173 ...
call npm run dev
pause
