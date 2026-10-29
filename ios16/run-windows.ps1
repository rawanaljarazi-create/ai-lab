# Start the iOS 16.5 virtual machine. A window opens on Windows 11 (WSLg).
#   powershell -ExecutionPolicy Bypass -File .\run-windows.ps1
# Optional: minutes to keep the machine up (default 20).
param([int]$Minutes = 20)

$ErrorActionPreference = "Stop"

function Strip-WslText([string]$Text) {
    return ($Text -replace "`0", "").Trim()
}

if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
    Write-Error "WSL is not installed. Run setup-windows.ps1 first."
}

$rawList = & wsl.exe --list --quiet 2>&1 | Out-String
$list = Strip-WslText $rawList
$names = @($list -split "`r?`n" | ForEach-Object { Strip-WslText $_ } | Where-Object { $_ -ne "" })
if ($names.Count -eq 0) { Write-Error "No WSL distro is installed. Run setup-windows.ps1 first." }
$distro = $names | Where-Object { $_ -match "^Ubuntu" } | Select-Object -First 1
if (-not $distro) { $distro = $names[0] }

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$wslHere = Strip-WslText ((& wsl.exe -d $distro -- wslpath -a $here) | Out-String)
$seconds = [Math]::Max(120, $Minutes * 60)

Write-Host "Starting iOS 16.5 for $Minutes minutes in $distro."
Write-Host "Hold the left mouse button to touch. H is Home, L is power, Up and Down are volume."
& wsl.exe -d $distro -- bash -lc "bash '$wslHere/wsl/run.sh' $seconds"
exit $LASTEXITCODE
