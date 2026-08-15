param(
  [switch]$SkipFront,
  [switch]$SkipAdmin
)

$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'quality-gate-ci.sh'
$arguments = @()

if ($SkipFront) { $arguments += '--skip-front' }
if ($SkipAdmin) { $arguments += '--skip-admin' }

bash $scriptPath @arguments
exit $LASTEXITCODE
