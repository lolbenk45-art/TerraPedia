param(
  [switch]$ReuseExisting,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Arguments
)

$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'start-local-stack.sh'
$scriptArgs = @()

if ($ReuseExisting) { $scriptArgs += '--reuse-existing' }
if ($Arguments) { $scriptArgs += $Arguments }

bash $scriptPath @scriptArgs
exit $LASTEXITCODE
