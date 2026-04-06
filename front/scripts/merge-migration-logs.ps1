param(
  [string]$BatchPattern = "*.md",
  [string]$SummaryName = "",
  [switch]$KeepLogs
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$batchesDir = Join-Path $projectRoot "migration/process-logs/batches"
$summariesDir = Join-Path $projectRoot "migration/process-logs/summaries"
$cleanupDir = Join-Path $projectRoot "migration/process-logs/cleanup"

if (!(Test-Path $batchesDir)) {
  throw "Batch log directory not found: $batchesDir"
}

New-Item -ItemType Directory -Force -Path $summariesDir, $cleanupDir | Out-Null

$batchFiles = Get-ChildItem -Path $batchesDir -Filter $BatchPattern | Sort-Object Name
if ($batchFiles.Count -eq 0) {
  throw "No batch logs matched pattern '$BatchPattern' in $batchesDir"
}

if ([string]::IsNullOrWhiteSpace($SummaryName)) {
  $SummaryName = "summary-$(Get-Date -Format yyyyMMdd-HHmmss).md"
}

$summaryPath = Join-Path $summariesDir $SummaryName

$summaryHeader = @(
  "# Migration Batch Summary",
  "",
  "Generated At: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
  "Source Pattern: $BatchPattern",
  "",
  "## Source Logs"
)

$summaryHeader += $batchFiles | ForEach-Object { "- $($_.Name)" }
$summaryHeader += ""

$summaryHeader | Set-Content -Encoding UTF8 $summaryPath

foreach ($file in $batchFiles) {
  Add-Content -Encoding UTF8 $summaryPath "---"
  Add-Content -Encoding UTF8 $summaryPath ""
  Add-Content -Encoding UTF8 $summaryPath "## $($file.Name)"
  Add-Content -Encoding UTF8 $summaryPath ""
  Get-Content $file.FullName | Add-Content -Encoding UTF8 $summaryPath
  Add-Content -Encoding UTF8 $summaryPath ""
}

$cleanupLogPath = Join-Path $cleanupDir ("cleanup-$(Get-Date -Format yyyyMMdd-HHmmss).log")
"Summary generated: $summaryPath" | Set-Content -Encoding UTF8 $cleanupLogPath

if (-not $KeepLogs) {
  foreach ($file in $batchFiles) {
    Remove-Item $file.FullName -Force
    "Removed batch log: $($file.FullName)" | Add-Content -Encoding UTF8 $cleanupLogPath
  }
} else {
  "KeepLogs switch enabled; no batch logs removed." | Add-Content -Encoding UTF8 $cleanupLogPath
}

Write-Output "Summary created: $summaryPath"
Write-Output "Cleanup record: $cleanupLogPath"
