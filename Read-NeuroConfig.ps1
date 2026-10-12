$script:NeuroConfigLibraryRoot = $PSScriptRoot

function Resolve-NeuroPath {
    param([string]$Value, [string]$Root)
    if (-not $Value) { return '' }
    if ([IO.Path]::IsPathRooted($Value)) { return [IO.Path]::GetFullPath($Value) }
    return [IO.Path]::GetFullPath((Join-Path $Root $Value))
}

function Get-NeuroConfig {
    param([string]$ConfigFile = '')
    $templateFile = Join-Path $script:NeuroConfigLibraryRoot 'neuro.config.example.json'
    if (-not $ConfigFile) { $ConfigFile = Join-Path $script:NeuroConfigLibraryRoot 'neuro.local.json' }
    $ConfigFile = Resolve-NeuroPath $ConfigFile $script:NeuroConfigLibraryRoot
    if (-not (Test-Path -LiteralPath $ConfigFile)) {
        Copy-Item -LiteralPath $templateFile -Destination $ConfigFile
        Write-Host "Created editable local config: $ConfigFile"
    }
    $settings = Get-Content -Raw -LiteralPath $templateFile | ConvertFrom-Json
    $override = Get-Content -Raw -LiteralPath $ConfigFile | ConvertFrom-Json
    foreach ($section in $override.PSObject.Properties) {
        if (-not $settings.PSObject.Properties[$section.Name]) { throw "Unknown config section: $($section.Name)" }
        if ($section.Name -eq 'schema_version') {
            if (($section.Value -isnot [int] -and $section.Value -isnot [long]) -or $section.Value -ne 1) { throw 'Unsupported config schema_version.' }
            continue
        }
        foreach ($entry in $section.Value.PSObject.Properties) {
            if (-not $settings.($section.Name).PSObject.Properties[$entry.Name]) { throw "Unknown config setting: $($section.Name).$($entry.Name)" }
            $settings.($section.Name).($entry.Name) = $entry.Value
        }
    }
    foreach ($name in @('host', 'osc_receive_host', 'osc_send_host')) {
        if ($settings.network.$name -ne '127.0.0.1') { throw "network.$name must stay 127.0.0.1 for this local-only app." }
    }
    foreach ($name in @('frontend_port', 'backend_port', 'osc_receive_port', 'osc_send_port')) {
        $value = $settings.network.$name
        if ($value -isnot [int] -and $value -isnot [long]) { throw "network.$name must be an integer." }
        if ($value -lt 1 -or $value -gt 65535) { throw "Invalid port: network.$name" }
    }
    if ($settings.network.frontend_port -eq $settings.network.backend_port) { throw 'Frontend and backend ports must differ.' }
    foreach ($field in @('watch_interval_ms', 'page_timeout_seconds')) {
        if (($settings.runtime.$field -isnot [int] -and $settings.runtime.$field -isnot [long]) -or $settings.runtime.$field -le 0) { throw "runtime.$field must be a positive integer." }
    }
    foreach ($field in @('width', 'height')) {
        if (($settings.browser.$field -isnot [int] -and $settings.browser.$field -isnot [long]) -or $settings.browser.$field -le 0) { throw "browser.$field must be a positive integer." }
    }
    if ($settings.runtime.watch_polling -isnot [bool] -or $settings.browser.app_mode -isnot [bool]) { throw 'Polling and app_mode must be JSON booleans.' }
    $root = Split-Path -Parent $ConfigFile
    foreach ($entry in $settings.paths.PSObject.Properties) {
        if ($entry.Value -isnot [string] -or -not $entry.Value) { throw "paths.$($entry.Name) must be a non-empty path." }
        $settings.paths.($entry.Name) = Resolve-NeuroPath $entry.Value $root
    }
    foreach ($field in @('python_executable', 'node_executable', 'npm_executable')) {
        if ($settings.runtime.$field -isnot [string]) { throw "runtime.$field must be a path string (or empty for auto-detection)." }
        $settings.runtime.$field = Resolve-NeuroPath $settings.runtime.$field $root
    }
    if ($settings.browser.executable -isnot [string]) { throw 'browser.executable must be a path string.' }
    $settings.browser.executable = Resolve-NeuroPath $settings.browser.executable $root
    $settings | Add-Member NoteProperty config_file $ConfigFile
    $settings | Add-Member NoteProperty project_root $root
    $settings | Add-Member NoteProperty frontend_url ("http://{0}:{1}/" -f $settings.network.host, $settings.network.frontend_port)
    return $settings
}
