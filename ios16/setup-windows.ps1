# Build the iOS 16.5 virtual machine inside WSL2.
# Right-click this file and choose "Run with PowerShell", or from this folder:
#   powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1
$ErrorActionPreference = "Stop"

function Strip-WslText([string]$Text) {
    return ($Text -replace "`0", "").Trim()
}

if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
    Write-Error "WSL is not installed. In an Administrator terminal run: wsl --install -d Ubuntu`nReboot, open Ubuntu once and create its user, then run this script again."
}

$rawList = & wsl.exe --list --quiet 2>&1 | Out-String
$list = Strip-WslText $rawList
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($list)) {
    Write-Error "No WSL distro is installed. In an Administrator terminal run: wsl --install -d Ubuntu`nReboot, open Ubuntu once and create its user, then run this script again."
}

$names = @($list -split "`r?`n" | ForEach-Object { Strip-WslText $_ } | Where-Object { $_ -ne "" })
$distro = $names | Where-Object { $_ -match "^Ubuntu" } | Select-Object -First 1
if (-not $distro) { $distro = $names[0] }
Write-Host "Using WSL distro: $distro"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$wslHere = Strip-WslText ((& wsl.exe -d $distro -- wslpath -a $here) | Out-String)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($wslHere)) {
    Write-Error "Could not convert $here into a WSL path."
}

Write-Host "Building under the Linux home directory (about 20 GB, and a long download from Apple)."
& wsl.exe -d $distro -- bash -lc "bash '$wslHere/wsl/setup.sh'"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Ready. Start the machine with: powershell -ExecutionPolicy Bypass -File .\run-windows.ps1"
