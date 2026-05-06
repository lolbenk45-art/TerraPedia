param(
  [switch]$ForcePorts
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$reportDir = Join-Path $repoRoot 'reports\local-start'
$configCandidates = @(
  (Join-Path $PSScriptRoot 'config\local-stack.config.json'),
  (Join-Path $PSScriptRoot 'local-stack.config.json')
)
$configPath = $configCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$stackConfig = $null
if ($configPath -and (Test-Path $configPath)) {
  $stackConfig = Get-Content -Path $configPath -Raw | ConvertFrom-Json
}

function Get-ConfigPort([object]$Root, [string[]]$PathSegments, [int]$Fallback) {
  $current = $Root
  foreach ($segment in $PathSegments) {
    if ($null -eq $current) {
      return $Fallback
    }
    $property = $current.PSObject.Properties[$segment]
    if ($null -eq $property) {
      return $Fallback
    }
    $current = $property.Value
  }

  if ($null -eq $current) {
    return $Fallback
  }

  return [int]$current
}

function Get-ConfigText([object]$Root, [string[]]$PathSegments, [string]$Fallback) {
  $current = $Root
  foreach ($segment in $PathSegments) {
    if ($null -eq $current) {
      return $Fallback
    }
    $property = $current.PSObject.Properties[$segment]
    if ($null -eq $property) {
      return $Fallback
    }
    $current = $property.Value
  }

  if ($null -eq $current -or [string]::IsNullOrWhiteSpace([string]$current)) {
    return $Fallback
  }

  return [string]$current
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

$redisPort = Get-ConfigPort -Root $stackConfig -PathSegments @('redis', 'port') -Fallback 6380
$backPort = Get-ConfigPort -Root $stackConfig -PathSegments @('backend', 'port') -Fallback 18088
$frontPort = Get-ConfigPort -Root $stackConfig -PathSegments @('front', 'port') -Fallback 5174
$adminPort = Get-ConfigPort -Root $stackConfig -PathSegments @('admin', 'port') -Fallback 3001
$redisExe = $env:TERRAPEDIA_REDIS_SERVER_EXE
if ([string]::IsNullOrWhiteSpace($redisExe)) {
  $redisExe = Resolve-ConfigPath (Get-ConfigText -Root $stackConfig -PathSegments @('redis', 'serverExe') -Fallback 'G:\Redis\redis-server.exe')
}
$ports = @($redisPort, $backPort, $frontPort, $adminPort) | Select-Object -Unique

function Get-ProcessInfo([int]$ProcessId) {
  return Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
}

function Test-PathInsideRepo([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $false
  }
  return $Value.IndexOf($repoRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
}

function Test-LocalStackProcessOwnership([int]$ProcessId, [string]$Name) {
  $info = Get-ProcessInfo -ProcessId $ProcessId
  if (-not $info) {
    return $false
  }

  $commandLine = [string]$info.CommandLine
  $executablePath = [string]$info.ExecutablePath
  $repoMarkers = @(
    $repoRoot,
    (Join-Path $repoRoot 'reports\local-start'),
    (Join-Path $repoRoot 'back'),
    (Join-Path $repoRoot 'front'),
    (Join-Path $repoRoot 'data-query-app')
  )

  foreach ($marker in $repoMarkers) {
    if (Test-PathInsideRepo $marker -and (
      $commandLine.IndexOf($marker, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or
      $executablePath.IndexOf($marker, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    )) {
      return $true
    }
  }

  if ($Name -eq "redis-$redisPort" -and -not [string]::IsNullOrWhiteSpace($redisExe)) {
    $redisMatchesExecutable = $executablePath.IndexOf($redisExe, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    $redisMatchesCommand = $commandLine.IndexOf('redis-server', [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    $redisMatchesPort = $commandLine.IndexOf("$redisPort", [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    if (($redisMatchesExecutable -or $redisMatchesCommand) -and $redisMatchesPort) {
      return $true
    }
  }

  Write-Warning "skip name=$Name pid=$ProcessId because local stack process ownership is not verified"
  return $false
}

function Get-ChildProcessIds([int]$ParentProcessId) {
  $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $ParentProcessId" -ErrorAction SilentlyContinue)
  $ids = @()
  foreach ($child in $children) {
    $childId = [int]$child.ProcessId
    $ids += Get-ChildProcessIds -ParentProcessId $childId
    $ids += $childId
  }
  return $ids
}

function Stop-ProcessTree([int]$ProcessId, [string]$Name) {
  if (-not (Test-LocalStackProcessOwnership -ProcessId $ProcessId -Name $Name)) {
    return
  }

  $ids = @((Get-ChildProcessIds -ParentProcessId $ProcessId) + $ProcessId) | Select-Object -Unique
  foreach ($id in $ids) {
    if ($id -eq $PID) {
      continue
    }
    try {
      $process = Get-Process -Id $id -ErrorAction SilentlyContinue
      if ($process) {
        Stop-Process -Id $id -Force
        Write-Host "stopped name=$Name pid=$id"
      }
    } catch {
      Write-Host "failed stopping name=$Name pid=$id error=$($_.Exception.Message)"
    }
  }
}

function Stop-RecordedProcessFile([string]$PidPath) {
  if (-not (Test-Path $PidPath)) {
    return
  }

  $name = [System.IO.Path]::GetFileNameWithoutExtension($PidPath)
  try {
    $pidText = (Get-Content $PidPath -Raw).Trim()
    $processId = 0
    if ([int]::TryParse($pidText, [ref]$processId) -and $processId -gt 0) {
      Stop-ProcessTree -ProcessId $processId -Name $name
    }
  } catch {
    Write-Host "failed stopping name=$name via pid file error=$($_.Exception.Message)"
  } finally {
    Remove-Item $PidPath -Force -ErrorAction SilentlyContinue
  }
}

function Get-PortPids([int]$Port) {
  $matches = & 'C:\Windows\System32\netstat.exe' -ano -p tcp | Select-String ":$Port\s+"
  $processIds = @()
  foreach ($match in $matches) {
    $line = ($match.Line -replace '\s+', ' ').Trim()
    $parts = $line.Split(' ')
    if ($parts.Length -ge 5 -and $parts[3] -eq 'LISTENING') {
      $processId = 0
      if ([int]::TryParse($parts[4], [ref]$processId) -and $processId -gt 0) {
        $processIds += $processId
      }
    }
  }
  return $processIds | Select-Object -Unique
}

Get-ChildItem -Path $reportDir -Filter '*.pid' -File -ErrorAction SilentlyContinue | ForEach-Object {
  Stop-RecordedProcessFile -PidPath $_.FullName
}

if ($ForcePorts) {
  Write-Warning 'ForcePorts requested: checking configured ports after pid cleanup.'
  foreach ($port in $ports) {
    $processIds = Get-PortPids -Port $port
    foreach ($processId in $processIds) {
      Stop-ProcessTree -ProcessId $processId -Name "port-$port"
    }
  }
}
