Set-StrictMode -Version Latest

$script:TerraPediaConstantsPath = Join-Path $PSScriptRoot '..\config\project.constants.json'

function Get-TerraPediaProjectRoot {
    if (-not [string]::IsNullOrWhiteSpace($env:TERRAPEDIA_REPO_ROOT)) {
        return [IO.Path]::GetFullPath($env:TERRAPEDIA_REPO_ROOT)
    }

    $current = [IO.DirectoryInfo]::new((Join-Path $PSScriptRoot '..\..')).FullName
    while ($null -ne $current) {
        if ((Test-Path (Join-Path $current '.git')) -or (Test-Path (Join-Path $current 'scripts\config\project.constants.json'))) {
            return [IO.Path]::GetFullPath($current)
        }
        $parent = [IO.Directory]::GetParent($current)
        if ($null -eq $parent -or $parent.FullName -eq $current) { break }
        $current = $parent.FullName
    }
    throw "Unable to resolve TerraPedia project root from $PSScriptRoot"
}

function Get-TerraPediaConstants {
    $root = Get-TerraPediaProjectRoot
    $manifest = Join-Path $root 'scripts\config\project.constants.json'
    if (-not (Test-Path $manifest)) { throw "Project constants manifest not found: $manifest" }
    return Get-Content -Raw -Path $manifest | ConvertFrom-Json
}

function Get-TerraPediaConstantValue {
    param([Parameter(Mandatory)][string]$Key)
    $value = Get-TerraPediaConstants
    foreach ($segment in $Key.Split('.')) {
        $value = $value.$segment
    }
    if ($null -eq $value -or [string]::IsNullOrWhiteSpace([string]$value)) {
        throw "Missing or empty project constant: $Key"
    }
    return [string]$value
}

function Get-TerraPediaConstantPath {
    param([Parameter(Mandatory)][string]$Key, [string[]]$Suffix = @())
    $root = Get-TerraPediaProjectRoot
    $relative = Get-TerraPediaConstantValue -Key $Key
    $candidate = Join-Path $root $relative
    foreach ($part in $Suffix) { $candidate = Join-Path $candidate $part }
    $resolved = [IO.Path]::GetFullPath($candidate)
    $rootWithSeparator = $root.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    if (($resolved -ne $root) -and (-not $resolved.StartsWith($rootWithSeparator, [StringComparison]::OrdinalIgnoreCase))) {
        throw "Resolved path escapes outside repository root: $resolved"
    }
    return $resolved
}

function Get-TerraPediaApplicationPath {
    param([Parameter(Mandatory)][string]$Application)
    return Get-TerraPediaConstantPath -Key "applications.$Application.currentPath"
}
