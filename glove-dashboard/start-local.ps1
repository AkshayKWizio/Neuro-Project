$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$logRoot = Join-Path $projectRoot '.logs'
$pythonPath = Join-Path $projectRoot 'backend\.venv\Scripts\python.exe'
$processFile = Join-Path $logRoot 'processes.json'
$appUrl = 'http://127.0.0.1:3000/'

if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw 'Python environment is missing. Re-run the project setup before starting.'
}

New-Item -ItemType Directory -Force -Path $logRoot | Out-Null

# The production web bundle is served by the same FastAPI process as the glove
# bridge. Keeping one process prevents a stale web page from outliving its API.
$backend = Start-Process -FilePath $pythonPath `
    -ArgumentList @('-m', 'uvicorn', 'backend.server:app', '--host', '127.0.0.1', '--port', '3000') `
    -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $logRoot 'backend.log') `
    -RedirectStandardError (Join-Path $logRoot 'backend-error.log')

@{ backend = $backend.Id } | ConvertTo-Json | Set-Content -LiteralPath $processFile

$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    if ($backend.HasExited) {
        $details = Get-Content -LiteralPath (Join-Path $logRoot 'backend-error.log') -Raw -ErrorAction SilentlyContinue
        throw "The local glove bridge stopped during startup.`n$details"
    }
    try {
        $ready = (Invoke-WebRequest -UseBasicParsing ($appUrl + 'api/health') -TimeoutSec 1).StatusCode -eq 200
        if ($ready) { break }
    } catch {
        Start-Sleep -Milliseconds 500
    }
}

if (-not $ready) {
    try { Stop-Process -Id $backend.Id -ErrorAction SilentlyContinue } catch {}
    throw 'The local glove bridge did not become ready. See .logs\backend-error.log.'
}

# Ensure XR Game plugin is invoked in the background upon application launch
try {
    Invoke-RestMethod -Uri ($appUrl + 'api/xr-game/launch') -Method Post -TimeoutSec 5 -ErrorAction SilentlyContinue | Out-Null
} catch {}

$browserCandidates = @(
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
)
$browserPath = $browserCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1

if ($browserPath) {
    # Launch in standalone application window mode (removes URL bar, tabs, and navigation)
    $appArgs = @(
        "--app=$appUrl",
        "--window-size=1440,900"
    )
    Start-Process -FilePath $browserPath -ArgumentList $appArgs
} else {
    Start-Process $appUrl
}

Write-Host "Neuro is running locally at $appUrl"
