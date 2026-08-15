[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Nullable[int]]$Count,

  [string]$WorkingDirectory,

  [string]$Command,

  [string]$ShortcutPath,

  [string]$ConfigPath
)

$ErrorActionPreference = 'Stop'

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

function Resolve-Setting([object]$ExplicitValue, [object]$ConfigValue, [object]$Fallback) {
  if ($null -ne $ExplicitValue) {
    if ($ExplicitValue -is [string]) {
      if (-not [string]::IsNullOrWhiteSpace($ExplicitValue)) {
        return $ExplicitValue
      }
    } else {
      return $ExplicitValue
    }
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

$configCandidates = @()
if (-not [string]::IsNullOrWhiteSpace($ConfigPath)) {
  $configCandidates += $ConfigPath
}
$configCandidates += (Join-Path $PSScriptRoot 'start-vs2022-codex-devshells.config.json')

$resolvedConfigPath = $null
foreach ($candidate in $configCandidates) {
  if (-not [string]::IsNullOrWhiteSpace($candidate) -and (Test-Path $candidate)) {
    $resolvedConfigPath = (Resolve-Path $candidate).Path
    break
  }
}

$toolConfig = $null
if ($null -ne $resolvedConfigPath) {
  $toolConfig = Get-Content -Path $resolvedConfigPath -Raw | ConvertFrom-Json
}

$launchConfig = Get-ConfigValue $toolConfig @('launch')

if ($null -eq $Count) {
  $configuredCount = Get-ConfigValue $launchConfig @('count')
  if ($null -eq $configuredCount) {
    $configuredCount = Get-ConfigValue $toolConfig @('count')
  }
  if ($null -ne $configuredCount) {
    $Count = [int]$configuredCount
  } else {
    $Count = 4
  }
}
if ($Count -lt 1 -or $Count -gt 4) {
  throw 'Count must be between 1 and 4.'
}

$configuredWorkingDirectory = Get-ConfigValue $launchConfig @('workingDirectoryPath')
if ($null -eq $configuredWorkingDirectory) {
  $configuredWorkingDirectory = Get-ConfigValue $toolConfig @('workingDirectory')
}
$configuredCommand = Get-ConfigValue $launchConfig @('command')
if ($null -eq $configuredCommand) {
  $configuredCommand = Get-ConfigValue $toolConfig @('command')
}
$configuredShortcutPath = Get-ConfigValue $launchConfig @('shortcutPath')
if ($null -eq $configuredShortcutPath) {
  $configuredShortcutPath = Get-ConfigValue $toolConfig @('shortcutPath')
}

$WorkingDirectory = [string](Resolve-Setting $WorkingDirectory $configuredWorkingDirectory (Get-Location).Path)
$Command = [string](Resolve-Setting $Command $configuredCommand 'codex')
$ShortcutPath = [string](Resolve-Setting $ShortcutPath $configuredShortcutPath $null)

Add-Type -AssemblyName System.Windows.Forms

if (-not ('TerraPedia.Win32' -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

namespace TerraPedia {
  public static class Win32 {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool MoveWindow(IntPtr hWnd, int x, int y, int nWidth, int nHeight, bool bRepaint);

    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  }
}
"@
}

function ConvertTo-SingleQuotedLiteral([string]$Value) {
  return "'" + $Value.Replace("'", "''") + "'"
}

function Get-WindowLayout([int]$WindowCount) {
  $screen = [System.Windows.Forms.Screen]::FromPoint([System.Windows.Forms.Cursor]::Position)
  $area = $screen.WorkingArea
  $columns = if ($WindowCount -eq 1) { 1 } else { 2 }
  $rows = [int][Math]::Ceiling($WindowCount / $columns)
  $baseWidth = [int][Math]::Floor($area.Width / $columns)
  $baseHeight = [int][Math]::Floor($area.Height / $rows)
  $layout = @()

  for ($index = 0; $index -lt $WindowCount; $index++) {
    $row = [int][Math]::Floor($index / $columns)
    $column = $index % $columns
    $x = $area.X + ($column * $baseWidth)
    $y = $area.Y + ($row * $baseHeight)
    $width = if ($column -eq ($columns - 1)) { $area.Width - ($baseWidth * ($columns - 1)) } else { $baseWidth }
    $height = if ($row -eq ($rows - 1)) { $area.Height - ($baseHeight * ($rows - 1)) } else { $baseHeight }

    $layout += [pscustomobject]@{
      X = $x
      Y = $y
      Width = $width
      Height = $height
    }
  }

  return $layout
}

function Resolve-VsInstallation {
  $vswherePath = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
  if (-not (Test-Path $vswherePath)) {
    throw "vswhere.exe not found: $vswherePath"
  }

  $raw = & $vswherePath -latest -products * -format json
  if ([string]::IsNullOrWhiteSpace($raw)) {
    throw 'No Visual Studio 2022 installation was found.'
  }

  $installations = @($raw | ConvertFrom-Json)
  $installation = $installations | Where-Object { $_.isLaunchable -eq $true } | Select-Object -First 1
  if ($null -eq $installation) {
    throw 'No launchable Visual Studio installation was found.'
  }

  return $installation
}

function Resolve-VsDevShellModule([string]$InstallationPath) {
  $candidates = @(
    (Join-Path $InstallationPath 'Common7\Tools\Microsoft.VisualStudio.DevShell.dll'),
    (Join-Path $InstallationPath 'Common7\Tools\vsdevshell\Microsoft.VisualStudio.DevShell.dll')
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  throw "Microsoft.VisualStudio.DevShell.dll not found under $InstallationPath"
}

function Resolve-ShortcutPath([object]$VsInstallation, [string]$ExplicitShortcutPath) {
  if (-not [string]::IsNullOrWhiteSpace($ExplicitShortcutPath)) {
    return (Resolve-Path $ExplicitShortcutPath).Path
  }

  $shortcutDir = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\Visual Studio 2022\Visual Studio Tools'
  if (-not (Test-Path $shortcutDir)) {
    throw "Visual Studio shortcut directory not found: $shortcutDir"
  }

  $nickname = $VsInstallation.properties.nickname
  $candidates = @()
  if (-not [string]::IsNullOrWhiteSpace($nickname)) {
    $candidates += (Join-Path $shortcutDir "Developer PowerShell for VS 2022 ($nickname).lnk")
  }
  $candidates += (Join-Path $shortcutDir 'Developer PowerShell for VS 2022.lnk')

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  $fallback = Get-ChildItem -Path $shortcutDir -Filter 'Developer PowerShell for VS 2022*.lnk' | Select-Object -First 1
  if ($null -ne $fallback) {
    return $fallback.FullName
  }

  throw "Developer PowerShell shortcut not found under $shortcutDir"
}

function Resolve-LaunchCommand([string]$CommandText) {
  if ([string]::IsNullOrWhiteSpace($CommandText)) {
    throw 'Command cannot be empty.'
  }

  if ($CommandText -ne 'codex') {
    return $CommandText
  }

  $commandInfo = Get-Command 'codex' -ErrorAction SilentlyContinue
  if ($null -eq $commandInfo) {
    return 'codex'
  }

  $resolvedPath = $commandInfo.Source
  if ([string]::IsNullOrWhiteSpace($resolvedPath)) {
    $resolvedPath = $commandInfo.Definition
  }

  if ([string]::IsNullOrWhiteSpace($resolvedPath) -or -not (Test-Path $resolvedPath)) {
    return 'codex'
  }

  return "& $(ConvertTo-SingleQuotedLiteral $resolvedPath)"
}

function Get-BootstrapRoot {
  $root = Join-Path $env:TEMP 'terraPedia-codex-devshells'
  New-Item -ItemType Directory -Force -Path $root | Out-Null
  return $root
}

function Get-WindowsPowerShellProfilePath {
  $documentsDir = [Environment]::GetFolderPath('MyDocuments')
  return (Join-Path $documentsDir 'WindowsPowerShell\Microsoft.PowerShell_profile.ps1')
}

function Install-ProfileWrapper([string]$BootstrapDispatchPath) {
  $profilePath = Get-WindowsPowerShellProfilePath
  $profileDir = Split-Path -Path $profilePath -Parent
  New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

  $backupPath = $null
  if (Test-Path $profilePath) {
    $backupPath = Join-Path (Get-BootstrapRoot) ("profile-backup-" + [guid]::NewGuid().ToString('N') + '.ps1')
    Copy-Item -Path $profilePath -Destination $backupPath -Force
  }

  $backupLiteral = if ($null -ne $backupPath) { ConvertTo-SingleQuotedLiteral $backupPath } else { '$null' }
  $dispatchLiteral = ConvertTo-SingleQuotedLiteral $BootstrapDispatchPath
  $wrapper = @"
`$backupPath = $backupLiteral
if (`$backupPath -ne `$null -and (Test-Path `$backupPath)) {
  . `$backupPath
}
`$bootstrapPath = $dispatchLiteral
if (-not [string]::IsNullOrWhiteSpace(`$bootstrapPath) -and (Test-Path `$bootstrapPath)) {
  . `$bootstrapPath
}
"@

  Set-Content -Path $profilePath -Value $wrapper -Encoding utf8

  return [pscustomobject]@{
    ProfilePath = $profilePath
    BackupPath = $backupPath
  }
}

function Restore-ProfileWrapper([string]$ProfilePath, [string]$BackupPath) {
  if ([string]::IsNullOrWhiteSpace($ProfilePath)) {
    return
  }

  if (-not [string]::IsNullOrWhiteSpace($BackupPath) -and (Test-Path $BackupPath)) {
    Copy-Item -Path $BackupPath -Destination $ProfilePath -Force
    Remove-Item -Path $BackupPath -Force -ErrorAction SilentlyContinue
    return
  }

  if (Test-Path $ProfilePath) {
    Remove-Item -Path $ProfilePath -Force
  }
}

function New-BootstrapScript([string]$WindowTitle, [string]$LaunchId, [string]$VsDevShellModule, [string]$VsInstanceId, [string]$WorkingDirectoryPath, [string]$LaunchCommandText) {
  $root = Get-BootstrapRoot
  $safeTitle = ($WindowTitle -replace '[^A-Za-z0-9_-]', '_')
  $bootstrapPath = Join-Path $root "$safeTitle-$LaunchId.bootstrap.ps1"
  $startupLogPath = Join-Path $root "$safeTitle-$LaunchId.startup.log"

  $moduleLiteral = ConvertTo-SingleQuotedLiteral $VsDevShellModule
  $instanceLiteral = ConvertTo-SingleQuotedLiteral $VsInstanceId
  $workingDirectoryLiteral = ConvertTo-SingleQuotedLiteral $WorkingDirectoryPath
  $windowTitleLiteral = ConvertTo-SingleQuotedLiteral $WindowTitle
  $startupLogLiteral = ConvertTo-SingleQuotedLiteral $startupLogPath
  $launchCommandLiteral = ConvertTo-SingleQuotedLiteral $LaunchCommandText

  $bootstrap = @"
`$ErrorActionPreference = 'Stop'
`$launchCommandText = $launchCommandLiteral
try {
  Import-Module $moduleLiteral
  if ((Get-Command Enter-VsDevShell).Parameters.ContainsKey('SkipAutomaticLocation')) {
    Enter-VsDevShell $instanceLiteral -SkipAutomaticLocation
  } else {
    Enter-VsDevShell $instanceLiteral
  }
  `$Host.UI.RawUI.BackgroundColor = 'Black'
  Clear-Host
  Set-Location -LiteralPath $workingDirectoryLiteral
  `$Host.UI.RawUI.WindowTitle = $windowTitleLiteral
  @(
    'startup=ok'
    ('cwd=' + (Get-Location).Path)
    ('command=' + `$launchCommandText)
  ) | Set-Content -Path $startupLogLiteral -Encoding utf8
  Invoke-Expression `$launchCommandText
} catch {
  @(
    'startup=error'
    (`$_ | Out-String)
  ) | Set-Content -Path $startupLogLiteral -Encoding utf8
  throw
}
"@

  Set-Content -Path $bootstrapPath -Value $bootstrap -Encoding utf8

  return [pscustomobject]@{
    BootstrapPath = $bootstrapPath
    StartupLogPath = $startupLogPath
  }
}

function Wait-NewPowerShellProcess([int[]]$KnownIds, [datetime]$NotBefore, [int]$TimeoutSeconds = 15) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $candidates = @(Get-Process -Name powershell -ErrorAction SilentlyContinue | Where-Object {
      ($KnownIds -notcontains $_.Id) -and $_.StartTime -ge $NotBefore.AddSeconds(-1)
    } | Sort-Object StartTime)

    if ($candidates.Count -gt 0) {
      return $candidates[0]
    }

    Start-Sleep -Milliseconds 200
  }

  return $null
}

function Wait-MainWindowHandle([System.Diagnostics.Process]$Process, [int]$TimeoutSeconds = 15) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $Process.Refresh()
    } catch {
      return [IntPtr]::Zero
    }

    if ($Process.MainWindowHandle -and $Process.MainWindowHandle -ne 0) {
      return $Process.MainWindowHandle
    }

    Start-Sleep -Milliseconds 200
  }

  return [IntPtr]::Zero
}

function Wait-PathExists([string]$Path, [int]$TimeoutSeconds = 15) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $Path) {
      return $true
    }

    Start-Sleep -Milliseconds 200
  }

  return $false
}

$resolvedWorkingDirectory = (Resolve-Path $WorkingDirectory).Path
$vsInstallation = Resolve-VsInstallation
$vsDevShellModule = Resolve-VsDevShellModule -InstallationPath $vsInstallation.installationPath
$resolvedShortcutPath = Resolve-ShortcutPath -VsInstallation $vsInstallation -ExplicitShortcutPath $ShortcutPath
$launchCommand = Resolve-LaunchCommand -CommandText $Command
$layout = Get-WindowLayout -WindowCount $Count
$bootstrapDispatchPath = Join-Path (Get-BootstrapRoot) 'current-bootstrap.ps1'
$configDisplayPath = if ($null -ne $resolvedConfigPath) { $resolvedConfigPath } else { '(none)' }

Write-Host "Visual Studio: $($vsInstallation.displayName)"
Write-Host "Instance ID: $($vsInstallation.instanceId)"
Write-Host "Shortcut: $resolvedShortcutPath"
Write-Host "Config: $configDisplayPath"
Write-Host "Working directory: $resolvedWorkingDirectory"
Write-Host "Command: $Command"
Write-Host "Layout: tiled $Count pane(s) on monitor containing the current cursor"

$knownIds = @(Get-Process -Name powershell -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$profileState = Install-ProfileWrapper -BootstrapDispatchPath $bootstrapDispatchPath

try {
  for ($index = 1; $index -le $Count; $index++) {
    $windowTitle = "Codex DevShell $index/$Count"
    $launchId = [guid]::NewGuid().ToString('N')
    $bootstrapState = New-BootstrapScript `
      -WindowTitle $windowTitle `
      -LaunchId $launchId `
      -VsDevShellModule $vsDevShellModule `
      -VsInstanceId $vsInstallation.instanceId `
      -WorkingDirectoryPath $resolvedWorkingDirectory `
      -LaunchCommandText $launchCommand

    if ($PSCmdlet.ShouldProcess($windowTitle, "Launch Developer PowerShell shortcut and run '$Command'")) {
      $slot = $layout[$index - 1]
      Copy-Item -Path $bootstrapState.BootstrapPath -Destination $bootstrapDispatchPath -Force
      $launchStart = Get-Date
      Start-Process -FilePath $resolvedShortcutPath -WindowStyle Normal | Out-Null

      $process = Wait-NewPowerShellProcess -KnownIds $knownIds -NotBefore $launchStart -TimeoutSeconds 15
      if ($null -eq $process) {
        throw "Failed to detect the new Developer PowerShell process for $windowTitle"
      }

      $knownIds += $process.Id
      Write-Host "Started $windowTitle (PID=$($process.Id))"
      Write-Host "Startup log: $($bootstrapState.StartupLogPath)"

      $handle = Wait-MainWindowHandle -Process $process -TimeoutSeconds 15
      if ($handle -eq [IntPtr]::Zero) {
        Write-Warning "Could not get window handle for $windowTitle. The pane was started but not repositioned."
      } else {
        [void][TerraPedia.Win32]::ShowWindowAsync($handle, 9)
        $moved = [TerraPedia.Win32]::MoveWindow($handle, $slot.X, $slot.Y, $slot.Width, $slot.Height, $true)
        if (-not $moved) {
          Write-Warning "Failed to move $windowTitle into its tile."
        }
      }

      if (-not (Wait-PathExists -Path $bootstrapState.StartupLogPath -TimeoutSeconds 15)) {
        Write-Warning "Bootstrap log was not created for ${windowTitle}: $($bootstrapState.StartupLogPath)"
      }

      Start-Sleep -Milliseconds 250
    }
  }
} finally {
  if (Test-Path $bootstrapDispatchPath) {
    Remove-Item -Path $bootstrapDispatchPath -Force -ErrorAction SilentlyContinue
  }
  Restore-ProfileWrapper -ProfilePath $profileState.ProfilePath -BackupPath $profileState.BackupPath
}
