param([string]$PythonExecutable = '', [string]$ConfigFile = '')

$ErrorActionPreference = 'Stop'
$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $packageRoot 'Read-NeuroConfig.ps1')
$settings = Get-NeuroConfig $ConfigFile
$dashboardRoot = $settings.paths.dashboard
$backendRoot = Join-Path $dashboardRoot 'backend'
$venvRoot = $settings.paths.venv
$requirementsPath = Join-Path $backendRoot 'requirements.txt'
if (-not $PythonExecutable) { $PythonExecutable = $settings.runtime.python_executable }

if (-not (Test-Path -LiteralPath $requirementsPath)) {
    throw "Backend requirements not found at $requirementsPath. Extract the complete package first."
}

$pythonCommand = $null
$pythonProbe = 'import sys; assert (3,11) <= sys.version_info[:2] <= (3,12) and sys.maxsize > 2**32'
$venvPython = Join-Path $venvRoot 'Scripts\python.exe'
if (-not $PythonExecutable -and (Test-Path -LiteralPath $venvPython)) {
    try {
        & $venvPython -c $pythonProbe 2>$null
        if ($LASTEXITCODE -eq 0) { $pythonCommand = @($venvPython) }
    } catch {}
}
if ($PythonExecutable) {
    & $PythonExecutable -c $pythonProbe
    if ($LASTEXITCODE -ne 0) { throw 'The supplied Python must be 3.11 or 3.12 x64.' }
    $pythonCommand = @($PythonExecutable)
}
if (-not $pythonCommand -and (Get-Command py.exe -ErrorAction SilentlyContinue)) {
    foreach ($pythonVersion in @('-3.12', '-3.11')) {
        try {
            & py.exe $pythonVersion -c $pythonProbe 2>$null
            if ($LASTEXITCODE -eq 0) { $pythonCommand = @('py.exe', $pythonVersion); break }
        } catch {}
    }
}
if (-not $pythonCommand -and (Get-Command python.exe -ErrorAction SilentlyContinue)) {
    try {
        & python.exe -c $pythonProbe 2>$null
        if ($LASTEXITCODE -eq 0) { $pythonCommand = @('python.exe') }
    } catch {}
}
if (-not $pythonCommand) {
    throw 'Python 3.11 or 3.12 x64 was not found. Install either version with the Python launcher, then rerun setup.'
}

if (-not (Test-Path -LiteralPath (Join-Path $venvRoot 'Scripts\python.exe'))) {
    Write-Host 'Creating the isolated Python environment...'
    if ($pythonCommand.Count -eq 2) {
        & $pythonCommand[0] $pythonCommand[1] -m venv $venvRoot
    } else {
        & $pythonCommand[0] -m venv $venvRoot
    }
    if ($LASTEXITCODE -ne 0) { throw 'Unable to create the Python environment.' }
}

$venvPython = Join-Path $venvRoot 'Scripts\python.exe'
Write-Host 'Installing pinned local backend dependencies...'
& $venvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw 'Unable to update pip.' }
& $venvPython -m pip install -r $requirementsPath
if ($LASTEXITCODE -ne 0) { throw 'Unable to install backend requirements. Check network/proxy policy and retry.' }

Write-Host ''
Write-Host 'Setup complete. Run Run-Neuro.cmd to launch the application.' -ForegroundColor Green
