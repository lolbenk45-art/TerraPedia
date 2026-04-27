param(
  [switch]$ReuseExisting
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$reportDir = Join-Path $repoRoot 'reports\local-start'
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
$backDir = Join-Path $repoRoot 'back'
$frontDir = Join-Path $repoRoot 'front'
$adminDir = Join-Path $repoRoot 'data-query-app'
$configCandidates = @(
  (Join-Path $PSScriptRoot 'config\local-stack.config.json'),
  (Join-Path $PSScriptRoot 'local-stack.config.json')
)
$configPath = $configCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$stackConfig = $null
if ($configPath -and (Test-Path $configPath)) {
  $stackConfig = Get-Content -Path $configPath -Raw | ConvertFrom-Json
}

if (-not $ReuseExisting) {
  $stopScript = Join-Path $PSScriptRoot 'stop-local-stack.ps1'
  if (Test-Path $stopScript) {
    Write-Host "Stopping recorded local stack processes before startup..."
    & 'powershell.exe' -NoProfile -ExecutionPolicy Bypass -File $stopScript
  }
}

function Resolve-Setting([string]$EnvName, [object]$ConfigValue, [object]$Fallback) {
  $envValue = [Environment]::GetEnvironmentVariable($EnvName)
  if ($null -ne $envValue -and -not [string]::IsNullOrWhiteSpace([string]$envValue)) {
    return $envValue
  }
  if ($null -ne $ConfigValue) {
    if ($ConfigValue -is [string]) {
      if (-not [string]::IsNullOrWhiteSpace($ConfigValue)) {
        return $ConfigValue
      }
    } else {
      return $ConfigValue
    }
  }
  return $Fallback
}

function Resolve-BoolString([string]$EnvName, [object]$ConfigValue, [bool]$Fallback) {
  $resolved = Resolve-Setting -EnvName $EnvName -ConfigValue $ConfigValue -Fallback $Fallback
  return ([System.Convert]::ToBoolean($resolved)).ToString().ToLowerInvariant()
}

function Require-TextSetting([string]$Name, [object]$Value) {
  $text = [string]$Value
  if ([string]::IsNullOrWhiteSpace($text)) {
    throw "$Name is required. Set it in scripts/dev/config/local-stack.config.json or via environment variable."
  }
  return $text
}

function Resolve-ConfigPath([string]$PathValue) {
  if ([string]::IsNullOrWhiteSpace($PathValue)) {
    return $null
  }
  if ([System.IO.Path]::IsPathRooted($PathValue)) {
    return $PathValue
  }
  return (Join-Path $repoRoot $PathValue)
}

function Get-ConfigValue([object]$Root, [string[]]$PathSegments) {
  $current = $Root
  foreach ($segment in $PathSegments) {
    if ($null -eq $current) {
      return $null
    }
    $property = $current.PSObject.Properties[$segment]
    if ($null -eq $property) {
      return $null
    }
    $current = $property.Value
  }
  return $current
}

$dbName = [string](Resolve-Setting 'TERRAPEDIA_DB_NAME' (Get-ConfigValue $stackConfig @('database', 'name')) 'terria_v1_local')
$dbHost = [string](Resolve-Setting 'TERRAPEDIA_DB_HOST' (Get-ConfigValue $stackConfig @('database', 'host')) '127.0.0.1')
$dbPort = [int](Resolve-Setting 'TERRAPEDIA_DB_PORT' (Get-ConfigValue $stackConfig @('database', 'port')) 3306)
$dbUser = [string](Resolve-Setting 'TERRAPEDIA_DB_USERNAME' (Get-ConfigValue $stackConfig @('database', 'username')) 'root')
$dbPassword = [string](Resolve-Setting 'TERRAPEDIA_DB_PASSWORD' (Get-ConfigValue $stackConfig @('database', 'password')) 'root')
$dbUrl = [string](Resolve-Setting 'TERRAPEDIA_DB_URL' (Get-ConfigValue $stackConfig @('database', 'url')) "jdbc:mysql://$dbHost`:$dbPort/$dbName?createDatabaseIfNotExist=true&useUnicode=true&characterEncoding=utf-8&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true")
$backPort = [int](Resolve-Setting 'APP_PORT' (Get-ConfigValue $stackConfig @('backend', 'port')) 18088)
$frontPort = [int](Resolve-Setting 'TERRAPEDIA_FRONT_PORT' (Get-ConfigValue $stackConfig @('front', 'port')) 5174)
$adminPort = [int](Resolve-Setting 'TERRAPEDIA_ADMIN_PORT' (Get-ConfigValue $stackConfig @('admin', 'port')) 3001)
$redisHost = [string](Resolve-Setting 'TERRAPEDIA_REDIS_HOST' (Get-ConfigValue $stackConfig @('redis', 'host')) '127.0.0.1')
$redisPort = [int](Resolve-Setting 'TERRAPEDIA_REDIS_PORT' (Get-ConfigValue $stackConfig @('redis', 'port')) 6380)
$redisDatabase = [string](Resolve-Setting 'TERRAPEDIA_REDIS_DATABASE' (Get-ConfigValue $stackConfig @('redis', 'database')) 0)
$redisPassword = [string](Resolve-Setting 'TERRAPEDIA_REDIS_PASSWORD' (Get-ConfigValue $stackConfig @('redis', 'password')) 'root')
$adminUsername = [string](Resolve-Setting 'TERRAPEDIA_ADMIN_USERNAME' (Get-ConfigValue $stackConfig @('auth', 'admin', 'username')) 'admin')
$adminPassword = Require-TextSetting 'TERRAPEDIA_ADMIN_PASSWORD' (Resolve-Setting 'TERRAPEDIA_ADMIN_PASSWORD' (Get-ConfigValue $stackConfig @('auth', 'admin', 'password')) $null)
$adminDisplayName = [string](Resolve-Setting 'TERRAPEDIA_ADMIN_DISPLAY_NAME' (Get-ConfigValue $stackConfig @('auth', 'admin', 'displayName')) 'Admin')
$adminTokenSecret = Require-TextSetting 'TERRAPEDIA_AUTH_TOKEN_SECRET' (Resolve-Setting 'TERRAPEDIA_AUTH_TOKEN_SECRET' (Get-ConfigValue $stackConfig @('auth', 'admin', 'tokenSecret')) $null)
$userTokenSecret = Require-TextSetting 'TERRAPEDIA_USER_TOKEN_SECRET' (Resolve-Setting 'TERRAPEDIA_USER_TOKEN_SECRET' (Get-ConfigValue $stackConfig @('auth', 'user', 'tokenSecret')) $null)
$minioEnabled = Resolve-BoolString 'TERRAPEDIA_MINIO_ENABLED' (Get-ConfigValue $stackConfig @('minio', 'enabled')) $false
$minioCredentialsFile = Resolve-ConfigPath ([string](Resolve-Setting 'TERRAPEDIA_MINIO_CREDENTIALS_FILE' (Get-ConfigValue $stackConfig @('minio', 'credentialsFile')) $null))

function Write-PidFile([string]$Name, [int]$ProcessId) {
  $pidPath = Join-Path $reportDir "$Name.pid"
  Set-Content -Path $pidPath -Value $ProcessId -Encoding ascii
}

function Resolve-LogPath([string]$BaseLogPath) {
  $errPath = "$BaseLogPath.err"
  try {
    if (Test-Path $BaseLogPath) { Remove-Item $BaseLogPath -Force }
    if (Test-Path $errPath) { Remove-Item $errPath -Force }
    return @{ Out = $BaseLogPath; Err = $errPath }
  } catch {
    $dir = Split-Path $BaseLogPath -Parent
    $name = [System.IO.Path]::GetFileNameWithoutExtension($BaseLogPath)
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $fallbackOut = Join-Path $dir "$name-$stamp.log"
    $fallbackErr = "$fallbackOut.err"
    return @{ Out = $fallbackOut; Err = $fallbackErr }
  }
}

function Test-LocalPort([int]$Port) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(800)
    if ($ok -and $client.Connected) {
      $client.EndConnect($iar) | Out-Null
      $client.Close()
      return $true
    }
    $client.Close()
    return $false
  } catch {
    return $false
  }
}

function Wait-LocalPort([int]$Port, [int]$TimeoutSeconds = 15) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-LocalPort $Port) {
      return $true
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Start-BackgroundPwsh([string]$Name, [string]$Command, [string]$LogPath) {
  $resolved = Resolve-LogPath -BaseLogPath $LogPath
  $outPath = $resolved.Out
  $errPath = $resolved.Err

  $p = Start-Process -FilePath 'powershell.exe' `
    -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $Command `
    -RedirectStandardOutput $outPath `
    -RedirectStandardError $errPath `
    -WindowStyle Hidden `
    -PassThru
  Write-PidFile -Name $Name -ProcessId $p.Id
  Write-Host "$Name PID=$($p.Id) log=$outPath"
}

function Start-BackgroundPnpm([string]$Name, [string]$WorkingDirectory, [string]$LogPath, [string[]]$Arguments) {
  $quotedArgs = ($Arguments | ForEach-Object { "'$_'" }) -join ', '
  $command = @"
Set-Location '$WorkingDirectory'
& '$pnpmCmd' @($quotedArgs)
"@
  Start-BackgroundPwsh -Name $Name -Command $command -LogPath $LogPath
}

$mavenCmd = (Get-Command 'mvn.cmd' -ErrorAction Stop).Source
$pnpmCmd = 'C:\nvm4w\nodejs\pnpm.cmd'
if (-not (Test-Path $pnpmCmd)) {
  $pnpmCmd = (Get-Command 'pnpm.cmd' -ErrorAction Stop).Source
}

$verifyScript = Join-Path $PSScriptRoot 'verify-local-stack.ps1'
if (-not (Test-Path $verifyScript)) {
  throw "Missing required preflight script: $verifyScript"
}

Write-Host "Running preflight checks before local stack startup..."
& 'powershell.exe' -NoProfile -ExecutionPolicy Bypass -File $verifyScript
if ($LASTEXITCODE -ne 0) {
  throw "Preflight checks failed. Fix compile/type errors before starting the local stack."
}

if (-not (Test-LocalPort $redisPort)) {
  $redisExe = $env:TERRAPEDIA_REDIS_SERVER_EXE
  if ([string]::IsNullOrWhiteSpace($redisExe)) {
    $redisExe = Resolve-ConfigPath ([string](Resolve-Setting 'TERRAPEDIA_REDIS_SERVER_EXE' (Get-ConfigValue $stackConfig @('redis', 'serverExe')) 'G:\Redis\redis-server.exe'))
  }

if ((Test-Path $redisExe)) {
    $redisOut = Join-Path $reportDir "redis-$redisPort.log"
    $resolvedRedis = Resolve-LogPath -BaseLogPath $redisOut
    $redisOut = $resolvedRedis.Out
    $redisErr = $resolvedRedis.Err

    $redis = Start-Process -FilePath $redisExe `
      -ArgumentList '--port', "$redisPort", '--bind', $redisHost, '--protected-mode', 'yes', '--requirepass', $redisPassword `
      -RedirectStandardOutput $redisOut `
      -RedirectStandardError $redisErr `
      -WindowStyle Hidden `
      -PassThru
    Write-PidFile -Name "redis-$redisPort" -ProcessId $redis.Id
    Write-Host "redis PID=$($redis.Id)"
    if (-not (Wait-LocalPort -Port $redisPort -TimeoutSeconds 15)) {
      throw "Redis $redisPort failed to start. Check $redisOut and $redisErr"
    }
  } else {
    throw "redis-server.exe not found. Set TERRAPEDIA_REDIS_SERVER_EXE first."
  }
}

if (-not (Test-LocalPort $redisPort)) {
  throw "Redis $redisPort is not reachable."
}

$env:APP_PORT = "$backPort"
$env:TERRAPEDIA_DB_NAME = $dbName
$env:TERRAPEDIA_DB_HOST = $dbHost
$env:TERRAPEDIA_DB_PORT = "$dbPort"
$env:TERRAPEDIA_DB_URL = $dbUrl
$env:TERRAPEDIA_DB_USERNAME = $dbUser
$env:TERRAPEDIA_DB_PASSWORD = $dbPassword
$env:TERRAPEDIA_BACKEND_ORIGIN = "http://localhost:$backPort"
$env:TERRAPEDIA_REDIS_HOST = $redisHost
$env:TERRAPEDIA_REDIS_PORT = "$redisPort"
$env:TERRAPEDIA_REDIS_DATABASE = $redisDatabase
if (-not [string]::IsNullOrWhiteSpace($redisPassword)) {
  $env:TERRAPEDIA_REDIS_PASSWORD = $redisPassword
} else {
  Remove-Item Env:TERRAPEDIA_REDIS_PASSWORD -ErrorAction SilentlyContinue
}
$env:TERRAPEDIA_ADMIN_USERNAME = $adminUsername
$env:TERRAPEDIA_ADMIN_PASSWORD = $adminPassword
$env:TERRAPEDIA_ADMIN_DISPLAY_NAME = $adminDisplayName
$env:TERRAPEDIA_AUTH_TOKEN_SECRET = $adminTokenSecret
$env:TERRAPEDIA_USER_TOKEN_SECRET = $userTokenSecret
$env:TERRAPEDIA_MINIO_ENABLED = $minioEnabled
if (-not [string]::IsNullOrWhiteSpace($minioCredentialsFile)) {
  $env:TERRAPEDIA_MINIO_CREDENTIALS_FILE = $minioCredentialsFile
}

$springProfile = [string](Resolve-Setting 'SPRING_PROFILES_ACTIVE' (Get-ConfigValue $stackConfig @('backend', 'springProfile')) 'legacy')
$env:SPRING_PROFILES_ACTIVE = $springProfile
$springFlywayOutOfOrder = Resolve-BoolString 'SPRING_FLYWAY_OUT_OF_ORDER' (Get-ConfigValue $stackConfig @('backend', 'flywayOutOfOrder')) $true
$env:SPRING_FLYWAY_OUT_OF_ORDER = $springFlywayOutOfOrder
$env:SPRING_DEVTOOLS_RESTART_ENABLED = 'false'
$env:SPRING_DEVTOOLS_LIVERELOAD_ENABLED = 'false'
$env:MANAGEMENT_HEALTH_MAIL_ENABLED = 'false'

if (-not (Test-LocalPort $backPort)) {
$backLog = Join-Path $reportDir 'back-dev.log'
  $backCmd = @"
Set-Location '$backDir'
& '$mavenCmd' '-DskipTests' '-Dspring-boot.run.profiles=legacy' '-Dspring-boot.run.jvmArguments=-DAPP_PORT=$backPort -DTERRAPEDIA_MAIL_ENABLED=false -Dmanagement.health.mail.enabled=false' 'spring-boot:run'
"@
  Write-Host "backend db: $dbName"
  Start-BackgroundPwsh -Name 'back' -Command $backCmd -LogPath $backLog
  if (-not (Wait-LocalPort -Port $backPort -TimeoutSeconds 90)) {
    throw "Backend failed to start on $backPort. Check $backLog"
  }
} else {
  Write-Host "back already running on $backPort"
}

if (-not (Test-LocalPort $frontPort)) {
  $frontLog = Join-Path $reportDir 'front-dev.log'
  Start-BackgroundPnpm `
    -Name 'front' `
    -WorkingDirectory $frontDir `
    -LogPath $frontLog `
    -Arguments @('run', 'dev', '--host', 'localhost', '--port', "$frontPort")
  if (-not (Wait-LocalPort -Port $frontPort -TimeoutSeconds 45)) {
    throw "Front failed to start on $frontPort. Check $frontLog"
  }
} else {
  Write-Host "front already running on $frontPort"
}

if (-not (Test-LocalPort $adminPort)) {
  $adminLog = Join-Path $reportDir 'admin-dev.log'
  Start-BackgroundPnpm `
    -Name 'data-query-app' `
    -WorkingDirectory $adminDir `
    -LogPath $adminLog `
    -Arguments @('exec', 'nuxt', 'dev', '--port', "$adminPort", '--host', 'localhost')
  if (-not (Wait-LocalPort -Port $adminPort -TimeoutSeconds 60)) {
    throw "Admin app failed to start on $adminPort. Check $adminLog"
  }
} else {
  Write-Host "data-query-app already running on $adminPort"
}

Start-Sleep -Seconds 2
Write-Host ''
Write-Host "redis($redisPort): $(Test-LocalPort $redisPort)"
Write-Host "back($backPort): $(Test-LocalPort $backPort)"
Write-Host "front($frontPort): $(Test-LocalPort $frontPort)"
Write-Host "data-query-app($adminPort): $(Test-LocalPort $adminPort)"
Write-Host ''
Write-Host "database: $dbName"
Write-Host "config: $configPath"
Write-Host "flyway.outOfOrder: $springFlywayOutOfOrder"
Write-Host "Logs: $reportDir"
