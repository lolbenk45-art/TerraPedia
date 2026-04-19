param(
  [switch]$SkipBack,
  [switch]$SkipFront,
  [switch]$SkipAdmin
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backDir = Join-Path $repoRoot 'back'
$frontDir = Join-Path $repoRoot 'front'
$adminDir = Join-Path $repoRoot 'data-query-app'

function Resolve-RequiredCommand([string]$PreferredPath, [string]$CommandName) {
  if (-not [string]::IsNullOrWhiteSpace($PreferredPath) -and (Test-Path $PreferredPath)) {
    return $PreferredPath
  }
  return (Get-Command $CommandName -ErrorAction Stop).Source
}

function Invoke-Step([string]$Label, [string]$WorkingDirectory, [string]$CommandPath, [string[]]$Arguments) {
  Write-Host ''
  Write-Host "==> $Label"
  Write-Host "cwd: $WorkingDirectory"
  Write-Host "cmd: $CommandPath $($Arguments -join ' ')"

  Push-Location $WorkingDirectory
  try {
    & $CommandPath @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "$Label failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

$mavenCmd = Resolve-RequiredCommand -PreferredPath $null -CommandName 'mvn.cmd'
$pnpmCmd = Resolve-RequiredCommand -PreferredPath 'C:\nvm4w\nodejs\pnpm.cmd' -CommandName 'pnpm.cmd'

if (-not $SkipBack) {
  Invoke-Step -Label 'Backend compile' -WorkingDirectory $backDir -CommandPath $mavenCmd -Arguments @('-DskipTests', 'compile')
}

if (-not $SkipFront) {
  Invoke-Step -Label 'Front typecheck' -WorkingDirectory $frontDir -CommandPath $pnpmCmd -Arguments @('run', 'check')
}

if (-not $SkipAdmin) {
  Invoke-Step -Label 'Admin typecheck' -WorkingDirectory $adminDir -CommandPath $pnpmCmd -Arguments @('run', 'check')
}

Write-Host ''
Write-Host 'verify-local-stack: all requested checks passed.'
