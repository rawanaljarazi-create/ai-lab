# Keeps a picture of the phone updating in the touch pad.
# One grabber stays connected to QEMU and writes a new frame about five
# times a second. This process exits when the pad that started it is gone.
param([int]$OwnerId = 0)

$full = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'touch-mirror.py'))
$drive = $full.Substring(0, 1).ToLower()
$wslPy = '/mnt/' + $drive + '/' + $full.Substring(2).Replace('\', '/')

# wsl.exe joins everything after -- into one shell line, which strips the
# quoting from a python -c one-liner - so the flag never appeared and the
# grabber quit instantly. touch is a plain two-token command and survives.
& wsl.exe -d Ubuntu -- touch /tmp/ios16-mirror.run
& wsl.exe -d Ubuntu -- rm -f /tmp/ios16-mirror.raw /tmp/ios16-mirror.png /tmp/ios16-mirror.bmp 2>$null | Out-Null

$grabber = Start-Process -FilePath wsl.exe -ArgumentList @(
    '-d', 'Ubuntu', '--', 'python3', $wslPy
) -WindowStyle Hidden -PassThru

while ($true) {
    if ($OwnerId -gt 0 -and -not (Get-Process -Id $OwnerId -ErrorAction SilentlyContinue)) {
        break
    }
    if ($grabber.HasExited) { break }
    Start-Sleep -Milliseconds 400
}

& wsl.exe -d Ubuntu -- rm -f /tmp/ios16-mirror.run 2>$null | Out-Null
if (-not $grabber.HasExited) {
    Stop-Process -Id $grabber.Id -Force -ErrorAction SilentlyContinue
}
