param(
  [string]$ApiBase,
  [string]$ConfigPath,
  [string]$OutputDir,
  [int]$PublicSamples,
  [int]$AdminSamples,
  [int]$WarmupCount,
  [long]$BenchmarkItemId,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Arguments
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeScript = Join-Path $scriptDir 'benchmark-read-api.mjs'
$node = (Get-Command node -ErrorAction Stop).Source

$nodeArgs = @()
if ($ApiBase) { $nodeArgs += "--api-base=$ApiBase" }
if ($ConfigPath) { $nodeArgs += "--config-path=$ConfigPath" }
if ($OutputDir) { $nodeArgs += "--output-dir=$OutputDir" }
if ($PSBoundParameters.ContainsKey('PublicSamples')) { $nodeArgs += "--public-samples=$PublicSamples" }
if ($PSBoundParameters.ContainsKey('AdminSamples')) { $nodeArgs += "--admin-samples=$AdminSamples" }
if ($PSBoundParameters.ContainsKey('WarmupCount')) { $nodeArgs += "--warmup-count=$WarmupCount" }
if ($PSBoundParameters.ContainsKey('BenchmarkItemId')) { $nodeArgs += "--benchmark-item-id=$BenchmarkItemId" }
if ($Arguments) { $nodeArgs += $Arguments }

& $node $nodeScript @nodeArgs
exit $LASTEXITCODE
