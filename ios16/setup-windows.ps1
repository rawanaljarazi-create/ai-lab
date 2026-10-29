# Build the iOS 16.5 virtual machine inside WSL2.
# Double-click Setup.bat, or from this folder:
#   powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1
. "$PSScriptRoot\windows-common.ps1"

$distro = Get-Ios16WslDistro
Write-Host "Using WSL distro: $distro"

$here = Resolve-Ios16Dir $PSScriptRoot
$wslHere = Get-Ios16WslPath $here
$quoted = $wslHere.Replace("'", "'\''")
Write-Host "Scripts: $wslHere"
Write-Host "Building under the Linux home directory. The download from Apple is several gigabytes."
& wsl.exe -d $distro -- bash -lc "bash '$quoted/wsl/setup.sh'"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Ready. Start the machine with Run.bat. It stays up until you close the window."
