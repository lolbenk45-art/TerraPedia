@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT=%%~fI"
set "LOG_DIR=%ROOT%\reports\2026-03-18-batch28"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

set "RUN_LOG=%LOG_DIR%\local-runner.log"
set "BACK_STEP_LOG=%LOG_DIR%\step-backend-build.log"
set "FRONT_STEP_LOG=%LOG_DIR%\step-frontend-build.log"
set "ADMIN_STEP_LOG=%LOG_DIR%\step-admin-build.log"
set "BACK_START_LOG=%LOG_DIR%\step-backend-run.log"
set "IMPORT_LOG=%LOG_DIR%\step-import.log"

set "BACK_BUILD=%ROOT%\back\scripts\build-back.ps1"
set "FRONT_BUILD=%ROOT%\front\scripts\build-front.ps1"
set "ADMIN_BUILD=%ROOT%\data-query-app\scripts\build-admin.ps1"
set "IMPORT_SCRIPT=%ROOT%\scripts\data\run-import-pipeline.mjs"
set "IMPORT_FILE=%ROOT%\data\normalized\items.wiki.sample.json"
set "BACK_DIR=%ROOT%\back"
set "FRONT_DIR=%ROOT%\front"
set "ADMIN_DIR=%ROOT%\data-query-app"
set "TERRAPEDIA_LOG_DIR=%LOG_DIR%"
set "TEMP=%ROOT%\.tmp"
set "TMP=%ROOT%\.tmp"
set "HOME=%ROOT%\.home"
set "USERPROFILE=%ROOT%\.home"
set "APPDATA=%ROOT%\.appdata"
set "LOCALAPPDATA=%ROOT%\.localappdata"
if not exist "%TEMP%" mkdir "%TEMP%"
if not exist "%HOME%" mkdir "%HOME%"
if not exist "%APPDATA%" mkdir "%APPDATA%"
if not exist "%LOCALAPPDATA%" mkdir "%LOCALAPPDATA%"

if not exist "%BACK_BUILD%" (
  call :fail "Missing file: %BACK_BUILD%"
  exit /b 1
)
if not exist "%FRONT_BUILD%" (
  call :fail "Missing file: %FRONT_BUILD%"
  exit /b 1
)
if not exist "%ADMIN_BUILD%" (
  call :fail "Missing file: %ADMIN_BUILD%"
  exit /b 1
)
if not exist "%IMPORT_SCRIPT%" (
  call :fail "Missing file: %IMPORT_SCRIPT%"
  exit /b 1
)

break > "%RUN_LOG%"
call :log "=========================================="
call :log "terraPedia local runner - 2026-03-18"
call :log "Root: %ROOT%"
call :log "Log dir: %LOG_DIR%"
call :log "=========================================="
call :log ""

call :log "[1/3] Build backend"
call :run_ps_logged "%BACK_DIR%" "& '%BACK_BUILD%'" "%BACK_STEP_LOG%" "Backend build"
if errorlevel 1 exit /b 1

call :log ""
call :log "[2/3] Build frontend"
call :run_ps_logged "%FRONT_DIR%" "& '%FRONT_BUILD%'" "%FRONT_STEP_LOG%" "Frontend build"
if errorlevel 1 exit /b 1

call :log ""
call :log "[3/3] Build admin app"
call :run_ps_logged "%ADMIN_DIR%" "& '%ADMIN_BUILD%'" "%ADMIN_STEP_LOG%" "Admin build"
if errorlevel 1 exit /b 1

call :log ""
set "START_BACKEND="
set /p "START_BACKEND=Start backend now in a new window? [Y/N]: "
call :log "User choice - start backend: %START_BACKEND%"
if /I "%START_BACKEND%"=="Y" (
  call :start_backend
)

call :log ""
set "RUN_IMPORT="
set /p "RUN_IMPORT=Run sample data import now? [Y/N]: "
call :log "User choice - run import: %RUN_IMPORT%"
if /I "%RUN_IMPORT%"=="Y" (
  if not exist "%IMPORT_FILE%" (
    call :fail "Missing file: %IMPORT_FILE%"
    exit /b 1
  )
  call :log "Make sure backend is already running at http://localhost:8888"
  pause
  call :run_cmd_logged "%ROOT%" "node \"%IMPORT_SCRIPT%\" \"%IMPORT_FILE%\"" "%IMPORT_LOG%" "Sample data import"
  if errorlevel 1 exit /b 1
)

call :log ""
call :log "Manual cache verification:"
call :log "  GET http://localhost:8888/api/catalog/stats"
call :log "  GET http://localhost:8888/api/items/{id}"
call :log "Check cache keys:"
call :log "  stats:overview"
call :log "  item:detail"
call :log "Re-check after update/delete to confirm cache invalidation."
call :log ""
call :log "Done."
call :log "Runner log: %RUN_LOG%"
exit /b 0

:run_ps_logged
set "WORKDIR=%~1"
set "PS_COMMAND=%~2"
set "STEP_LOG=%~3"
set "STEP_NAME=%~4"
break > "%STEP_LOG%"
call :log "%STEP_NAME% started. Step log: %STEP_LOG%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%WORKDIR%'; %PS_COMMAND%" 1>>"%STEP_LOG%" 2>>&1
set "STEP_EXIT=%errorlevel%"
if not "%STEP_EXIT%"=="0" (
  call :log "%STEP_NAME% failed with exit code %STEP_EXIT%. See: %STEP_LOG%"
  exit /b %STEP_EXIT%
)
call :log "%STEP_NAME% completed successfully. See: %STEP_LOG%"
exit /b 0

:run_cmd_logged
set "WORKDIR=%~1"
set "RAW_COMMAND=%~2"
set "STEP_LOG=%~3"
set "STEP_NAME=%~4"
break > "%STEP_LOG%"
call :log "%STEP_NAME% started. Step log: %STEP_LOG%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%WORKDIR%'; %RAW_COMMAND%" 1>>"%STEP_LOG%" 2>>&1
set "STEP_EXIT=%errorlevel%"
if not "%STEP_EXIT%"=="0" (
  call :log "%STEP_NAME% failed with exit code %STEP_EXIT%. See: %STEP_LOG%"
  exit /b %STEP_EXIT%
)
call :log "%STEP_NAME% completed successfully. See: %STEP_LOG%"
exit /b 0

:start_backend
break > "%BACK_START_LOG%"
call :log "Starting backend in a new PowerShell window. Log: %BACK_START_LOG%"
start "terraPedia-backend" powershell.exe -NoExit -ExecutionPolicy Bypass -Command "$log='%BACK_START_LOG%'; Set-Location -LiteralPath '%BACK_DIR%'; $env:RDS_HOST='localhost'; 'Starting backend with RDS_HOST=localhost' | Tee-Object -FilePath $log -Append; mvn spring-boot:run *>&1 | Tee-Object -FilePath $log -Append"
call :log "Backend window opened. RDS_HOST=localhost"
exit /b 0

:fail
call :log "ERROR: %~1"
exit /b 1

:log
echo %~1
>>"%RUN_LOG%" echo %date% %time% %~1
exit /b 0
