# Grabs one phone-screen frame every couple of seconds while the touch pad is
# open, so the pad can show what it is clicking at. Runs hidden; exits on its
# own when the pad that started it is gone, or when the monitor is unreachable
# for a few minutes (the VM was shut down and nobody is watching a dark room).
param([int]$OwnerId = 0)

$full = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'touch-mirror.py'))
$drive = $full.Substring(0, 1).ToLower()
$wslPy = '/mnt/' + $drive + '/' + $full.Substring(2).Replace('\', '/')

# Clear any frame left over from a previous run.
& wsl.exe -d Ubuntu -- rm -f /tmp/ios16-mirror.raw /tmp/ios16-mirror.png 2>$null | Out-Null

$misses = 0
while ($true) {
    if ($OwnerId -gt 0 -and -not (Get-Process -Id $OwnerId -ErrorAction SilentlyContinue)) {
        break
    }
    $out = & wsl.exe -d Ubuntu -- python3 $wslPy 2>$null
    if ("$out" -like 'frame*') { $misses = 0 } else { $misses++ }
    if ($misses -gt 90) { break }
    Start-Sleep -Seconds 2
}
