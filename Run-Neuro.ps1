param([string]$ConfigFile = '')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Read-NeuroConfig.ps1')
$settings = Get-NeuroConfig $ConfigFile
$checkoutPrefix = $PSScriptRoot.TrimEnd('\') + '\'
if (-not $settings.paths.dashboard.StartsWith($checkoutPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'paths.dashboard must belong to this checkout; refusing to launch a different project.'
}
$venvPython = Join-Path $settings.paths.venv 'Scripts\python.exe'
$dependenciesReady = $false
if (Test-Path -LiteralPath $venvPython) {
    & $venvPython -c "import fastapi, uvicorn, pythonosc, pydantic" 2>$null
    $dependenciesReady = $LASTEXITCODE -eq 0
}
if (-not $dependenciesReady) {
    & (Join-Path $PSScriptRoot 'Setup-Neuro.ps1') -ConfigFile $settings.config_file
}
& (Join-Path $settings.paths.dashboard 'start-local.ps1') -ConfigFile $settings.config_file -LauncherRoot $PSScriptRoot
