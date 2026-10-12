param([string]$ConfigFile = '', [string]$LauncherRoot = '')
$ErrorActionPreference = 'Stop'
if (-not $LauncherRoot) { $LauncherRoot = Split-Path -Parent $PSScriptRoot }
. (Join-Path $LauncherRoot 'Read-NeuroConfig.ps1')
$settings = Get-NeuroConfig $ConfigFile
$projectRoot = $settings.paths.dashboard
$logRoot = $settings.paths.logs
$pythonPath = Join-Path $settings.paths.venv 'Scripts\python.exe'
$bridgeScript = Join-Path $projectRoot 'backend\local_launch.py'
$vitePath = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
$configPath = Join-Path $projectRoot 'vite.local.config.ts'
$appUrl = $settings.frontend_url
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Python environment is missing. Run Setup-Neuro.ps1.' }
$nodePath = $settings.runtime.node_executable
if (-not $nodePath) { $nodePath = (Get-Command node.exe -ErrorAction Stop).Source }
if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Configured Node executable was not found.' }
if (-not (Test-Path -LiteralPath $vitePath)) {
    $npmPath = $settings.runtime.npm_executable
    if (-not $npmPath) { $npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source }
    Push-Location $projectRoot
    try {
        & $npmPath ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
    } finally { Pop-Location }
}
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$gameLibraryRoot = $settings.paths.game_library
New-Item -ItemType Directory -Force -Path $gameLibraryRoot | Out-Null
foreach ($asset in @('three.module.min.js', 'three.core.min.js')) {
    $destination = Join-Path $gameLibraryRoot $asset
    if (-not (Test-Path -LiteralPath $destination)) {
        Copy-Item -LiteralPath (Join-Path $projectRoot "node_modules\three\build\$asset") -Destination $destination
    }
}
$license = Join-Path $gameLibraryRoot 'three-LICENSE.txt'
if (-not (Test-Path -LiteralPath $license)) {
    Copy-Item -LiteralPath (Join-Path $projectRoot 'node_modules\three\LICENSE') -Destination $license
}
$audioPath = Join-Path $gameLibraryRoot 'rehab-audio.js'
if (-not (Test-Path -LiteralPath $audioPath)) {
    $audioSource = Join-Path $projectRoot 'public\games\lib\rehab-audio.js'
    if (-not (Test-Path -LiteralPath $audioSource)) { throw 'rehab-audio.js is missing from this checkout. Restore the full game helper.' }
    Copy-Item -LiteralPath $audioSource -Destination $audioPath
}
& (Join-Path $projectRoot 'stop-local.ps1') -ConfigFile $settings.config_file -LauncherRoot $LauncherRoot
foreach ($port in @($settings.network.frontend_port, $settings.network.backend_port)) {
    if (netstat -ano -p tcp | Select-String ":$port\s+.*LISTENING") {
        throw "Port $port is occupied by another application. Stop it before launching this checkout."
    }
}
$launchToken = [guid]::NewGuid().ToString()
$previousToken = $env:NEURO_LAUNCH_TOKEN
$previousConfig = $env:NEURO_CONFIG_FILE
$previousRoot = $env:NEURO_PROJECT_ROOT
try {
    $env:NEURO_LAUNCH_TOKEN = $launchToken
    $env:NEURO_CONFIG_FILE = $settings.config_file
    $env:NEURO_PROJECT_ROOT = $LauncherRoot
    $backend = Start-Process -FilePath $pythonPath -ArgumentList @('"' + $bridgeScript + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logRoot 'backend.log') -RedirectStandardError (Join-Path $logRoot 'backend-error.log')
    $frontend = Start-Process -FilePath $nodePath -ArgumentList @('"' + $vitePath + '"', '--config', '"' + $configPath + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logRoot 'frontend.log') -RedirectStandardError (Join-Path $logRoot 'frontend-error.log')
} catch {
    & (Join-Path $projectRoot 'stop-local.ps1') -ConfigFile $settings.config_file -LauncherRoot $LauncherRoot
    throw
} finally {
    $env:NEURO_LAUNCH_TOKEN = $previousToken
    $env:NEURO_CONFIG_FILE = $previousConfig
    $env:NEURO_PROJECT_ROOT = $previousRoot
}
try {
    @{ backend = $backend.Id; frontend = $frontend.Id; project_root = $projectRoot; config_file = $settings.config_file; launch_token = $launchToken } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logRoot 'processes.json')
    $ready = $false
    for ($attempt = 0; $attempt -lt 90; $attempt++) {
        $backend.Refresh()
        $frontend.Refresh()
        if ($backend.HasExited -or $frontend.HasExited) { throw "A runtime stopped. Check logs at $logRoot" }
        try {
            $identity = Invoke-RestMethod ($appUrl + 'api/runtime') -TimeoutSec 2
            $ready = $identity.launch_token -eq $launchToken -and $identity.project_root -eq $projectRoot -and $identity.config_file -eq $settings.config_file
            if ($ready) { break }
        } catch {}
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) { throw 'Project/config identity could not be verified. Browser was not opened.' }
    $page = Invoke-WebRequest -UseBasicParsing $appUrl -TimeoutSec $settings.runtime.page_timeout_seconds
    if ($page.StatusCode -ne 200) { throw 'Source frontend did not load.' }
} catch {
    & (Join-Path $projectRoot 'stop-local.ps1') -ConfigFile $settings.config_file -LauncherRoot $LauncherRoot
    throw
}
$browserPath = $settings.browser.executable
if ($browserPath -and -not (Test-Path -LiteralPath $browserPath)) { throw 'Configured browser executable was not found.' }
if (-not $browserPath) {
    $browserCandidates = @(
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
    )
    $browserPath = $browserCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if ($browserPath) {
    $urlArgument = if ($settings.browser.app_mode) { "--app=$appUrl" } else { $appUrl }
    Start-Process -FilePath $browserPath -ArgumentList @($urlArgument, ("--window-size={0},{1}" -f $settings.browser.width, $settings.browser.height))
} else { Start-Process $appUrl }
Write-Host "Team source project: $projectRoot"
Write-Host "Local config: $($settings.config_file)"
Write-Host "Neuro frontend: $appUrl | Bridge: http://$($settings.network.host):$($settings.network.backend_port)"
