param(
  [string]$BackendBaseUrl,
  [string]$AdminBaseUrl,
  [switch]$SkipAuth
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$reportDir = Join-Path $repoRoot 'reports\local-start'
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$reportPath = Join-Path $reportDir "smoke-$timestamp.json"

$configCandidates = @(
  (Join-Path $PSScriptRoot 'config\local-stack.config.json'),
  (Join-Path $PSScriptRoot 'local-stack.config.json')
)
$configPath = $configCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$stackConfig = $null
if ($configPath -and (Test-Path $configPath)) {
  $stackConfig = Get-Content -Path $configPath -Raw | ConvertFrom-Json
}

function Get-ConfigValue([object]$Root, [string[]]$PathSegments) {
  $current = $Root
  foreach ($segment in $PathSegments) {
    if ($null -eq $current) {
      return $null
    }
    $property = $current.PSObject.Properties[$segment]
    if ($null -eq $property) {
      return $null
    }
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
      if (-not [string]::IsNullOrWhiteSpace($ConfigValue)) {
        return $ConfigValue
      }
    } else {
      return $ConfigValue
    }
  }
  return $Fallback
}

function Join-Url([string]$BaseUrl, [string]$Path) {
  return ("{0}{1}" -f $BaseUrl.TrimEnd('/'), $Path)
}

function Convert-SmokePreview([string]$Content, [bool]$Redact) {
  if ($Redact) {
    return '<redacted>'
  }
  return $Content.Substring(0, [Math]::Min(300, $Content.Length))
}

function Invoke-SmokeRequest([string]$Name, [string]$Method, [string]$Url, [object]$Body = $null, [hashtable]$Headers = @{}, [switch]$RedactPreview) {
  $entry = [ordered]@{
    name = $Name
    method = $Method
    url = $Url
    ok = $false
    status = $null
    preview = $null
  }

  try {
    $request = @{
      Uri = $Url
      Method = $Method
      Headers = $Headers
      UseBasicParsing = $true
      TimeoutSec = 15
    }
    if ($null -ne $Body) {
      $request.ContentType = 'application/json'
      $request.Body = ($Body | ConvertTo-Json -Depth 8)
    }

    $response = Invoke-WebRequest @request
    $entry.status = [int]$response.StatusCode
    $entry.ok = $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
    $content = [string]$response.Content
    $entry.preview = Convert-SmokePreview -Content $content -Redact:$RedactPreview
  } catch {
    $entry.status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { $null }
    $entry.preview = $_.Exception.Message
  }

  return $entry
}

function Invoke-SmokeLogin([string]$Url, [string]$Username, [string]$Password) {
  $entry = [ordered]@{
    name = 'auth.login'
    method = 'Post'
    url = $Url
    ok = $false
    status = $null
    preview = '<redacted>'
  }
  $token = $null

  try {
    $response = Invoke-WebRequest `
      -Uri $Url `
      -Method Post `
      -ContentType 'application/json' `
      -Body (@{ username = $Username; password = $Password } | ConvertTo-Json -Depth 8) `
      -UseBasicParsing `
      -TimeoutSec 15
    $entry.status = [int]$response.StatusCode
    $entry.ok = $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
    if ($entry.ok) {
      $payload = ([string]$response.Content) | ConvertFrom-Json
      $token = [string]$payload.data.token
    }
  } catch {
    $entry.status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { $null }
    $entry.preview = '<redacted>'
  }

  return @{
    entry = $entry
    token = $token
  }
}

$backPort = [int](Resolve-Setting 'APP_PORT' (Get-ConfigValue $stackConfig @('backend', 'port')) 18088)
$adminPort = [int](Resolve-Setting 'TERRAPEDIA_ADMIN_PORT' (Get-ConfigValue $stackConfig @('admin', 'port')) 3001)
if ([string]::IsNullOrWhiteSpace($BackendBaseUrl)) {
  $BackendBaseUrl = "http://127.0.0.1:$backPort"
}
if ([string]::IsNullOrWhiteSpace($AdminBaseUrl)) {
  $AdminBaseUrl = "http://localhost:$adminPort"
}

$adminUsername = [string](Resolve-Setting 'TERRAPEDIA_ADMIN_USERNAME' (Get-ConfigValue $stackConfig @('auth', 'admin', 'username')) $null)
$adminPassword = [string](Resolve-Setting 'TERRAPEDIA_ADMIN_PASSWORD' (Get-ConfigValue $stackConfig @('auth', 'admin', 'password')) $null)
$results = @()

$results += Invoke-SmokeRequest -Name 'backend.items' -Method Get -Url (Join-Url $BackendBaseUrl '/api/items?page=1&limit=1')
$results += Invoke-SmokeRequest -Name 'backend.categories' -Method Get -Url (Join-Url $BackendBaseUrl '/api/categories')
$results += Invoke-SmokeRequest -Name 'admin.root' -Method Get -Url (Join-Url $AdminBaseUrl '/')
$results += Invoke-SmokeRequest -Name 'admin.proxy.items' -Method Get -Url (Join-Url $AdminBaseUrl '/api/items?page=1&limit=1')

if (-not $SkipAuth -and -not [string]::IsNullOrWhiteSpace($adminUsername) -and -not [string]::IsNullOrWhiteSpace($adminPassword)) {
  $login = Invoke-SmokeLogin -Url (Join-Url $BackendBaseUrl '/api/auth/login') -Username $adminUsername -Password $adminPassword
  $results += $login.entry
  $token = [string]$login.token

  if (-not [string]::IsNullOrWhiteSpace($token)) {
    $authHeaders = @{ Authorization = "Bearer $token" }
    $results += Invoke-SmokeRequest -Name 'auth.me' -Method Get -Url (Join-Url $BackendBaseUrl '/api/auth/me') -Headers $authHeaders
    $results += Invoke-SmokeRequest -Name 'admin.acceptance.dataSource' -Method Get -Url (Join-Url $BackendBaseUrl '/api/admin/data-source-acceptance/overview') -Headers $authHeaders
    $results += Invoke-SmokeRequest -Name 'admin.acceptance.domain' -Method Get -Url (Join-Url $BackendBaseUrl '/api/admin/domain-acceptance/overview') -Headers $authHeaders
  }
}

$summary = [ordered]@{
  timestamp = $timestamp
  backendBaseUrl = $BackendBaseUrl
  adminBaseUrl = $AdminBaseUrl
  total = $results.Count
  passed = @($results | Where-Object { $_.ok }).Count
  failed = @($results | Where-Object { -not $_.ok }).Count
  results = $results
}

$summary | ConvertTo-Json -Depth 8 | Set-Content -Path $reportPath -Encoding utf8
Write-Host "smoke report: $reportPath"
Write-Host ("passed={0} failed={1}" -f $summary.passed, $summary.failed)

if ($summary.failed -gt 0) {
  exit 1
}
