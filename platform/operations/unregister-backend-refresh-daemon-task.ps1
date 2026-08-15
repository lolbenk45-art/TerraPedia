param(
  [string]$TaskName = 'TerraPedia Backend Refresh Daemon',
  [switch]$Preview
)

$ErrorActionPreference = 'Stop'

$args = @('/Delete', '/F', '/TN', $TaskName)

if ($Preview) {
  "schtasks $($args -join ' ')"
  exit 0
}

& schtasks.exe @args
