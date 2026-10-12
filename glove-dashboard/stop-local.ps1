param([string]$ConfigFile = '', [string]$LauncherRoot = '')
$ErrorActionPreference = 'Stop'
if (-not $LauncherRoot) { $LauncherRoot = Split-Path -Parent $PSScriptRoot }
. (Join-Path $LauncherRoot 'Read-NeuroConfig.ps1')
$settings = Get-NeuroConfig $ConfigFile
$projectRoot = $settings.paths.dashboard
$checkoutRoot = $LauncherRoot
$rootPrefix = $checkoutRoot.TrimEnd('\') + '\'
$vitePath = (Join-Path $projectRoot 'node_modules\vite\bin\vite.js').Replace('\', '/')
$bridgePath = (Join-Path $projectRoot 'backend\local_launch.py').Replace('\', '/')
$processes = @(Get-CimInstance Win32_Process)
$owned = New-Object 'System.Collections.Generic.HashSet[int]'
foreach ($process in $processes) {
    $exe = [string]$process.ExecutablePath
    $command = ([string]$process.CommandLine).Replace('\', '/')
    if (($exe -and $exe.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) -or
        ($process.Name -eq 'node.exe' -and $command.IndexOf($vitePath, [StringComparison]::OrdinalIgnoreCase) -ge 0) -or
        ($process.Name -match '^python(w)?\.exe$' -and $command.IndexOf($bridgePath, [StringComparison]::OrdinalIgnoreCase) -ge 0)) {
        [void]$owned.Add([int]$process.ProcessId)
    }
}
do {
    $changed = $false
    foreach ($process in $processes) {
        if ($owned.Contains([int]$process.ParentProcessId) -and $owned.Add([int]$process.ProcessId)) {
            $changed = $true
        }
    }
} while ($changed)
foreach ($processId in $owned) {
    Stop-Process -Id $processId -ErrorAction SilentlyContinue
}
Write-Host 'Stopped only runtime processes belonging to this team checkout.'
