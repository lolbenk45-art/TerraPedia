$ErrorActionPreference = "Stop"

$logDir = $env:TERRAPEDIA_LOG_DIR
if ([string]::IsNullOrWhiteSpace($logDir)) {
  $logDir = "G:\ClaudeCode\terraPedia\reports\2026-03-18-batch25"
}
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "admin-build.log"
$stderrFile = Join-Path $logDir "admin-build.stderr.log"
$tempDir = Join-Path (Get-Location).Path ".tmp"
$homeDir = Join-Path (Get-Location).Path ".home"
$appDataDir = Join-Path (Get-Location).Path ".appdata"
$localAppDataDir = Join-Path (Get-Location).Path ".localappdata"
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
New-Item -ItemType Directory -Force -Path $homeDir, $appDataDir, $localAppDataDir | Out-Null
$env:TEMP = $tempDir
$env:TMP = $tempDir
$env:HOME = $homeDir
$env:USERPROFILE = $homeDir
$env:APPDATA = $appDataDir
$env:LOCALAPPDATA = $localAppDataDir

$env:NODE_OPTIONS="--max-old-space-size=4096"
Remove-Item $logFile, $stderrFile -Force -ErrorAction SilentlyContinue
$process = Start-Process -FilePath "pnpm.cmd" -ArgumentList "run", "build" -WorkingDirectory (Get-Location).Path -NoNewWindow -Wait -PassThru -RedirectStandardOutput $logFile -RedirectStandardError $stderrFile
$exitCode = $process.ExitCode

Write-Host "Admin build log saved to $logFile"
if (Test-Path $logFile) {
  Get-Content $logFile
}
if (Test-Path $stderrFile) {
  Get-Content $stderrFile
}
if ($exitCode -ne 0) {
  throw "Admin build failed with exit code $exitCode"
}
