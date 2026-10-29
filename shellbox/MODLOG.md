# Shellbox

Fireworks Mania shells drawn inside Garry's Mod while both games run.

## Route

Live passthrough. Guest owns the shell simulation. Host owns the player.

The first slice was positions only: Garry's Mod drew glow sprites. That crossed,
and it was the wrong picture. The user then asked for the 3D models, the effects,
and the Fireworks Mania HUD.

Current route is geometry transfer plus a host-owned spawn list. The guest plugin reads
firework meshes and particle positions, and the host draws them. The Fireworks Mania
inventory is not mirrored. Garry's Mod has its own list of firework names. Choosing one
asks the guest to spawn that definition on the crosshair and light it. A shell that meets
the map or a prop stops there, the guest bursts it, and the blast shoves Source props.

Textures are baked on this PC into `garrysmod/materials/shellbox/` from the
running game. They are not part of the mod. The game's own mod folder only loads
uMod content packs, which need the Unity editor, so the guest side is a BepInEx
5.4.23.6 plugin. The host side is a Garry's Mod addon.

Minecraft is not installed (`.minecraft` has no versions). Half-Life already has
an `mchl` folder for a different mashup, so it was left alone.

## Contract

`docs/CONTRACT.md`. 40 Source units per metre. Snapshot `state.bin`, hits `hits.bin`,
both under `garrysmod/data/shellbox/`.

## Machines

- Windows 10.0.19044 x64
- Fireworks Mania: `C:\Program Files (x86)\Steam\steamapps\common\Fireworks Mania`
  Unity 6000.2.10f1 Mono, game version 2026.2.2, Steam 1079260. No anti-cheat.
  Saves: `%USERPROFILE%\AppData\LocalLow\Laumania ApS\Fireworks Mania` (about 2.3 GB,
  mostly mod.io cache). Config copies, not the whole folder:
  `runtime/backup/singleplayer.config` and `runtime/backup/host.config`.
- Garry's Mod: `C:\Program Files (x86)\Steam\steamapps\common\GarrysMod`
  PatchVersion 2026.04.29, Steam 4000. Maps present: `gm_construct`, `gm_flatgrass`.
  No anti-cheat. ReShade is already in the install and was not changed.

## Not touched

Retail `valve` Half-Life DLLs, the `mchl` mod, Fireworks saves, `host.config`,
`singleplayer.config`, ReShade.

## First slice

One camera coordinate crosses in `guest.log` and `host.log`, and a fake guest
draws a moving shell in `gm_construct` before the real game is required.

## Installed

- BepInEx 5.4.23.6 win-x64 into the Fireworks Mania folder: `winhttp.dll`, `doorstop_config.ini`, `BepInEx\`. It was not there before. `tools/uninstall.ps1` removes those plus the plugin.
- `BepInEx\plugins\Shellbox.Guest.dll` compiled with the .NET Framework csc against that BepInEx and the game's `UnityEngine.dll`.
- Garry's Mod addon `garrysmod\addons\shellbox`.
- Config copies before that install: `runtime/backup/singleplayer.config`, `runtime/backup/host.config`. The 2.3 GB LocalLow tree was not copied. Those two files were not modified.
- `tools/test_protocol.py`: four axis vectors and a 2368-byte round trip. Passed.

## Not run

The keyboard had been used about a second before a launch would have focused the games. Fireworks Mania can open a public lobby, so it was not started and no keys were sent. Garry's Mod was not started either. The in-game screenshot is still missing.

## Next

When the machine is free: start the fake guest, open Garry's Mod on `gm_construct` and read `data/shellbox/host.log`, then stop the fake guest and open Fireworks Mania single-player. Compare `guest.log` and `host.log` for the same `camx`.
