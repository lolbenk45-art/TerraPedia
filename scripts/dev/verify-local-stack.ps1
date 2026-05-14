param(
  [switch]$SkipBack,
  [switch]$SkipFront,
  [switch]$SkipAdmin
)

$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'verify-local-stack.sh'
$arguments = @()

if ($SkipBack) { $arguments += '--skip-back' }
if ($SkipFront) { $arguments += '--skip-front' }
if ($SkipAdmin) { $arguments += '--skip-admin' }

bash $scriptPath @arguments
exit $LASTEXITCODE
