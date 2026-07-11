@echo off
setlocal

set "ROOT=%~dp0"
set "SERVER=%ROOT%server"
set "CLIENT=%ROOT%client"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required but was not found on PATH.
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm is required but was not found on PATH.
  exit /b 1
)

where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo Windows PowerShell is required for startup health checks.
  exit /b 1
)

set "NODE_MAJOR="
for /f "tokens=1 delims=." %%A in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%A"
if not defined NODE_MAJOR (
  echo Could not determine the Node.js version.
  exit /b 1
)
if %NODE_MAJOR% LSS 24 (
  echo CashLens requires Node.js 24 or newer because the server uses node:sqlite.
  echo Detected Node.js major version: %NODE_MAJOR%
  exit /b 1
)

if not exist "%SERVER%\node_modules" (
  echo Installing server dependencies...
  pushd "%SERVER%"
  if exist package-lock.json (
    call npm.cmd ci
  ) else (
    call npm.cmd install
  )
  if errorlevel 1 (
    popd
    exit /b 1
  )
  popd
)

if not exist "%CLIENT%\node_modules" (
  echo Installing client dependencies...
  pushd "%CLIENT%"
  if exist package-lock.json (
    call npm.cmd ci
  ) else (
    call npm.cmd install
  )
  if errorlevel 1 (
    popd
    exit /b 1
  )
  popd
)

if not exist "%SERVER%\data\cashlens.sqlite3" (
  echo Seeding the demo database...
  pushd "%SERVER%"
  call npm.cmd run seed
  if errorlevel 1 (
    popd
    exit /b 1
  )
  popd
)

netstat -ano | findstr /R /C:":4000 .*LISTENING" >nul
if errorlevel 1 (
  start "CashLens Server" /D "%SERVER%" cmd.exe /k npm.cmd run dev
) else (
  echo Server already appears to be running on port 4000. Skipping server launch.
)

netstat -ano | findstr /R /C:":5173 .*LISTENING" >nul
if errorlevel 1 (
  start "CashLens Client" /D "%CLIENT%" cmd.exe /k npm.cmd run dev
) else (
  echo Client already appears to be running on port 5173. Skipping client launch.
)

echo.
echo CashLens is starting.
echo Server: http://127.0.0.1:4000
echo Client: http://localhost:5173
echo.

set /a SERVER_WAIT_ATTEMPTS=0

:wait_for_server
powershell.exe -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4000/api/health' -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>nul
if not errorlevel 1 goto wait_for_client_setup
set /a SERVER_WAIT_ATTEMPTS+=1
if %SERVER_WAIT_ATTEMPTS% geq 30 goto server_failed
rem PowerShell's sleep works in IDE terminals where TIMEOUT may receive redirected stdin.
powershell.exe -NoProfile -Command "Start-Sleep -Seconds 1"
goto wait_for_server

:server_failed
echo Server did not become healthy at http://127.0.0.1:4000/api/health after 30 seconds.
echo Check the CashLens Server terminal for the startup error.
goto done

:wait_for_client_setup
rem Open the web client (port 4000 is the API only during development).
rem Vite can bind localhost to either IPv4 or IPv6, so do not force 127.0.0.1.
set /a CLIENT_WAIT_ATTEMPTS=0

:wait_for_client
powershell.exe -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:5173/' -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>nul
if not errorlevel 1 goto open_client
set /a CLIENT_WAIT_ATTEMPTS+=1
if %CLIENT_WAIT_ATTEMPTS% geq 30 goto client_failed
rem TIMEOUT fails when stdin is redirected (as it is in many IDE terminals).
rem PowerShell's sleep works in both interactive and non-interactive launches.
powershell.exe -NoProfile -Command "Start-Sleep -Seconds 1"
goto wait_for_client

:open_client
start "" "http://localhost:5173"
goto done

:client_failed
echo Client did not become ready at http://localhost:5173 after 30 seconds.
echo Check the CashLens Client terminal for the startup error.

:done

endlocal
