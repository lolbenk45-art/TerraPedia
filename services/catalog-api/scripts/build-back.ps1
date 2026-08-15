$ErrorActionPreference = "Stop"

# 可自定义本地 Maven 仓库路径，默认使用 canonical service 目录内的 .m2/repository
$repoRoot = $null
$probe = [IO.DirectoryInfo]::new($PSScriptRoot)
while ($null -ne $probe) {
  if (Test-Path (Join-Path $probe.FullName 'scripts\config\project.constants.json')) {
    $repoRoot = $probe.FullName
    break
  }
  $probe = $probe.Parent
}
if ([string]::IsNullOrWhiteSpace($repoRoot)) {
  throw "Unable to resolve TerraPedia project root from $PSScriptRoot"
}
. (Join-Path $repoRoot 'scripts\lib\project-constants.ps1')
$serviceRoot = Get-TerraPediaApplicationPath -Application 'catalogApi'
$repo = $env:MAVEN_REPO_LOCAL
if ([string]::IsNullOrWhiteSpace($repo)) {
  $repo = Join-Path $serviceRoot '.m2\repository'
}

$logDir = $env:TERRAPEDIA_LOG_DIR
if ([string]::IsNullOrWhiteSpace($logDir)) {
  $logDir = Get-TerraPediaConstantPath -Key 'evidence.runtime' -Suffix @('catalog-api-build')
}
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "backend-build.log"

if ([string]::IsNullOrWhiteSpace($env:BACK_BUILD_JAVA_OPTS)) {
  $env:BACK_BUILD_JAVA_OPTS = "-Xms64m -Xmx256m -XX:MaxMetaspaceSize=128m -XX:+UseSerialGC"
}

Write-Host "Using MAVEN_OPTS repo local: $repo"
Write-Host "Using BACK_BUILD_JAVA_OPTS: $($env:BACK_BUILD_JAVA_OPTS)"
$env:MAVEN_OPTS = "-Dmaven.repo.local=$repo $($env:BACK_BUILD_JAVA_OPTS)"
$stderrFile = Join-Path $logDir "backend-build.stderr.log"
Remove-Item $logFile, $stderrFile -Force -ErrorAction SilentlyContinue
$process = Start-Process -FilePath "mvn.cmd" -ArgumentList "-DskipTests", "package" -WorkingDirectory $serviceRoot -NoNewWindow -Wait -PassThru -RedirectStandardOutput $logFile -RedirectStandardError $stderrFile
$exitCode = $process.ExitCode

Write-Host "Build log saved to $logFile"
if (Test-Path $logFile) {
  Get-Content $logFile
}
if (Test-Path $stderrFile) {
  Get-Content $stderrFile
}
if ($exitCode -ne 0) {
  throw "Backend build failed with exit code $exitCode"
}
