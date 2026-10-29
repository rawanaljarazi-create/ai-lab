# Remove only the files Shellbox added. Does not touch saves, ReShade, or retail DLLs.

$ErrorActionPreference = "Stop"
$fw = "C:\Program Files (x86)\Steam\steamapps\common\Fireworks Mania"
$gmod = "C:\Program Files (x86)\Steam\steamapps\common\GarrysMod"

foreach ($name in @("Fireworks Mania", "gmod", "gmod_win64")) {
    $hit = Get-Process -Name $name -ErrorAction SilentlyContinue
    if ($hit) { throw "$name is running (pid $($hit.Id)). Close it first." }
}

$paths = @(
    (Join-Path $gmod "garrysmod\addons\shellbox"),
    (Join-Path $gmod "garrysmod\materials\shellbox"),
    (Join-Path $gmod "garrysmod\data\shellbox"),
    (Join-Path $fw "BepInEx\plugins\Shellbox.Guest.dll"),
    (Join-Path $fw "winhttp.dll"),
    (Join-Path $fw "doorstop_config.ini"),
    (Join-Path $fw "BepInEx")
)
foreach ($p in $paths) {
    if (Test-Path $p) {
        Remove-Item $p -Recurse -Force
        Write-Output "removed $p"
    }
}
