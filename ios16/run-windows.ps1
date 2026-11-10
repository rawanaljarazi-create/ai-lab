# Start the iOS 16.5 virtual machine. The window stays up until you close it.
# Double-click Run.bat, or from this folder:
#   powershell -ExecutionPolicy Bypass -File .\run-windows.ps1
# If the phone is already running, this leaves that one alone.
. "$PSScriptRoot\windows-common.ps1"

$distro = Get-Ios16WslDistro
$here = Resolve-Ios16Dir $PSScriptRoot
$wslHere = Get-Ios16WslPath $here
$quoted = $wslHere.Replace("'", "'\''")

# Is a phone already running? QMP answers within a second when it is.
$phoneRunning = $false
$probe = New-Object System.Net.Sockets.TcpClient
try {
    $probe.Connect('127.0.0.1', 4445)
    $phoneRunning = $true
} catch {
} finally {
    $probe.Dispose()
}

if ($phoneRunning) {
    Write-Host "The phone is already running. Close its window to stop it."
    exit 0
}

Write-Host "Starting iOS 16.5 in $distro. Close the phone window to stop it."
Write-Host "Hold the left mouse button and drag. That is a finger."
Write-Host "H is Home, L is power, and the arrow keys are volume."

& wsl.exe -d $distro -- bash -lc "bash '$quoted/wsl/run.sh'"
exit $LASTEXITCODE
