# Start the iOS 16.5 virtual machine. The window stays up until you close it.
# Double-click Run.bat, or from this folder:
#   powershell -ExecutionPolicy Bypass -File .\run-windows.ps1
. "$PSScriptRoot\windows-common.ps1"

$distro = Get-Ios16WslDistro
$here = Resolve-Ios16Dir $PSScriptRoot
$wslHere = Get-Ios16WslPath $here
$quoted = $wslHere.Replace("'", "'\''")

Write-Host "Starting iOS 16.5 in $distro. Close the phone window to stop it."
Write-Host "Click and drag in the iPhone touch window. TigerVNC is the picture."
Write-Host "Home, Power, and volume are buttons on that window."

$viewer = Join-Path $env:LOCALAPPDATA "ios16\TigerVNC\vncviewer.exe"
if (Test-Path -LiteralPath $viewer) {
    Write-Host "Opening the phone in TigerVNC at 127.0.0.1:1"
    Start-Process -FilePath powershell.exe -WindowStyle Hidden -ArgumentList @(
        "-NoProfile", "-Command",
        @"
`$viewer = '$viewer'
`$deadline = (Get-Date).AddMinutes(8)
while ((Get-Date) -lt `$deadline) {
    `$client = New-Object System.Net.Sockets.TcpClient
    try { `$client.Connect('127.0.0.1', 5901); break } catch { Start-Sleep -Seconds 2 } finally { `$client.Dispose() }
}
Start-Process -FilePath `$viewer -ArgumentList @('-RemoteResize=0', '-PreferredEncoding=Raw', '127.0.0.1:1')
"@
    )
}

$touchPad = Join-Path $PSScriptRoot 'touch-pad.ps1'
if (Test-Path -LiteralPath $touchPad) {
    Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
        Where-Object { $_.CommandLine -match 'touch-pad\.ps1' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Process -FilePath powershell.exe -ArgumentList @(
        '-NoProfile', '-Sta', '-ExecutionPolicy', 'Bypass', '-File', $touchPad
    )
}

& wsl.exe -d $distro -- bash -lc "bash '$quoted/wsl/run.sh'"
exit $LASTEXITCODE
