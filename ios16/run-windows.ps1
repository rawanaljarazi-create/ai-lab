# Start the iOS 16.5 virtual machine. The window stays up until you close it.
# Double-click Run.bat, or from this folder:
#   powershell -ExecutionPolicy Bypass -File .\run-windows.ps1
. "$PSScriptRoot\windows-common.ps1"

$distro = Get-Ios16WslDistro
$here = Resolve-Ios16Dir $PSScriptRoot
$wslHere = Get-Ios16WslPath $here
$quoted = $wslHere.Replace("'", "'\''")

Write-Host "Starting iOS 16.5 in $distro. Close the phone window to stop it."
Write-Host "Hold the left mouse button to touch. H is Home, L is power, Up and Down are volume."
& wsl.exe -d $distro -- bash -lc "bash '$quoted/wsl/run.sh'"
exit $LASTEXITCODE
