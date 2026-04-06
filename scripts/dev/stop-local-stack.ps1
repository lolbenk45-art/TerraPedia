$ErrorActionPreference = 'Stop'

$ports = 6380, 8888, 5174, 3001, 3000
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$reportDir = Join-Path $repoRoot 'reports\local-start'

function Stop-RecordedProcess([string]$Name) {
  $pidPath = Join-Path $reportDir "$Name.pid"
  if (-not (Test-Path $pidPath)) {
    return
  }

  try {
    $pidText = (Get-Content $pidPath -Raw).Trim()
    $processId = 0
    if ([int]::TryParse($pidText, [ref]$processId) -and $processId -gt 0) {
      $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
      if ($process) {
        Stop-Process -Id $processId -Force
        Write-Host "stopped name=$Name pid=$processId via pid file"
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

foreach ($port in $ports) {
  $processIds = Get-PortPids -Port $port
  foreach ($processId in $processIds) {
    try {
      Stop-Process -Id $processId -Force
      Write-Host "stopped port=$port pid=$processId"
    } catch {
      Write-Host "failed port=$port pid=$processId error=$($_.Exception.Message)"
    }
  }
}

foreach ($name in @('back', 'front', 'data-query-app', 'redis-6380')) {
  Stop-RecordedProcess -Name $name
}
