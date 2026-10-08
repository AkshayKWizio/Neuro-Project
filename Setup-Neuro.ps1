$ErrorActionPreference = 'Stop'
$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$dashboardRoot = Join-Path $packageRoot 'glove-dashboard'
$backendRoot = Join-Path $dashboardRoot 'backend'
$venvRoot = Join-Path $backendRoot '.venv'
$requirementsPath = Join-Path $backendRoot 'requirements.txt'

if (-not (Test-Path -LiteralPath $requirementsPath)) {
    throw "Backend requirements not found at $requirementsPath. Extract the complete package first."
}

$pythonCommand = $null
if (Get-Command py.exe -ErrorAction SilentlyContinue) {
    try {
        & py.exe -3.12 -c "import sys; assert sys.version_info[:2] == (3, 12)" 2>$null
        if ($LASTEXITCODE -eq 0) { $pythonCommand = @('py.exe', '-3.12') }
    } catch {}
}
if (-not $pythonCommand -and (Get-Command python.exe -ErrorAction SilentlyContinue)) {
    try {
        & python.exe -c "import sys; assert sys.version_info[:2] == (3, 12)" 2>$null
        if ($LASTEXITCODE -eq 0) { $pythonCommand = @('python.exe') }
    } catch {}
}
if (-not $pythonCommand) {
    throw 'Python 3.12 x64 was not found. Install it from the approved source, including the Python launcher, then rerun setup.'
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
