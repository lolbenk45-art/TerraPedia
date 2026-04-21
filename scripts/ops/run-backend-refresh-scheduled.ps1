param(
  [string]$NodeCommand = 'node',
  [string]$Mode = '',
  [string]$Steps = '',
  [int]$TimeoutMs = 0
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repoRoot

$nodeExecutable = (Get-Command $NodeCommand -ErrorAction Stop).Source
$arguments = @(
  'scripts/data/workflow/run-backend-data-refresh-daemon.mjs',
  '--once=true',
  '--enabled=true'
)

if (-not [string]::IsNullOrWhiteSpace($Mode)) {
  $arguments += "--mode=$Mode"
}
if (-not [string]::IsNullOrWhiteSpace($Steps)) {
  $arguments += "--steps=$Steps"
}
if ($TimeoutMs -gt 0) {
  $arguments += "--timeout-ms=$TimeoutMs"
}

& $nodeExecutable @arguments
