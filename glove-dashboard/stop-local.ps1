$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$processFile = Join-Path $projectRoot '.logs\processes.json'

if (Test-Path -LiteralPath $processFile) {
    $saved = Get-Content -Raw -LiteralPath $processFile | ConvertFrom-Json
    foreach ($processId in @($saved.backend, $saved.frontend)) {
        if ($processId -and (Get-Process -Id $processId -ErrorAction SilentlyContinue)) {
            try { Stop-Process -Id $processId -ErrorAction Stop }
            catch { Write-Warning "Could not stop saved process $processId; checking active app ports instead." }
        }
    }
}

# Python and Node can replace their original launcher process. Clean up only
# listeners on this application's two fixed localhost ports and only when their
# process names match the expected runtimes.
foreach ($port in @(8765, 3000)) {
    $listener = netstat -ano -p tcp | Select-String ":$port\s+.*LISTENING" | Select-Object -First 1
    if (-not $listener) { continue }
    $listenerPid = [int](($listener.ToString().Trim() -split '\s+')[-1])
    $listenerProcess = Get-Process -Id $listenerPid -ErrorAction SilentlyContinue
    if ($listenerProcess -and $listenerProcess.ProcessName -in @('python', 'node')) {
        try { Stop-Process -Id $listenerPid -ErrorAction Stop }
        catch { Write-Warning "Could not stop $($listenerProcess.ProcessName) listener $listenerPid on port $port." }
    }
}
Write-Host 'Glove Telemetry has stopped.'
