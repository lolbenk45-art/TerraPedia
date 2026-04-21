param(
    [string]$ApiBase,
    [string]$ConfigPath = "scripts/dev/config/local-stack.config.json",
    [string]$OutputDir = "reports",
    [int]$PublicSamples = 12,
    [int]$AdminSamples = 10,
    [int]$WarmupCount = 1,
    [long]$BenchmarkItemId = 1
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http

if (-not (Test-Path $ConfigPath)) {
    throw "Missing config file: $ConfigPath"
}

$config = Get-Content -Path $ConfigPath -Raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($ApiBase)) {
    $backendPort = if ($config.backend.port) { [int]$config.backend.port } else { 18088 }
    $ApiBase = "http://127.0.0.1:$backendPort/api"
}
$ApiBase = $ApiBase.TrimEnd("/")

$reportTimestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportDateIso = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$jsonPath = Join-Path $OutputDir "api-read-perf-$reportTimestamp.json"
$mdPath = Join-Path $OutputDir "api-read-perf-$reportTimestamp.md"

$baseline = [ordered]@{
    item_recipe_tree = @{ avgMs = 733.95; p95Ms = 806.39 }
    items_list_100 = @{ avgMs = 153.29 }
    items_list_20 = @{ avgMs = 140.83 }
    items_suggestions = @{ avgMs = 35.35 }
    categories_items = @{ avgMs = 30.63 }
    public_item_aggregate_all = @{ avgMs = 27.56 }
    statistics_overview = @{ avgMs = 20.70 }
    item_recipes = @{ avgMs = 15.54 }
    public_item_aggregate_images = @{ avgMs = 3.47 }
    item_detail = @{ avgMs = 1.57 }
    admin_crafting_stations = @{ avgMs = 2446.82; p95Ms = 2644.70 }
    admin_item_recipe_tree = @{ avgMs = 745.59 }
    admin_recipe_groups = @{ avgMs = 414.53 }
    admin_npcs = @{ avgMs = 317.30 }
    admin_statistics_overview = @{ avgMs = 48.62 }
    admin_articles = @{ avgMs = 10.60 }
    admin_shimmer_overview = @{ avgMs = 5.80 }
}

$tiers = [ordered]@{
    P0 = @(
        "Public items list/detail/suggestions/category tree",
        "Public item aggregate",
        "Public and admin recipe tree",
        "Admin crafting stations"
    )
    P1 = @(
        "Admin recipe groups",
        "Admin NPC list",
        "Statistics overview endpoints",
        "Recipe list endpoints"
    )
    P2 = @(
        "Admin articles",
        "Admin shimmer overview"
    )
}

$optimizationNotes = @(
    "CategoryManagementService now serves cached category/path snapshots for item list, detail, and suggestions.",
    "ItemService reuses cached category path maps instead of rebuilding paths per request.",
    "RecipeTreeService caches grouped tree responses and recipe-group reference data with explicit invalidation on admin writes.",
    "AdminRecipeGroupController caches merged group snapshots and invalidates the recipe-tree cache after writes.",
    "AdminNpcController batches category, boss-group, and relation-count lookups and caches supplement JSON snapshots.",
    "AdminCraftingStationController now builds a timed read snapshot and performs one-pass station-to-recipe aggregation instead of repeated scans."
)

$residualRisks = @(
    "Current cold numbers are first-hit measurements inside this benchmark session, not a full JVM/process cold boot.",
    "The live runtime is non-standard: Redis is actually on 6379 while local-stack config still points to 6380.",
    "Items list and aggregate endpoints are now the warm-path hotspots; further gains likely require SQL/index or payload trimming work.",
    "Timed in-memory caches reduce latency sharply, but write paths must keep invalidation coverage accurate as admin modules expand."
)

$endpoints = @(
    [ordered]@{ key = "item_recipe_tree"; tier = "P0"; kind = "public"; path = "/items/$BenchmarkItemId/recipe-tree?maxDepth=3"; samples = $PublicSamples },
    [ordered]@{ key = "items_list_100"; tier = "P0"; kind = "public"; path = "/items?page=1&limit=100"; samples = $PublicSamples },
    [ordered]@{ key = "items_list_20"; tier = "P0"; kind = "public"; path = "/items?page=1&limit=20"; samples = $PublicSamples },
    [ordered]@{ key = "items_suggestions"; tier = "P0"; kind = "public"; path = "/items/suggestions?keyword=sword&limit=10"; samples = $PublicSamples },
    [ordered]@{ key = "categories_items"; tier = "P0"; kind = "public"; path = "/categories/items"; samples = $PublicSamples },
    [ordered]@{ key = "public_item_aggregate_all"; tier = "P0"; kind = "public"; path = "/public/items/$BenchmarkItemId/aggregate?include=images,sources,recipes"; samples = $PublicSamples },
    [ordered]@{ key = "statistics_overview"; tier = "P1"; kind = "public"; path = "/statistics/overview"; samples = $PublicSamples },
    [ordered]@{ key = "item_recipes"; tier = "P1"; kind = "public"; path = "/items/$BenchmarkItemId/recipes"; samples = $PublicSamples },
    [ordered]@{ key = "public_item_aggregate_images"; tier = "P0"; kind = "public"; path = "/public/items/$BenchmarkItemId/aggregate?include=images"; samples = $PublicSamples },
    [ordered]@{ key = "item_detail"; tier = "P0"; kind = "public"; path = "/items/$BenchmarkItemId"; samples = $PublicSamples },
    [ordered]@{ key = "admin_crafting_stations"; tier = "P0"; kind = "admin"; path = "/admin/crafting-stations?page=1&limit=20"; samples = $AdminSamples },
    [ordered]@{ key = "admin_item_recipe_tree"; tier = "P0"; kind = "admin"; path = "/admin/items/$BenchmarkItemId/recipe-tree?maxDepth=3"; samples = $AdminSamples },
    [ordered]@{ key = "admin_recipe_groups"; tier = "P1"; kind = "admin"; path = "/admin/recipe-groups"; samples = $AdminSamples },
    [ordered]@{ key = "admin_npcs"; tier = "P1"; kind = "admin"; path = "/admin/npcs?page=1&limit=20"; samples = $AdminSamples },
    [ordered]@{ key = "admin_statistics_overview"; tier = "P1"; kind = "admin"; path = "/statistics/admin/overview"; samples = $AdminSamples },
    [ordered]@{ key = "admin_articles"; tier = "P2"; kind = "admin"; path = "/admin/articles?page=1&limit=20"; samples = $AdminSamples },
    [ordered]@{ key = "admin_shimmer_overview"; tier = "P2"; kind = "admin"; path = "/admin/shimmer/overview"; samples = $AdminSamples }
)

function Invoke-Main {
    $clientHandler = New-Object System.Net.Http.HttpClientHandler
    $clientHandler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
    $client = [System.Net.Http.HttpClient]::new($clientHandler)
    $client.Timeout = [TimeSpan]::FromSeconds(60)

    try {
        $adminToken = Get-AdminToken -Client $client -ApiBase $ApiBase -Username $config.auth.admin.username -Password $config.auth.admin.password
        $results = @()

        foreach ($endpoint in $endpoints) {
            $headers = @{}
            if ($endpoint.kind -eq "admin") {
                $headers["Authorization"] = "Bearer $adminToken"
            }
            $results += Invoke-BenchmarkEndpoint -Client $client -ApiBase $ApiBase -Endpoint $endpoint -Headers $headers -WarmupCount $WarmupCount -Baseline $baseline
        }
    } finally {
        $client.Dispose()
    }

    $actualRedisPort = Get-ActualRedisPort
    $configRedisPort = if ($config.redis.port) { [int]$config.redis.port } else { $null }
    $apiUri = [Uri]$ApiBase
    $environment = [ordered]@{
        apiBase = $ApiBase
        reportGeneratedAt = $reportDateIso
        configPath = (Resolve-Path $ConfigPath).Path
        backendPort = $apiUri.Port
        redisConfiguredPort = $configRedisPort
        redisActualPort = $actualRedisPort
        runtimeNote = if ($actualRedisPort -and $configRedisPort -and $actualRedisPort -ne $configRedisPort) {
            "Observed runtime differs from config: Redis is listening on $actualRedisPort while local-stack config points to $configRedisPort."
        } else {
            "Runtime ports match the current local-stack config."
        }
    }

    $summary = [ordered]@{
        totalEndpoints = $results.Count
        improvedAvgCount = @($results | Where-Object { $_.baseline.avgMs -and $_.stats.avgMs -lt $_.baseline.avgMs }).Count
        regressedAvgCount = @($results | Where-Object { $_.baseline.avgMs -and $_.stats.avgMs -gt $_.baseline.avgMs }).Count
        topHotspots = @($results | Sort-Object { $_.stats.avgMs } -Descending | Select-Object -First 5 | ForEach-Object { $_.key })
    }

    $payload = [ordered]@{
        environment = $environment
        tiers = $tiers
        optimizationNotes = $optimizationNotes
        residualRisks = $residualRisks
        summary = $summary
        results = $results
    }

    $payload | ConvertTo-Json -Depth 8 | Set-Content -Path $jsonPath -Encoding UTF8
    Build-MarkdownReport -Payload $payload -OutputPath $mdPath

    Write-Output "JSON: $jsonPath"
    Write-Output "MD: $mdPath"
}

function Invoke-BenchmarkEndpoint {
    param(
        [Parameter(Mandatory = $true)]$Client,
        [Parameter(Mandatory = $true)][string]$ApiBase,
        [Parameter(Mandatory = $true)]$Endpoint,
        [Parameter(Mandatory = $true)]$Headers,
        [Parameter(Mandatory = $true)][int]$WarmupCount,
        [Parameter(Mandatory = $true)]$Baseline
    )

    $cold = Invoke-TimedRequest -Client $Client -Uri "$ApiBase$($Endpoint.path)" -Headers $Headers
    for ($index = 0; $index -lt $WarmupCount; $index += 1) {
        [void](Invoke-TimedRequest -Client $Client -Uri "$ApiBase$($Endpoint.path)" -Headers $Headers)
    }

    $samples = @()
    for ($index = 0; $index -lt [int]$Endpoint.samples; $index += 1) {
        $samples += Invoke-TimedRequest -Client $Client -Uri "$ApiBase$($Endpoint.path)" -Headers $Headers
    }

    $sampleValues = @($samples | ForEach-Object { [double]$_.elapsedMs })
    $sortedValues = @($sampleValues | Sort-Object)
    $p95Index = [Math]::Max([Math]::Ceiling($sortedValues.Count * 0.95) - 1, 0)
    $avgMs = [Math]::Round((($sampleValues | Measure-Object -Average).Average), 2)
    $medianMs = [Math]::Round($sortedValues[[int]([Math]::Floor($sortedValues.Count / 2))], 2)
    $minMs = [Math]::Round(($sampleValues | Measure-Object -Minimum).Minimum, 2)
    $maxMs = [Math]::Round(($sampleValues | Measure-Object -Maximum).Maximum, 2)
    $p95Ms = [Math]::Round($sortedValues[[int]$p95Index], 2)
    $baselineEntry = if ($Baseline.Contains($Endpoint.key)) { $Baseline[$Endpoint.key] } else { @{} }
    $deltaAvgMs = if ($baselineEntry.avgMs) { [Math]::Round($avgMs - [double]$baselineEntry.avgMs, 2) } else { $null }
    $deltaAvgPct = if ($baselineEntry.avgMs) { [Math]::Round((($avgMs - [double]$baselineEntry.avgMs) / [double]$baselineEntry.avgMs) * 100, 2) } else { $null }

    return [ordered]@{
        key = $Endpoint.key
        tier = $Endpoint.tier
        kind = $Endpoint.kind
        path = $Endpoint.path
        samples = [int]$Endpoint.samples
        baseline = [ordered]@{
            avgMs = if ($baselineEntry.avgMs) { [double]$baselineEntry.avgMs } else { $null }
            p95Ms = if ($baselineEntry.p95Ms) { [double]$baselineEntry.p95Ms } else { $null }
        }
        cold = [ordered]@{
            elapsedMs = [Math]::Round([double]$cold.elapsedMs, 2)
            statusCode = [int]$cold.statusCode
        }
        stats = [ordered]@{
            avgMs = $avgMs
            medianMs = $medianMs
            minMs = $minMs
            maxMs = $maxMs
            p95Ms = $p95Ms
            deltaAvgMs = $deltaAvgMs
            deltaAvgPct = $deltaAvgPct
            statusCodes = @($samples | Group-Object statusCode | Sort-Object Name | ForEach-Object { "$($_.Name)x$($_.Count)" })
            rawMs = $sampleValues
        }
    }
}

function Invoke-TimedRequest {
    param(
        [Parameter(Mandatory = $true)]$Client,
        [Parameter(Mandatory = $true)][string]$Uri,
        [Parameter(Mandatory = $true)]$Headers
    )

    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, $Uri)
    foreach ($header in $Headers.GetEnumerator()) {
        [void]$request.Headers.TryAddWithoutValidation([string]$header.Key, [string]$header.Value)
    }

    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    $response = $Client.SendAsync($request).GetAwaiter().GetResult()
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $watch.Stop()

    if (-not $response.IsSuccessStatusCode) {
        throw "Request failed: $Uri status=$([int]$response.StatusCode) body=$($body.Substring(0, [Math]::Min($body.Length, 400)))"
    }

    return [ordered]@{
        elapsedMs = [Math]::Round($watch.Elapsed.TotalMilliseconds, 2)
        statusCode = [int]$response.StatusCode
    }
}

function Get-AdminToken {
    param(
        [Parameter(Mandatory = $true)]$Client,
        [Parameter(Mandatory = $true)][string]$ApiBase,
        [Parameter(Mandatory = $true)][string]$Username,
        [Parameter(Mandatory = $true)][string]$Password
    )

    if ([string]::IsNullOrWhiteSpace($Password)) {
        throw "Missing admin password in local stack config."
    }

    $payload = @{ username = $Username; password = $Password } | ConvertTo-Json -Compress
    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post, "$ApiBase/auth/login")
    $request.Content = [System.Net.Http.StringContent]::new($payload, [System.Text.Encoding]::UTF8, "application/json")
    $response = $Client.SendAsync($request).GetAwaiter().GetResult()
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()

    if (-not $response.IsSuccessStatusCode) {
        throw "Admin login failed: status=$([int]$response.StatusCode) body=$body"
    }

    $parsed = $body | ConvertFrom-Json
    if (-not $parsed.data.token) {
        throw "Admin login succeeded but token was missing."
    }
    return [string]$parsed.data.token
}

function Get-ActualRedisPort {
    foreach ($port in @(6379, 6380)) {
        try {
            $match = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -First 1
            if ($match) {
                return [int]$port
            }
        } catch {
        }
    }
    return $null
}

function Build-MarkdownReport {
    param(
        [Parameter(Mandatory = $true)]$Payload,
        [Parameter(Mandatory = $true)][string]$OutputPath
    )

    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add("# API Read Performance Report")
    $lines.Add("")
    $lines.Add("- Generated at: $($Payload.environment.reportGeneratedAt)")
    $lines.Add("- API base: $($Payload.environment.apiBase)")
    $lines.Add("- Runtime note: $($Payload.environment.runtimeNote)")
    $lines.Add("")
    $lines.Add("## Importance Tiers")
    foreach ($tierName in @("P0", "P1", "P2")) {
        $lines.Add("")
        $lines.Add("### $tierName")
        foreach ($item in $Payload.tiers[$tierName]) {
            $lines.Add("- $item")
        }
    }
    $lines.Add("")
    $lines.Add("## Implemented Optimizations")
    foreach ($note in $Payload.optimizationNotes) {
        $lines.Add("- $note")
    }
    $lines.Add("")
    $lines.Add("## Benchmark Summary")
    $lines.Add("")
    $lines.Add("| Endpoint | Tier | Cold ms | Avg ms | P95 ms | Baseline avg ms | Delta avg ms | Delta avg % |")
    $lines.Add("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |")
    foreach ($result in $Payload.results) {
        $baselineAvg = if ($result.baseline.avgMs -ne $null) { "{0:N2}" -f [double]$result.baseline.avgMs } else { "-" }
        $deltaAvgMs = if ($result.stats.deltaAvgMs -ne $null) { "{0:N2}" -f [double]$result.stats.deltaAvgMs } else { "-" }
        $deltaAvgPct = if ($result.stats.deltaAvgPct -ne $null) { "{0:N2}%" -f [double]$result.stats.deltaAvgPct } else { "-" }
        $lines.Add([string]::Format(
            "| {0} | {1} | {2:N2} | {3:N2} | {4:N2} | {5} | {6} | {7} |",
            $result.key,
            $result.tier,
            [double]$result.cold.elapsedMs,
            [double]$result.stats.avgMs,
            [double]$result.stats.p95Ms,
            $baselineAvg,
            $deltaAvgMs,
            $deltaAvgPct
        ))
    }
    $lines.Add("")
    $lines.Add("## Decisions")
    $lines.Add("- Keep snapshot-style in-memory caching for high-fanout read endpoints that repeatedly merge DB rows and JSON supplements.")
    $lines.Add("- Treat recipe-tree and crafting-station responses as P0 because they dominate admin and public read latency.")
    $lines.Add("- Leave low-cost endpoints in P2 without extra complexity unless their scope grows.")
    $lines.Add("")
    $lines.Add("## Residual Risks")
    foreach ($risk in $Payload.residualRisks) {
        $lines.Add("- $risk")
    }
    $lines.Add("")
    $lines.Add("## Validation")
    $lines.Add('- `mvn -DskipTests compile`')
    $lines.Add('- `powershell -File scripts/dev/benchmark-read-api.ps1`')

    Set-Content -Path $OutputPath -Value $lines -Encoding UTF8
}

Invoke-Main
