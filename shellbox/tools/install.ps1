# Install Shellbox. Adds a Garry's Mod addon and a BepInEx plugin.
# Does not edit saves. Refuses to run if Fireworks Mania or Garry's Mod is running.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$fw = "C:\Program Files (x86)\Steam\steamapps\common\Fireworks Mania"
$gmod = "C:\Program Files (x86)\Steam\steamapps\common\GarrysMod"
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$zip = Join-Path $root ".deps\BepInEx_win_x64_5.4.23.6.zip"
$staged = Join-Path $root ".deps\bepinex"

foreach ($name in @("Fireworks Mania", "gmod", "gmod_win64")) {
    $hit = Get-Process -Name $name -ErrorAction SilentlyContinue
    if ($hit) { throw "$name is running (pid $($hit.Id)). Close it first." }
}

if (-not (Test-Path (Join-Path $fw "BepInEx\core\BepInEx.dll"))) {
    if (-not (Test-Path $staged)) {
        if (-not (Test-Path $zip)) { throw "Missing $zip" }
        Expand-Archive -Path $zip -DestinationPath $staged -Force
    }
    Copy-Item (Join-Path $staged "winhttp.dll") $fw -Force
    Copy-Item (Join-Path $staged "doorstop_config.ini") $fw -Force
    Copy-Item (Join-Path $staged "BepInEx") (Join-Path $fw "BepInEx") -Recurse -Force
}

$dll = Join-Path $root "runtime\Shellbox.Guest.dll"
$managed = Join-Path $fw "Fireworks Mania_Data\Managed"
New-Item -ItemType Directory -Force -Path (Split-Path $dll) | Out-Null
& $csc /nologo /target:library /optimize "/out:$dll" `
    "/reference:$(Join-Path $fw 'BepInEx\core\BepInEx.dll')" `
    "/reference:$(Join-Path $managed 'UnityEngine.dll')" `
    "/reference:$(Join-Path $managed 'UnityEngine.CoreModule.dll')" `
    "/reference:$(Join-Path $managed 'netstandard.dll')" `
    (Join-Path $root "guest\Plugin.cs") `
    (Join-Path $root "guest\Visual.cs") `
    (Join-Path $root "guest\Hud.cs") `
    (Join-Path $root "guest\Spawn.cs")
if ($LASTEXITCODE -ne 0) { throw "csc failed" }
New-Item -ItemType Directory -Force -Path (Join-Path $fw "BepInEx\plugins") | Out-Null
Copy-Item $dll (Join-Path $fw "BepInEx\plugins\Shellbox.Guest.dll") -Force

$addon = Join-Path $gmod "garrysmod\addons\shellbox"
if (Test-Path $addon) { Remove-Item $addon -Recurse -Force }
Copy-Item (Join-Path $root "host\addon") $addon -Recurse -Force
Write-Output "installed addon=$addon plugin=$fw\BepInEx\plugins\Shellbox.Guest.dll"
