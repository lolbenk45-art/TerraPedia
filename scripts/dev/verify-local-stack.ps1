param(
  [switch]$SkipBack,
  [switch]$SkipFront,
  [switch]$SkipAdmin
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
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

function Assert-WorktreeRootMatchesRepoRoot {
  $worktreeRoot = [Environment]::GetEnvironmentVariable('WORKTREE_ROOT')
  if ([string]::IsNullOrWhiteSpace($worktreeRoot)) {
    return
  }

  $resolvedWorktreeRoot = (Resolve-Path $worktreeRoot -ErrorAction Stop).Path
  if ($resolvedWorktreeRoot -ne $repoRoot) {
    throw ("WORKTREE_ROOT mismatch: worktree root {0} does not match repo root {1}. Update WORKTREE_ROOT or run verify-local-stack from the intended worktree." -f $resolvedWorktreeRoot, $repoRoot)
  }
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

function Test-LocalTcpPort([string]$HostName, [int]$Port, [int]$TimeoutMilliseconds = 1000) {
  $client = $null
  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $connect = $client.BeginConnect($HostName, $Port, $null, $null)
    $ok = $connect.AsyncWaitHandle.WaitOne($TimeoutMilliseconds)
    if ($ok -and $client.Connected) {
      $client.EndConnect($connect) | Out-Null
      return $true
    }
    return $false
  } catch {
    return $false
  } finally {
    if ($client) {
      $client.Close()
    }
  }
}

function Invoke-DatabasePortCheck {
  $dbName = [string](Resolve-Setting 'TERRAPEDIA_DB_NAME' (Get-ConfigValue $stackConfig @('database', 'name')) 'terria_v1_local')
  $dbHost = [string](Resolve-Setting 'TERRAPEDIA_DB_HOST' (Get-ConfigValue $stackConfig @('database', 'host')) '127.0.0.1')
  $dbPort = [int](Resolve-Setting 'TERRAPEDIA_DB_PORT' (Get-ConfigValue $stackConfig @('database', 'port')) 3306)
  $configHint = if ($configPath) { $configPath } else { 'scripts/dev/config/local-stack.config.json' }

  Write-Host ''
  Write-Host '==> Database TCP preflight'
  Write-Host ("target: {0}:{1}/{2}" -f $dbHost, $dbPort, $dbName)

  if (-not (Test-LocalTcpPort -HostName $dbHost -Port $dbPort)) {
    throw ("Database TCP preflight failed: {0}:{1} is not reachable. Start MySQL or update {2} / TERRAPEDIA_DB_HOST / TERRAPEDIA_DB_PORT." -f $dbHost, $dbPort, $configHint)
  }
}

function Invoke-MapperXmlWellFormedCheck([string]$MapperDirectory) {
  Write-Host ''
  Write-Host '==> MyBatis mapper XML preflight'

  $files = @(Get-ChildItem -Path $MapperDirectory -Filter '*.xml' -File -Recurse -ErrorAction Stop)
  if ($files.Count -eq 0) {
    throw "No mapper XML files found under $MapperDirectory"
  }

  $settings = [System.Xml.XmlReaderSettings]::new()
  $settings.DtdProcessing = [System.Xml.DtdProcessing]::Ignore
  $settings.XmlResolver = $null

  foreach ($file in $files) {
    $reader = $null
    try {
      $reader = [System.Xml.XmlReader]::Create($file.FullName, $settings)
      while ($reader.Read()) { }
    } catch {
      throw ("Invalid mapper XML: {0}. {1}" -f $file.FullName, $_.Exception.Message)
    } finally {
      if ($reader) {
        $reader.Close()
      }
    }
  }

  Write-Host ("checked: {0} mapper XML files" -f $files.Count)
}

function Resolve-RequiredCommand([string]$PreferredPath, [string]$CommandName) {
  if (-not [string]::IsNullOrWhiteSpace($PreferredPath) -and (Test-Path $PreferredPath)) {
    return $PreferredPath
  }
  return (Get-Command $CommandName -ErrorAction Stop).Source
}

function Invoke-Step([string]$Label, [string]$WorkingDirectory, [string]$CommandPath, [string[]]$Arguments) {
  Write-Host ''
  Write-Host "==> $Label"
  Write-Host "cwd: $WorkingDirectory"
  Write-Host "cmd: $CommandPath $($Arguments -join ' ')"

  Push-Location $WorkingDirectory
  try {
    & $CommandPath @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "$Label failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

$mavenCmd = Resolve-RequiredCommand -PreferredPath $null -CommandName 'mvn.cmd'
$pnpmCmd = Resolve-RequiredCommand -PreferredPath 'C:\nvm4w\nodejs\pnpm.cmd' -CommandName 'pnpm.cmd'

Assert-WorktreeRootMatchesRepoRoot

if (-not $SkipBack) {
  Invoke-DatabasePortCheck
  Invoke-MapperXmlWellFormedCheck -MapperDirectory (Join-Path $backDir 'src\main\resources\mapper')
  Invoke-Step -Label 'Backend compile' -WorkingDirectory $backDir -CommandPath $mavenCmd -Arguments @('-DskipTests', 'compile')
}

if (-not $SkipFront) {
  Invoke-Step -Label 'Front typecheck' -WorkingDirectory $frontDir -CommandPath $pnpmCmd -Arguments @('run', 'check')
}

if (-not $SkipAdmin) {
  Invoke-Step -Label 'Admin typecheck' -WorkingDirectory $adminDir -CommandPath $pnpmCmd -Arguments @('run', 'check')
}

Write-Host ''
Write-Host 'verify-local-stack: all requested checks passed.'
