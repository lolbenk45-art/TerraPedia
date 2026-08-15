param(
  [switch]$ForcePorts,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Arguments
)

$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'stop-local-stack.sh'
$scriptArgs = @()

if ($ForcePorts) { $scriptArgs += '--force-ports' }
if ($Arguments) { $scriptArgs += $Arguments }

bash $scriptPath @scriptArgs
exit $LASTEXITCODE
