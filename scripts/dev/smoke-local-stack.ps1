param(
  [string]$BackendBaseUrl,
  [string]$AdminBaseUrl,
  [switch]$SkipAuth,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Arguments
)

$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'smoke-local-stack.sh'
$scriptArgs = @()

if ($BackendBaseUrl) { $scriptArgs += "--backend-base-url=$BackendBaseUrl" }
if ($AdminBaseUrl) { $scriptArgs += "--admin-base-url=$AdminBaseUrl" }
if ($SkipAuth) { $scriptArgs += '--skip-auth' }
if ($Arguments) { $scriptArgs += $Arguments }

bash $scriptPath @scriptArgs
exit $LASTEXITCODE
