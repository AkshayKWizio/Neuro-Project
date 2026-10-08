# Create-Desktop-Shortcut.ps1
# Creates a single-click desktop shortcut for the Neuro application.

$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $DesktopPath "Neuro Rehabilitation.lnk"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetCmd = Join-Path $projectRoot "Run-Neuro.cmd"

$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $targetCmd
$Shortcut.WorkingDirectory = $projectRoot
$Shortcut.Description = "Neuro Glove Rehabilitation Platform"

# Use browser icon if available
$edgePath = Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"
if (Test-Path -LiteralPath $edgePath) {
    $Shortcut.IconLocation = "$edgePath,0"
}

$Shortcut.Save()
Write-Host "Desktop shortcut created successfully at: $ShortcutPath" -ForegroundColor Green
