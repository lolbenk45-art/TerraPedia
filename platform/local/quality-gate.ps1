param(
  [switch]$SkipBack,
  [switch]$SkipFront,
  [switch]$SkipAdmin,
  [switch]$FullDataAudit
)

$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'quality-gate.sh'
$arguments = @()

if ($SkipBack) { $arguments += '--skip-back' }
if ($SkipFront) { $arguments += '--skip-front' }
if ($SkipAdmin) { $arguments += '--skip-admin' }
if ($FullDataAudit) { $arguments += '--full-data-audit' }

bash $scriptPath @arguments
exit $LASTEXITCODE
