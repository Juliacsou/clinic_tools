@echo off
setlocal EnableExtensions DisableDelayedExpansion
pushd "%~dp0" || goto :error

echo ==========================================================
echo Visual Health Clinic Tools v2.26.8 - Build Portable EXE
echo ==========================================================
where node >nul 2>nul || (echo ERRO: Node.js nao encontrado. & goto :error)
where npm >nul 2>nul || (echo ERRO: npm nao encontrado. & goto :error)
node -e "const v=process.versions.node.split('.').map(Number);process.exit(v[0]>22||(v[0]===22&&v[1]>=12)?0:1)"
if errorlevel 1 (echo ERRO: use Node.js 22.12 ou superior. & goto :error)

if not exist "diagnostico_npm" mkdir "diagnostico_npm"
if errorlevel 1 goto :error

echo.
echo [1/5] Verificando integridade dos arquivos e scripts...
if not exist "scripts\preflight.js" (echo ERRO: scripts\preflight.js nao foi encontrado. & goto :error)
node "scripts\preflight.js"
if errorlevel 1 goto :error

echo.
echo [2/5] Instalando dependencias...
call npm install --no-fund
if errorlevel 1 goto :error

echo.
echo [3/5] Auditoria de seguranca (aplicativo: moderate+, ferramenta: high+)...
if not exist "scripts\audit-gate.js" (echo ERRO: scripts\audit-gate.js nao foi encontrado. & goto :error)
node "scripts\audit-gate.js"
if errorlevel 1 (echo ERRO: auditoria bloqueou o build. Consulte diagnostico_npm. & goto :error)

echo.
echo [4/5] Testes de regressao...
call npm run test:all > "diagnostico_npm\testes-v268.txt" 2>&1
if errorlevel 1 (
  echo ERRO: testes falharam. Resultado:
  type "diagnostico_npm\testes-v268.txt"
  goto :error
)

echo.
echo [5/5] Gerando EXE portatil Windows...
call npm run build:portable
if errorlevel 1 goto :error
if not exist "dist\VHLC Clinic Tools.exe" (
  echo ERRO: o build terminou, mas dist\VHLC Clinic Tools.exe nao foi encontrado.
  goto :error
)

echo.
echo Build concluido: dist\VHLC Clinic Tools.exe
echo Recomenda-se testar o EXE com uma COPIA dos arquivos da clinica.
popd
pause
exit /b 0

:error
echo.
echo FALHA: nao distribua o executavel sem corrigir o erro acima.
popd
pause
exit /b 1
