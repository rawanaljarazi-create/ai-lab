# Shellbox

Fireworks Mania and Garry's Mod run at the same time. Shells, rockets, fountains,
whistlers and zippers from Fireworks Mania are drawn in Garry's Mod around your
eyes, using that game's sprites and explosion effect. The firework game keeps
doing the physics.

This was built with AI (Cursor Grok), using the games' own files on this PC.
No game assets are included.

## What you need

- Windows
- Fireworks Mania (Steam) and Garry's Mod (Steam)
- Single-player only. Remove the Fireworks Mania plugin before any multiplayer lobby.

## Install

From this folder, after BepInEx 5.4.23.6 win-x64 has been extracted into the
Fireworks Mania folder:

1. Copy `host/addon` to `GarrysMod/garrysmod/addons/shellbox`.
2. Compile `guest/Plugin.cs` against `BepInEx/core/BepInEx.dll` and copy the DLL to
   `Fireworks Mania/BepInEx/plugins/Shellbox.Guest.dll`.

`tools/install.ps1` does those steps. It does not change saves.

## Play

1. Start Fireworks Mania and load a single-player map.
2. Start Garry's Mod on a local map (`gm_construct` is fine).
3. Launch shells in Fireworks Mania. They appear in front of you in Garry's Mod.
   The top-left line should say `live` and a rising tick.

The top-left line is the bridge status. `no camera` means Fireworks Mania is still
in a menu. `stale` means that game stopped publishing.

## Remove

`tools/uninstall.ps1` deletes the addon, the `data/shellbox` folder, the plugin,
and the BepInEx files the installer added (`winhttp.dll`, `doorstop_config.ini`,
and the `BepInEx` folder). It does not remove ReShade or any retail game file.
