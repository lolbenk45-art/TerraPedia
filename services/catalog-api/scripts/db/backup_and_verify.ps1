param(
  [string]$DbHost = '127.0.0.1',
  [int]$DbPort = 3306,
  [Parameter(Mandatory = $true)]
  [string]$Database,
  [Parameter(Mandatory = $true)]
  [string]$Username,
  [string]$Password = '',
  [string]$OutputRoot = '',
  [string]$MysqlDumpPath = '',
  [string]$MysqlPath = '',
  [string]$OperatorName = $env:USERNAME
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

function Resolve-Executable([string]$ExplicitPath, [string]$CommandName) {
  if ($ExplicitPath -and (Test-Path $ExplicitPath)) {
    return (Resolve-Path $ExplicitPath).Path
  }

  $cmd = Get-Command $CommandName -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  throw "Unable to locate executable: $CommandName. Pass -${CommandName}Path explicitly."
}

function Run-CheckedCommand([string]$FilePath, [string[]]$ArgumentList, [string]$OutputPath) {
  $stderrPath = "$OutputPath.stderr"
  Remove-Item $OutputPath, $stderrPath -Force -ErrorAction SilentlyContinue
  $process = Start-Process -FilePath $FilePath `
    -ArgumentList $ArgumentList `
    -NoNewWindow `
    -Wait `
    -PassThru `
    -RedirectStandardOutput $OutputPath `
    -RedirectStandardError $stderrPath
  if ($process.ExitCode -ne 0) {
    throw "Command failed: $FilePath $($ArgumentList -join ' ')"
  }
}

function Write-Utf8Json([string]$Path, $Value) {
  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  $Value | ConvertTo-Json -Depth 12 | Out-File -FilePath $Path -Encoding utf8
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
  $OutputRoot = Join-Path $repoRoot 'reports\db-backup'
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $OutputRoot "$Database-$timestamp"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$mysqlDump = Resolve-Executable -ExplicitPath $MysqlDumpPath -CommandName 'mysqldump'
$mysql = Resolve-Executable -ExplicitPath $MysqlPath -CommandName 'mysql'

$gitBranch = (& git -C $repoRoot branch --show-current).Trim()
$gitCommit = (& git -C $repoRoot rev-parse HEAD).Trim()
$gitStatus = (& git -C $repoRoot status --short --branch) -join [Environment]::NewLine

$passwordArgs = @()
if ($Password -ne '') {
  $passwordArgs = @("--password=$Password")
}

$baseArgs = @(
  "--host=$DbHost",
  "--port=$DbPort",
  "--user=$Username"
) + $passwordArgs

$schemaFile = Join-Path $backupDir 'schema.sql'
$fullDumpFile = Join-Path $backupDir 'full.sql'
$itemsDumpFile = Join-Path $backupDir 'items.sql'
$categoryDumpFile = Join-Path $backupDir 'category.sql'
$flywayDumpFile = Join-Path $backupDir 'flyway_schema_history.sql'
$rowCountFile = Join-Path $backupDir 'row-counts.tsv'
$gitContextFile = Join-Path $backupDir 'git-context.txt'
$manifestFile = Join-Path $backupDir 'manifest.json'
$checksumsFile = Join-Path $backupDir 'checksums.txt'

Run-CheckedCommand -FilePath $mysqlDump -ArgumentList ($baseArgs + @('--single-transaction', '--routines', '--triggers', '--no-data', $Database)) -OutputPath $schemaFile
Run-CheckedCommand -FilePath $mysqlDump -ArgumentList ($baseArgs + @('--single-transaction', '--routines', '--triggers', $Database)) -OutputPath $fullDumpFile
Run-CheckedCommand -FilePath $mysqlDump -ArgumentList ($baseArgs + @('--single-transaction', $Database, 'items')) -OutputPath $itemsDumpFile
Run-CheckedCommand -FilePath $mysqlDump -ArgumentList ($baseArgs + @('--single-transaction', $Database, 'category')) -OutputPath $categoryDumpFile

try {
  Run-CheckedCommand -FilePath $mysqlDump -ArgumentList ($baseArgs + @('--single-transaction', $Database, 'flyway_schema_history')) -OutputPath $flywayDumpFile
} catch {
  "flyway_schema_history not found or dump failed." | Out-File -FilePath $flywayDumpFile -Encoding utf8
}

$rowCountSql = @"
SELECT 'items' AS table_name, COUNT(*) AS row_count FROM items
UNION ALL
SELECT 'category' AS table_name, COUNT(*) AS row_count FROM category
UNION ALL
SELECT 'flyway_schema_history' AS table_name, COUNT(*) AS row_count FROM flyway_schema_history;
"@

try {
  $rowCountArgs = $baseArgs + @('--batch', '--raw', '--skip-column-names', $Database, '-e', $rowCountSql)
  $rowCounts = & $mysql @rowCountArgs 2>&1
  $rowCounts | Out-File -FilePath $rowCountFile -Encoding utf8
} catch {
  "row count query failed: $($_.Exception.Message)" | Out-File -FilePath $rowCountFile -Encoding utf8
}

@(
  "branch=$gitBranch"
  "commit=$gitCommit"
  "repo=$repoRoot"
  "database=$Database"
  "generatedAt=$([DateTime]::UtcNow.ToString('o'))"
  "operator=$OperatorName"
) + @('', $gitStatus) | Out-File -FilePath $gitContextFile -Encoding utf8

$files = Get-ChildItem $backupDir -File | Sort-Object Name
$checksums = foreach ($file in $files) {
  $hash = Get-FileHash -Algorithm SHA256 -Path $file.FullName
  [PSCustomObject]@{
    file = $file.Name
    size = $file.Length
    sha256 = $hash.Hash
  }
}

$checksums |
  ForEach-Object { "$($_.sha256)  $($_.file)" } |
  Out-File -FilePath $checksumsFile -Encoding ascii

$manifest = [PSCustomObject]@{
  generatedAt = [DateTime]::UtcNow.ToString('o')
  operator = $OperatorName
  database = $Database
  host = $DbHost
  port = $DbPort
  backupDir = $backupDir
  repoRoot = $repoRoot
  gitBranch = $gitBranch
  gitCommit = $gitCommit
  files = $checksums
}

Write-Utf8Json -Path $manifestFile -Value $manifest

Write-Host "Backup completed: $backupDir"
Write-Host "Manifest: $manifestFile"
Write-Host "Checksums: $checksumsFile"
