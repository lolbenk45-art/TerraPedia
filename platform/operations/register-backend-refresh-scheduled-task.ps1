param(
  [string]$TaskName = 'TerraPedia Backend Refresh',
  [int]$IntervalMinutes = 0,
  [string]$StartTime = '',
  [string]$NodeCommand = 'node',
  [string]$Mode = '',
  [string]$Steps = '',
  [int]$TimeoutMs = 0,
  [switch]$Preview
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$configCandidates = @(
  (Join-Path $repoRoot 'scripts\dev\config\local-stack.config.json'),
  (Join-Path $repoRoot 'scripts\dev\local-stack.config.json')
)
$configPath = $configCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$stackConfig = $null
if ($configPath) {
  $stackConfig = Get-Content -Path $configPath -Raw | ConvertFrom-Json
}

function Get-ConfigValue([object]$Root, [string[]]$PathSegments) {
  $current = $Root
  foreach ($segment in $PathSegments) {
    if ($null -eq $current) { return $null }
    $property = $current.PSObject.Properties[$segment]
    if ($null -eq $property) { return $null }
    $current = $property.Value
  }
  return $current
}

function Resolve-Text([string]$Explicit, [object]$ConfigValue, [string]$Fallback) {
  if (-not [string]::IsNullOrWhiteSpace($Explicit)) { return $Explicit }
  if ($null -ne $ConfigValue -and -not [string]::IsNullOrWhiteSpace([string]$ConfigValue)) { return [string]$ConfigValue }
  return $Fallback
}

function Resolve-PositiveInt([int]$Explicit, [object]$ConfigValue, [int]$Fallback) {
  if ($Explicit -gt 0) { return $Explicit }
  if ($null -ne $ConfigValue) {
    $parsed = 0
    if ([int]::TryParse([string]$ConfigValue, [ref]$parsed) -and $parsed -gt 0) {
      return $parsed
    }
  }
  return $Fallback
}

$resolvedIntervalMinutes = Resolve-PositiveInt -Explicit $IntervalMinutes -ConfigValue (Get-ConfigValue $stackConfig @('dataRefresh', 'intervalMinutes')) -Fallback 180
$resolvedMode = Resolve-Text -Explicit $Mode -ConfigValue (Get-ConfigValue $stackConfig @('dataRefresh', 'mode')) -Fallback 'apply'
$resolvedSteps = Resolve-Text -Explicit $Steps -ConfigValue (Get-ConfigValue $stackConfig @('dataRefresh', 'steps')) -Fallback ''
$resolvedTimeoutMs = Resolve-PositiveInt -Explicit $TimeoutMs -ConfigValue (Get-ConfigValue $stackConfig @('dataRefresh', 'timeoutMs')) -Fallback 0
$resolvedStartTime = if (-not [string]::IsNullOrWhiteSpace($StartTime)) {
  $StartTime
} else {
  (Get-Date).AddMinutes(1).ToString('HH:mm')
}

$wrapperPath = Join-Path $repoRoot 'scripts\ops\run-backend-refresh-scheduled.ps1'
if (-not (Test-Path $wrapperPath)) {
  throw "Missing wrapper script: $wrapperPath"
}

$nodeExecutable = (Get-Command $NodeCommand -ErrorAction Stop).Source
$wrapperArguments = @(
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-File', "`"$wrapperPath`"",
  '-NodeCommand', "`"$nodeExecutable`"",
  '-Mode', $resolvedMode
)

if (-not [string]::IsNullOrWhiteSpace($resolvedSteps)) {
  $wrapperArguments += @('-Steps', "`"$resolvedSteps`"")
}
if ($resolvedTimeoutMs -gt 0) {
  $wrapperArguments += @('-TimeoutMs', "$resolvedTimeoutMs")
}

$taskCommand = "powershell.exe $($wrapperArguments -join ' ')"
$schtasksArgs = @(
  '/Create',
  '/F',
  '/TN', $TaskName,
  '/SC', 'MINUTE',
  '/MO', "$resolvedIntervalMinutes",
  '/ST', $resolvedStartTime,
  '/TR', $taskCommand
)

if ($Preview) {
  [pscustomobject]@{
    TaskName = $TaskName
    IntervalMinutes = $resolvedIntervalMinutes
    StartTime = $resolvedStartTime
    Mode = $resolvedMode
    Steps = $resolvedSteps
    TimeoutMs = $resolvedTimeoutMs
    Command = "schtasks $($schtasksArgs -join ' ')"
    ConfigPath = $configPath
  } | ConvertTo-Json -Depth 4
  exit 0
}

& schtasks.exe @schtasksArgs
