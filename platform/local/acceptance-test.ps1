param(
  [switch]$SkipDb,
  [switch]$SkipNoDb,
  [switch]$AllowDbSkip,
  [switch]$FailOnWarning,
  [string]$DbHost,
  [int]$DbPort,
  [string]$SharedDataRoot,
  [string]$OutputDir,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Arguments
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeScript = Join-Path $scriptDir 'acceptance-test.mjs'
$node = (Get-Command node -ErrorAction Stop).Source

$nodeArgs = @()
if ($SkipDb) { $nodeArgs += '--skip-db' }
if ($SkipNoDb) { $nodeArgs += '--skip-no-db' }
if ($AllowDbSkip) { $nodeArgs += '--allow-db-skip' }
if ($FailOnWarning) { $nodeArgs += '--fail-on-warning' }
if ($DbHost) { $nodeArgs += "--db-host=$DbHost" }
if ($PSBoundParameters.ContainsKey('DbPort')) { $nodeArgs += "--db-port=$DbPort" }
if ($SharedDataRoot) { $nodeArgs += "--shared-data-root=$SharedDataRoot" }
if ($OutputDir) { $nodeArgs += "--output-dir=$OutputDir" }
if ($Arguments) { $nodeArgs += $Arguments }

& $node $nodeScript @nodeArgs
exit $LASTEXITCODE
