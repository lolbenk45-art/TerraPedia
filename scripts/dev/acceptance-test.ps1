<#
.SYNOPSIS
  Real-environment smoke-structure test for TerraPedia P0-P2 deliverable scripts.
  No DB writes, no --apply. Writes local report artifacts (JSON, markdown, JSONL).
.DESCRIPTION
  Runs up to 19 smoke-structure steps across two phases:
    Phase 1 (no DB): B1 compliance (4 domains), freshness audit, refresh plan,
      staleness alert, crawler layout, canonical candidates & consistency,
      chained audit-to-plan-to-alert pipeline (13 steps max).
    Phase 2 (DB required): lineage trace (item + npc), image lineage,
      cross-db integrity, reresolve candidates, reresolve dry-run (6 steps).
  Each step validates JSON structure (top-level keys) AND rejects a top-level
  status/overallStatus value of "blocked". Deeper content assertions depend on
  live data and are out of scope.
  Exit code 0 = all run steps passed. Exit code 1 = at least one failure
    (including DB unavailable without -AllowDbSkip, or any blocked status).
.PARAMETER SkipDb
  Skip Phase 2 (all DB-required tests). Exits 0 even if DB is down.
.PARAMETER SkipNoDb
  Skip Phase 1 (all non-DB tests).
.PARAMETER AllowDbSkip
  When DB is unreachable, skip DB steps instead of failing. Without this flag,
  an unreachable DB causes Phase 2 steps to FAIL (exit 1).
.PARAMETER DbHost
  Database host for TCP preflight and env override (default 127.0.0.1).
.PARAMETER DbPort
  Database port for TCP preflight and env override (default 3306).
.PARAMETER SharedDataRoot
  Path to shared data root for canonical scripts. Defaults to <repoRoot>\..\data\terraPedia.
#>

param(
  [switch]$SkipDb,
  [switch]$SkipNoDb,
  [switch]$AllowDbSkip,
  [string]$DbHost = '127.0.0.1',
  [int]$DbPort = 3306,
  [string]$SharedDataRoot
)

$ErrorActionPreference = 'Continue'

# ---------------------------------------------------------------------------
# 1. Resolve paths and config
# ---------------------------------------------------------------------------
$scriptDir = $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $scriptDir '..\..')).Path
$configCandidates = @(
  (Join-Path $scriptDir 'config\local-stack.config.json'),
  (Join-Path $scriptDir 'local-stack.config.json')
)
$configPath = $configCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$stackConfig = $null
if ($configPath -and (Test-Path $configPath)) {
  try {
    $stackConfig = Get-Content -Path $configPath -Raw | ConvertFrom-Json
  } catch { }
}

$reportsDir = Join-Path $repoRoot 'reports'
$acceptanceDir = Join-Path $reportsDir 'acceptance-test'
New-Item -ItemType Directory -Force -Path $acceptanceDir | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$summaryPath = Join-Path $reportsDir "acceptance-test-$timestamp.json"
$nowIso = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')

if (-not $SharedDataRoot) {
  $candidate = Join-Path (Split-Path $repoRoot -Parent) 'data\terraPedia'
  $SharedDataRoot = if (Test-Path $candidate) { (Resolve-Path $candidate).Path } else { $candidate }
}

function Resolve-RequiredCommand([string]$PreferredPath, [string]$CommandName) {
  if (-not [string]::IsNullOrWhiteSpace($PreferredPath) -and (Test-Path $PreferredPath)) {
    return $PreferredPath
  }
  return (Get-Command $CommandName -ErrorAction Stop).Source
}

$nodeCmd = Resolve-RequiredCommand -PreferredPath $null -CommandName 'node.exe'

# ---------------------------------------------------------------------------
# 2. Helpers
# ---------------------------------------------------------------------------

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

function Resolve-Setting([string]$EnvName, [object]$ConfigValue, [object]$Fallback) {
  $envValue = [Environment]::GetEnvironmentVariable($EnvName)
  if ($null -ne $envValue -and -not [string]::IsNullOrWhiteSpace([string]$envValue)) {
    return $envValue
  }
  if ($null -ne $ConfigValue) {
    if ($ConfigValue -is [string]) {
      if (-not [string]::IsNullOrWhiteSpace($ConfigValue)) { return $ConfigValue }
    } else {
      return $ConfigValue
    }
  }
  return $Fallback
}

function Test-LocalTcpPort([string]$HostName, [int]$Port, [int]$TimeoutMs = 2000) {
  $client = $null
  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $connect = $client.BeginConnect($HostName, $Port, $null, $null)
    $ok = $connect.AsyncWaitHandle.WaitOne($TimeoutMs)
    if ($ok -and $client.Connected) {
      $client.EndConnect($connect) | Out-Null
      return $true
    }
    return $false
  } catch {
    return $false
  } finally {
    if ($client) { $client.Dispose() }
  }
}

function Get-DbEnvVars {
  $host = [string](Resolve-Setting 'TERRAPEDIA_DB_HOST' (Get-ConfigValue $stackConfig @('database', 'host')) $DbHost)
  $port = [int](Resolve-Setting 'TERRAPEDIA_DB_PORT' (Get-ConfigValue $stackConfig @('database', 'port')) $DbPort)
  $user = [string](Resolve-Setting 'TERRAPEDIA_DB_USERNAME' (Get-ConfigValue $stackConfig @('database', 'username')) 'root')
  $pass = [string](Resolve-Setting 'TERRAPEDIA_DB_PASSWORD' (Get-ConfigValue $stackConfig @('database', 'password')) 'root')
  return @{ Host = $host; Port = $port; Username = $user; Password = $pass }
}

function Assert-JsonKeys([string]$Json, [string[]]$Keys, [string]$StepId) {
  $parsed = $null
  try {
    $parsed = $Json | ConvertFrom-Json
  } catch {
    throw "stdout is not valid JSON: $_"
  }
  $missing = @()
  foreach ($key in $Keys) {
    if ($null -eq $parsed.PSObject.Properties[$key]) {
      $missing += $key
    }
  }
  if ($missing.Count -gt 0) {
    throw "Missing expected top-level keys: $($missing -join ', ')"
  }
  return $parsed
}

function Get-StatusSummary([object]$Parsed) {
  $status = if ($Parsed.status) { $Parsed.status }
            elseif ($Parsed.overallStatus) { $Parsed.overallStatus }
            else { 'unknown' }
  $parts = @("status=$status")
  if ($Parsed.summary) {
    foreach ($prop in $Parsed.summary.PSObject.Properties) {
      $parts += "$($prop.Name)=$($prop.Value)"
    }
  }
  $summary = $parts -join ', '
  if ($summary.Length -gt 140) { $summary = $summary.Substring(0, 140) + '...' }
  return $summary
}

# ---------------------------------------------------------------------------
# 3. Result tracking
# ---------------------------------------------------------------------------
$script:results = [System.Collections.ArrayList]::new()

function Add-Result {
  param([string]$StepId, [string]$Phase, [string]$ScriptPath, [string]$Status,
        [double]$Duration, [int]$ExitCode, [string]$Message, [string[]]$KeyAssertions)
  [void]$script:results.Add([PSCustomObject]@{
    id = $StepId
    phase = $Phase
    script = $ScriptPath
    status = $Status
    durationSeconds = [math]::Round($Duration, 2)
    exitCode = $ExitCode
    message = $Message
    keyAssertions = $KeyAssertions ?? @()
  })
}

function Write-StepLine([string]$Status, [string]$StepId, [string]$Message, [double]$Duration) {
  $color = switch ($Status) { 'pass' { 'Green' } 'fail' { 'Red' } 'skip' { 'Yellow' } default { 'White' } }
  $tag = $Status.ToUpper()
  Write-Host "[$tag] $StepId — $Message ($([math]::Round($Duration, 1))s)" -ForegroundColor $color
}

function Invoke-AcceptanceStep {
  param(
    [string]$StepId,
    [string]$Phase,
    [string]$ScriptPath,
    [string[]]$Arguments,
    [string[]]$KeyAssertions,
    [string]$OutputPath
  )

  $fullScriptPath = Join-Path $repoRoot $ScriptPath
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $exitCode = -1
  $errorMsg = ''

  try {
    $output = & $nodeCmd $fullScriptPath @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    $sw.Stop()
    $duration = $sw.Elapsed.TotalSeconds

    $stdout = ($output | Where-Object { $_ -is [string] } | Out-String).Trim()
    if (-not $stdout) {
      Add-Result -StepId $StepId -Phase $Phase -ScriptPath $ScriptPath -Status 'fail' -Duration $duration -ExitCode $exitCode -Message 'No stdout output' -KeyAssertions $KeyAssertions
      Write-StepLine 'fail' $StepId 'No stdout output' $duration
      return
    }

    $parsed = Assert-JsonKeys -Json $stdout -Keys $KeyAssertions -StepId $StepId
    $summary = Get-StatusSummary -Parsed $parsed

    if ($exitCode -ne 0) {
      Add-Result -StepId $StepId -Phase $Phase -ScriptPath $ScriptPath -Status 'fail' -Duration $duration -ExitCode $exitCode -Message "exit code $exitCode" -KeyAssertions $KeyAssertions
      Write-StepLine 'fail' $StepId "exit code $exitCode" $duration
      return
    }

    # Reject blocked status: an acceptance step must not report blocked
    $topStatus = if ($parsed.status) { [string]$parsed.status } elseif ($parsed.overallStatus) { [string]$parsed.overallStatus } else { '' }
    if ($topStatus -eq 'blocked') {
      Add-Result -StepId $StepId -Phase $Phase -ScriptPath $ScriptPath -Status 'fail' -Duration $duration -ExitCode 0 -Message "status=blocked — acceptance gate is not passing" -KeyAssertions $KeyAssertions
      Write-StepLine 'fail' $StepId 'status=blocked — acceptance gate is not passing' $duration
      return
    }

    # Write output to file if requested (for chain steps)
    if ($OutputPath) {
      try {
        $parentDir = Split-Path $OutputPath -Parent
        if (-not (Test-Path $parentDir)) {
          New-Item -ItemType Directory -Force -Path $parentDir | Out-Null
        }
        $stdout | Set-Content -Path $OutputPath -Encoding utf8
      } catch {
        Write-Host "  WARNING: failed to write output to $OutputPath : $_" -ForegroundColor Yellow
      }
    }

    Add-Result -StepId $StepId -Phase $Phase -ScriptPath $ScriptPath -Status 'pass' -Duration $duration -ExitCode 0 -Message $summary -KeyAssertions $KeyAssertions
    Write-StepLine 'pass' $StepId $summary $duration
  } catch {
    $sw.Stop()
    $duration = $sw.Elapsed.TotalSeconds
    $errorMsg = $_.Exception.Message
    Add-Result -StepId $StepId -Phase $Phase -ScriptPath $ScriptPath -Status 'fail' -Duration $duration -ExitCode $exitCode -Message $errorMsg -KeyAssertions $KeyAssertions
    Write-StepLine 'fail' $StepId $errorMsg $duration
  }
}

function Skip-Step {
  param([string]$StepId, [string]$Phase, [string]$ScriptPath, [string]$Reason)
  Add-Result -StepId $StepId -Phase $Phase -ScriptPath $ScriptPath -Status 'skip' -Duration 0 -ExitCode 0 -Message $Reason
  Write-StepLine 'skip' $StepId $Reason 0
}

# ---------------------------------------------------------------------------
# 4. DB availability check
# ---------------------------------------------------------------------------
$dbAvailable = $false
$dbEnv = Get-DbEnvVars

if (-not $SkipDb) {
  Write-Host ''
  Write-Host '===================================================================' -ForegroundColor Cyan
  Write-Host '  DB TCP Preflight' -ForegroundColor Cyan
  Write-Host '===================================================================' -ForegroundColor Cyan
  Write-Host "target: $($dbEnv.Host):$($dbEnv.Port)"

  if (Test-LocalTcpPort -HostName $dbEnv.Host -Port $dbEnv.Port -TimeoutMs 2000) {
    $dbAvailable = $true
    Write-Host 'Result: reachable' -ForegroundColor Green
  } else {
    Write-Host 'Result: NOT reachable — Phase 2 (DB) will be skipped' -ForegroundColor Yellow
  }
}

# ===========================================================================
# PHASE 1: No-DB Tests
# ===========================================================================
if (-not $SkipNoDb) {
  Write-Host ''
  Write-Host '===================================================================' -ForegroundColor Cyan
  Write-Host '  PHASE 1: No-DB Tests (13 steps)' -ForegroundColor Cyan
  Write-Host '===================================================================' -ForegroundColor Cyan

  # 1-4: B1 Exemption Compliance (4 support domains)
  $b1Script = 'scripts/data/audit/b1-exemption-compliance.mjs'
  $b1Keys = @('generatedAt', 'domainId', 'panelId', 'status', 'summary', 'checks')
  $b1Domains = @(
    @{Id='b1-recipe'; Domain='support.recipe'},
    @{Id='b1-shimmer'; Domain='support.shimmer'},
    @{Id='b1-item_group'; Domain='support.item_group'},
    @{Id='b1-town_npc'; Domain='support.town_npc_maintenance'}
  )

  foreach ($entry in $b1Domains) {
    Invoke-AcceptanceStep -StepId $entry.Id -Phase 'no-db' -ScriptPath $b1Script `
      -Arguments @("--domain=$($entry.Domain)", "--generated-at=$nowIso", "--repo-root=$repoRoot") `
      -KeyAssertions $b1Keys
  }

  # 5: Domain acceptance freshness audit
  Invoke-AcceptanceStep -StepId 'freshness-audit' -Phase 'no-db' `
    -ScriptPath 'scripts/data/workflow/domain-acceptance-freshness-audit.mjs' `
    -Arguments @("--repo-root=$repoRoot", "--generated-at=$nowIso") `
    -KeyAssertions @('generatedAt', 'overallStatus', 'summary', 'panels')

  # 6: Domain acceptance refresh plan
  Invoke-AcceptanceStep -StepId 'refresh-plan' -Phase 'no-db' `
    -ScriptPath 'scripts/data/workflow/domain-acceptance-refresh-plan.mjs' `
    -Arguments @("--repo-root=$repoRoot", "--generated-at=$nowIso") `
    -KeyAssertions @('generatedAt', 'overallStatus', 'summary', 'actions')

  # 7: Staleness alert issue (stdout-only, no file writes)
  Invoke-AcceptanceStep -StepId 'staleness-alert' -Phase 'no-db' `
    -ScriptPath 'scripts/data/workflow/create-staleness-alert-issue.mjs' `
    -Arguments @("--generated-at=$nowIso") `
    -KeyAssertions @('generatedAt', 'shouldCreateIssue', 'title', 'historyEntry')

  # 8: Crawler source layout check (library — invoke via temp .mjs wrapper)
  $crawlerWrapperPath = Join-Path $acceptanceDir "crawler-layout-wrapper-$timestamp.mjs"
  @"
import { checkCrawlerSourceLayout } from '../../scripts/data/crawler/source-layout-check.mjs';
console.log(JSON.stringify(checkCrawlerSourceLayout(), null, 2));
"@ | Set-Content -Path $crawlerWrapperPath -Encoding utf8

  Invoke-AcceptanceStep -StepId 'crawler-layout' -Phase 'no-db' `
    -ScriptPath "reports/acceptance-test/crawler-layout-wrapper-$timestamp.mjs" `
    -Arguments @() `
    -KeyAssertions @('status', 'blocking', 'warnings')

  # 9: Canonical candidate generation
  Invoke-AcceptanceStep -StepId 'canonical-candidates' -Phase 'no-db' `
    -ScriptPath 'scripts/data/canonical/generate-canonical-candidates.mjs' `
    -Arguments @("--repo-root=$repoRoot", "--shared-data-root=$SharedDataRoot") `
    -KeyAssertions @('domain', 'generatedAt', 'summary', 'artifactPaths')

  # 10: Canonical consistency audit (chained from step 9)
  $candidatesFile = Join-Path $repoRoot 'reports\canonical\candidates\item\canonical-candidates.json'
  if (Test-Path $candidatesFile) {
    Invoke-AcceptanceStep -StepId 'canonical-consistency' -Phase 'no-db' `
      -ScriptPath 'scripts/data/canonical/audit-canonical-consistency.mjs' `
      -Arguments @("--repo-root=$repoRoot", "--shared-data-root=$SharedDataRoot", "--input=$candidatesFile") `
      -KeyAssertions @('domain', 'generatedAt', 'summary', 'reportPath')
  } else {
    Skip-Step -StepId 'canonical-consistency' -Phase 'no-db' `
      -ScriptPath 'scripts/data/canonical/audit-canonical-consistency.mjs' `
      -Reason "candidates file not found (step 9 may have failed): $candidatesFile"
  }

  # 11-13: Chained audit-to-plan-to-alert pipeline (all use Invoke-AcceptanceStep)
  $chainAuditFile = Join-Path $acceptanceDir "freshness-audit-$timestamp.json"
  $chainPlanFile = Join-Path $acceptanceDir "refresh-plan-$timestamp.json"

  # 11: Chain — freshness audit (writes stdout to temp file for downstream steps)
  Invoke-AcceptanceStep -StepId 'chain-freshness-audit' -Phase 'no-db' `
    -ScriptPath 'scripts/data/workflow/domain-acceptance-freshness-audit.mjs' `
    -Arguments @("--repo-root=$repoRoot", "--generated-at=$nowIso") `
    -KeyAssertions @('generatedAt', 'overallStatus', 'summary', 'panels') `
    -OutputPath $chainAuditFile

  if (Test-Path $chainAuditFile) {
    # 12: Chain — refresh plan from file (writes stdout to temp file for downstream steps)
    Invoke-AcceptanceStep -StepId 'chain-refresh-plan' -Phase 'no-db' `
      -ScriptPath 'scripts/data/workflow/domain-acceptance-refresh-plan.mjs' `
      -Arguments @("--repo-root=$repoRoot", "--generated-at=$nowIso", "--audit=$chainAuditFile") `
      -KeyAssertions @('generatedAt', 'overallStatus', 'summary', 'actions') `
      -OutputPath $chainPlanFile

    # 13: Chain — staleness alert from chained files
    if (Test-Path $chainPlanFile) {
      Invoke-AcceptanceStep -StepId 'chain-staleness-alert' -Phase 'no-db' `
        -ScriptPath 'scripts/data/workflow/create-staleness-alert-issue.mjs' `
        -Arguments @("--generated-at=$nowIso", "--audit=$chainAuditFile", "--plan=$chainPlanFile", "--body-path=$acceptanceDir\staleness-alert-$timestamp.md", "--history-path=$acceptanceDir\staleness-history-$timestamp.jsonl") `
        -KeyAssertions @('generatedAt', 'shouldCreateIssue', 'title', 'bodyPath', 'historyPath', 'historyEntry')
    } else {
      Skip-Step -StepId 'chain-staleness-alert' -Phase 'no-db' `
        -ScriptPath 'scripts/data/workflow/create-staleness-alert-issue.mjs' `
        -Reason 'refresh plan temp file not found (chain-refresh-plan may have failed)'
    }
  } else {
    Skip-Step -StepId 'chain-refresh-plan' -Phase 'no-db' `
      -ScriptPath 'scripts/data/workflow/domain-acceptance-refresh-plan.mjs' `
      -Reason 'audit temp file not found (chain-freshness-audit may have failed)'

    Skip-Step -StepId 'chain-staleness-alert' -Phase 'no-db' `
      -ScriptPath 'scripts/data/workflow/create-staleness-alert-issue.mjs' `
      -Reason 'audit temp file not found (chain-freshness-audit may have failed)'
  }
}

# ===========================================================================
# PHASE 2: DB-Required Tests
# ===========================================================================
if (-not $SkipDb) {
  Write-Host ''
  Write-Host '===================================================================' -ForegroundColor Cyan
  Write-Host '  PHASE 2: DB-Required Tests (6 steps)' -ForegroundColor Cyan
  Write-Host '===================================================================' -ForegroundColor Cyan

  if (-not $dbAvailable) {
    if ($AllowDbSkip) {
      $dbSkipScripts = @(
        @{Id='lineage-trace-item'; Script='scripts/data/audit/record-lineage-trace.mjs'},
        @{Id='lineage-trace-npc'; Script='scripts/data/audit/record-lineage-trace.mjs'},
        @{Id='image-source-lineage'; Script='scripts/data/audit/image-source-lineage-report.mjs'},
        @{Id='cross-db-integrity'; Script='scripts/data/audit/cross-db-referential-integrity.mjs'},
        @{Id='reresolve-candidates'; Script='scripts/data/relation/generate-reresolve-candidates.mjs'},
        @{Id='reresolve-dry-run'; Script='scripts/data/relation/apply-reresolve-results.mjs'}
      )
      foreach ($entry in $dbSkipScripts) {
        Skip-Step -StepId $entry.Id -Phase 'db' -ScriptPath $entry.Script -Reason 'DB not available (-AllowDbSkip set)'
      }
    } else {
      $dbFailScripts = @(
        @{Id='lineage-trace-item'; Script='scripts/data/audit/record-lineage-trace.mjs'},
        @{Id='lineage-trace-npc'; Script='scripts/data/audit/record-lineage-trace.mjs'},
        @{Id='image-source-lineage'; Script='scripts/data/audit/image-source-lineage-report.mjs'},
        @{Id='cross-db-integrity'; Script='scripts/data/audit/cross-db-referential-integrity.mjs'},
        @{Id='reresolve-candidates'; Script='scripts/data/relation/generate-reresolve-candidates.mjs'},
        @{Id='reresolve-dry-run'; Script='scripts/data/relation/apply-reresolve-results.mjs'}
      )
      foreach ($entry in $dbFailScripts) {
        Add-Result -StepId $entry.Id -Phase 'db' -ScriptPath $entry.Script -Status 'fail' -Duration 0 -ExitCode -1 -Message 'DB not available (use -AllowDbSkip to permit skipping)'
        Write-StepLine 'fail' $entry.Id 'DB not available (use -AllowDbSkip to permit skipping)' 0
      }
    }
  } else {
    # Set env vars for scripts that read them directly
    $env:TERRAPEDIA_DB_HOST = $dbEnv.Host
    $env:TERRAPEDIA_DB_PORT = [string]$dbEnv.Port
    $env:TERRAPEDIA_DB_USERNAME = $dbEnv.Username
    $env:TERRAPEDIA_DB_PASSWORD = $dbEnv.Password

    # 14: Record lineage trace (item)
    Invoke-AcceptanceStep -StepId 'lineage-trace-item' -Phase 'db' `
      -ScriptPath 'scripts/data/audit/record-lineage-trace.mjs' `
      -Arguments @('--entity=item', '--internal-name=Wood') `
      -KeyAssertions @('generatedAt', 'entity', 'lookup', 'databases', 'stages')

    # 15: Record lineage trace (npc)
    Invoke-AcceptanceStep -StepId 'lineage-trace-npc' -Phase 'db' `
      -ScriptPath 'scripts/data/audit/record-lineage-trace.mjs' `
      -Arguments @('--entity=npc', '--internal-name=Guide') `
      -KeyAssertions @('generatedAt', 'entity', 'lookup', 'databases', 'stages')

    # 16: Image source lineage report
    Invoke-AcceptanceStep -StepId 'image-source-lineage' -Phase 'db' `
      -ScriptPath 'scripts/data/audit/image-source-lineage-report.mjs' `
      -Arguments @("--source=db", "--generated-at=$nowIso") `
      -KeyAssertions @('generatedAt', 'contractVersion', 'summary', 'entities')

    # 17: Cross-db referential integrity (quick mode)
    Invoke-AcceptanceStep -StepId 'cross-db-integrity' -Phase 'db' `
      -ScriptPath 'scripts/data/audit/cross-db-referential-integrity.mjs' `
      -Arguments @('--mode=quick', '--write-report=true', "--generated-at=$nowIso") `
      -KeyAssertions @('generatedAt', 'mode', 'summary', 'checks')

    # 18: Generate reresolve candidates
    Invoke-AcceptanceStep -StepId 'reresolve-candidates' -Phase 'db' `
      -ScriptPath 'scripts/data/relation/generate-reresolve-candidates.mjs' `
      -Arguments @('--relation-database=terria_v1_relation', '--write-report=true', "--generated-at=$nowIso") `
      -KeyAssertions @('generatedAt', 'summary', 'trend', 'candidates')

    # 19: Apply reresolve results DRY-RUN (no --apply, no --confirmed-candidates)
    Invoke-AcceptanceStep -StepId 'reresolve-dry-run' -Phase 'db' `
      -ScriptPath 'scripts/data/relation/apply-reresolve-results.mjs' `
      -Arguments @('--relation-database=terria_v1_relation', "--generated-at=$nowIso") `
      -KeyAssertions @('generatedAt', 'apply', 'summary')
  }
}

# ===========================================================================
# SUMMARY
# ===========================================================================
$totalSteps = $script:results.Count
$passedCount = ($script:results | Where-Object { $_.status -eq 'pass' }).Count
$failedCount = ($script:results | Where-Object { $_.status -eq 'fail' }).Count
$skippedCount = ($script:results | Where-Object { $_.status -eq 'skip' }).Count
$totalDuration = [math]::Round(($script:results | Measure-Object -Property durationSeconds -Sum).Sum, 1)

Write-Host ''
Write-Host '===================================================================' -ForegroundColor Cyan
$summaryColor = if ($failedCount -gt 0) { 'Red' } else { 'Green' }
Write-Host "Results: $passedCount passed, $failedCount failed, $skippedCount skipped ($totalSteps total) in ${totalDuration}s" -ForegroundColor $summaryColor
Write-Host '===================================================================' -ForegroundColor Cyan

# Write summary JSON
$summary = [PSCustomObject]@{
  timestamp = $timestamp
  repoRoot = $repoRoot
  dbAvailable = $dbAvailable
  dbHost = $dbEnv.Host
  dbPort = $dbEnv.Port
  totalSteps = $totalSteps
  passed = $passedCount
  failed = $failedCount
  skipped = $skippedCount
  durationSeconds = $totalDuration
  steps = $script:results
}

$summary | ConvertTo-Json -Depth 6 | Set-Content -Path $summaryPath -Encoding utf8
Write-Host "Summary written to: $summaryPath"

if ($failedCount -gt 0) {
  exit 1
} else {
  exit 0
}
