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

$redisPort = Get-ConfigPort -Root $stackConfig -PathSegments @('redis', 'port') -Fallback 6380
$backPort = Get-ConfigPort -Root $stackConfig -PathSegments @('backend', 'port') -Fallback 18088
$frontPort = Get-ConfigPort -Root $stackConfig -PathSegments @('front', 'port') -Fallback 5174
$adminPort = Get-ConfigPort -Root $stackConfig -PathSegments @('admin', 'port') -Fallback 3001

function Get-RecordedRuntimePorts {
  if (-not (Test-Path $reportDir)) {
    return @()
  }

  $ports = @()
  Get-ChildItem -Path $reportDir -File -ErrorAction SilentlyContinue | ForEach-Object {
    foreach ($match in [regex]::Matches($_.Name, '(?<!\d)(\d{4,5})(?!\d)')) {
      $port = 0
      if ([int]::TryParse($match.Groups[1].Value, [ref]$port) -and $port -ge 1024 -and $port -le 65535) {
        $ports += $port
      }
    }
  }
  return $ports
}

$ports = @($redisPort, $backPort, $frontPort, $adminPort, 3000, 6380) + (Get-RecordedRuntimePorts) | Select-Object -Unique

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
  if (-not (Test-Path $pidPath)) {
    return
  }

  $name = [System.IO.Path]::GetFileNameWithoutExtension($PidPath)
  try {
    $pidText = (Get-Content $pidPath -Raw).Trim()
    $processId = 0
    if ([int]::TryParse($pidText, [ref]$processId) -and $processId -gt 0) {
      $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
      if ($process) {
        Stop-ProcessTree -ProcessId $processId -Name $Name
      }
    }
  } catch {
    Write-Host "failed stopping name=$Name via pid file error=$($_.Exception.Message)"
  } finally {
    Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
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

foreach ($port in $ports) {
  $processIds = Get-PortPids -Port $port
  foreach ($processId in $processIds) {
    Stop-ProcessTree -ProcessId $processId -Name "port-$port"
  }
}
