# Create-Desktop-Shortcut.ps1
# Creates a single-click desktop shortcut for the Neuro application.

$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $DesktopPath "Neuro Rehabilitation.lnk"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $projectRoot 'Read-NeuroConfig.ps1')
$settings = Get-NeuroConfig
$targetCmd = Join-Path $projectRoot "Run-Neuro.cmd"

$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $targetCmd
$Shortcut.WorkingDirectory = $projectRoot
$Shortcut.Description = "Neuro Glove Rehabilitation Platform"

# Use browser icon if available
$browserIcon = $settings.browser.executable
if (-not $browserIcon) { $browserIcon = Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe" }
if (Test-Path -LiteralPath $browserIcon) {
    $Shortcut.IconLocation = "$browserIcon,0"
}

$Shortcut.Save()
Write-Host "Desktop shortcut created successfully at: $ShortcutPath" -ForegroundColor Green
