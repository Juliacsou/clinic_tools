@echo off
setlocal EnableExtensions DisableDelayedExpansion
pushd "%~dp0" || goto :error

echo ==========================================================
echo Visual Health Clinic Tools - Atualizacao Rapida (1 Clique)
echo ==========================================================
where node >nul 2>nul || (echo ERRO: Node.js nao encontrado. & goto :error)
where npm >nul 2>nul || (echo ERRO: npm nao encontrado. & goto :error)

where git >nul 2>nul
if not errorlevel 1 (
  if exist ".git" (
    echo [1/3] Baixando ultima atualizacao do GitHub...
    call git pull --ff-only origin main
  )
)

if not exist "node_modules" (
  echo [2/3] Instalando dependencias pela primeira vez...
  call npm install --no-fund
  if errorlevel 1 goto :error
) else (
  echo [2/3] Dependencias ja instaladas (pulando npm install lento)...
)

echo [3/3] Gerando executavel portatil localmente (sem bloqueio de antivirus)...
call npm run build:portable
if errorlevel 1 goto :error

echo.
echo ==========================================================
echo PRONTO! Executavel atualizado em: dist\VHLC Clinic Tools.exe
echo ==========================================================
popd
pause
exit /b 0

:error
echo.
echo FALHA ao atualizar o executavel.
popd
pause
exit /b 1
