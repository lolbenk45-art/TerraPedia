param(
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

$nodeCmd = Resolve-RequiredCommand -PreferredPath $null -CommandName 'node.exe'
$mavenCmd = Resolve-RequiredCommand -PreferredPath $null -CommandName 'mvn.cmd'
$pnpmCmd = Resolve-RequiredCommand -PreferredPath 'C:\nvm4w\nodejs\pnpm.cmd' -CommandName 'pnpm.cmd'

Invoke-Step -Label 'Data workflow acceptance tests' -WorkingDirectory $repoRoot -CommandPath $nodeCmd -Arguments @(
  '--test',
  'scripts/dev/quality-gate.test.mjs',
  'scripts/data/workflow/data-source-acceptance-report-manifest.test.mjs',
  'scripts/data/workflow/data-source-acceptance-freshness-audit.test.mjs',
  'scripts/data/workflow/data-source-acceptance-refresh-plan.test.mjs',
  'scripts/data/workflow/domain-acceptance-report-manifest.test.mjs',
  'scripts/data/workflow/domain-acceptance-freshness-audit.test.mjs',
  'scripts/data/workflow/domain-acceptance-refresh-plan.test.mjs',
  'scripts/data/workflow/domain-acceptance-a-grade-gate.test.mjs'
)

Invoke-Step -Label 'Domain acceptance A-grade gate' -WorkingDirectory $repoRoot -CommandPath $nodeCmd -Arguments @(
  'scripts/data/workflow/domain-acceptance-a-grade-gate.mjs',
  '--fail-on-blocked=true'
)

Invoke-Step -Label 'Backend acceptance contract tests' -WorkingDirectory $backDir -CommandPath $mavenCmd -Arguments @(
  '-Dtest=DataSourceAcceptanceServiceImplTest,AdminDataSourceAcceptanceControllerTest,DomainAcceptanceServiceImplTest,AdminDomainAcceptanceControllerTest',
  'test'
)

if (-not $SkipFront) {
  Invoke-Step -Label 'Front checks, unit tests, and build' -WorkingDirectory $frontDir -CommandPath $pnpmCmd -Arguments @('run', 'test')
}

if (-not $SkipAdmin) {
  Invoke-Step -Label 'Admin checks, unit tests, and build' -WorkingDirectory $adminDir -CommandPath $pnpmCmd -Arguments @('run', 'test')
}

Write-Host ''
Write-Host 'quality-gate-ci: all requested checks passed.'
