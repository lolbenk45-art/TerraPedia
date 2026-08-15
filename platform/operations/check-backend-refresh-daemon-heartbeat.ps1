param(
  [string]$HeartbeatFile = '',
  [int]$StaleMinutes = 30
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if ([string]::IsNullOrWhiteSpace($HeartbeatFile)) {
  $HeartbeatFile = Join-Path $repoRoot 'reports\backend-refresh\backend-refresh-daemon.heartbeat.json'
}

if (-not (Test-Path $HeartbeatFile)) {
  [pscustomobject]@{
    status = 'missing'
    heartbeatFile = $HeartbeatFile
    stale = $true
  } | ConvertTo-Json -Depth 4
  exit 1
}

$payload = Get-Content -Path $HeartbeatFile -Raw | ConvertFrom-Json
$generatedAt = [datetimeoffset]::Parse([string]$payload.generatedAt)
$ageMinutes = [math]::Round(((Get-Date).ToUniversalTime() - $generatedAt.UtcDateTime).TotalMinutes, 2)
$stale = $ageMinutes -ge $StaleMinutes

[pscustomobject]@{
  status = [string]$payload.status
  heartbeatFile = $HeartbeatFile
  generatedAt = $payload.generatedAt
  ageMinutes = $ageMinutes
  stale = $stale
  pid = $payload.pid
  activeChildPid = $payload.activeChildPid
  lastOutputPath = $payload.lastOutputPath
} | ConvertTo-Json -Depth 4

if ($stale) {
  exit 2
}
