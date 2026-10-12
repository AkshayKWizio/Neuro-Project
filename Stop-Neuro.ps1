param([string]$ConfigFile = '')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Read-NeuroConfig.ps1')
$settings = Get-NeuroConfig $ConfigFile
& (Join-Path $settings.paths.dashboard 'stop-local.ps1') -ConfigFile $settings.config_file -LauncherRoot $PSScriptRoot
