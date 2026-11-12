@echo off
setlocal EnableExtensions DisableDelayedExpansion
pushd "%~dp0" || goto :error

echo ==========================================================
echo Visual Health Clinic Tools v2.26.8 - Validacao sem EXE
echo ==========================================================

where node >nul 2>nul || (echo ERRO: Node.js nao encontrado. & goto :error)
where npm >nul 2>nul || (echo ERRO: npm nao encontrado. & goto :error)
node -e "const v=process.versions.node.split('.').map(Number);process.exit(v[0]>22||(v[0]===22&&v[1]>=12)?0:1)"
if errorlevel 1 (echo ERRO: use Node.js 22.12 ou superior. & goto :error)

if not exist "diagnostico_npm" mkdir "diagnostico_npm"
if errorlevel 1 goto :error

echo.
echo [1/4] Verificando integridade dos arquivos e scripts...
if not exist "scripts\preflight.js" (echo ERRO: scripts\preflight.js nao foi encontrado. & goto :error)
node "scripts\preflight.js"
if errorlevel 1 goto :error

echo.
echo [2/4] Instalando dependencias...
call npm install --no-fund
if errorlevel 1 goto :error

echo.
echo [3/4] Verificando dependencias e auditoria de seguranca...
call npm ls electron electron-builder exceljs pdf-lib > "diagnostico_npm\arvore-dependencias-v268.txt" 2>&1
if errorlevel 1 (
  echo ERRO: inconsistencia nas dependencias. Ver diagnostico_npm\arvore-dependencias-v268.txt.
  goto :error
)
if not exist "scripts\audit-gate.js" (echo ERRO: scripts\audit-gate.js nao foi encontrado. & goto :error)
node "scripts\audit-gate.js"
if errorlevel 1 (echo ERRO: auditoria nao aprovada. Consulte diagnostico_npm. & goto :error)

echo.
echo [4/4] Executando os testes completos...
call npm run test:all > "diagnostico_npm\testes-v268.txt" 2>&1
if errorlevel 1 (
  echo ERRO: testes falharam. Resultado:
  type "diagnostico_npm\testes-v268.txt"
  goto :error
)

echo.
echo SUCESSO: integridade, dependencias, auditoria e testes aprovados.
echo Os alertas MODERATE exclusivos de ferramentas podem aparecer como avisos.
echo A validacao no Windows ainda requer testes reais com uma COPIA do Excel.
popd
pause
exit /b 0

:error
echo.
echo FALHA: nao gere nem distribua o EXE ate concluir a validacao.
popd
pause
exit /b 1
