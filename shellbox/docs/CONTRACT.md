# Shellbox bridge contract

Protocol name: `shellbox`
Magic: `FWGM` (snapshot), `FWHT` (hits), `FWGE` (geometry). Catalog and spawn are text files, `catalog.txt` and `spawn.txt`.
Version: 1
Byte order: little-endian
OS: Windows 10 x64. No Proton, Wine, or CrossOver.

## Route

Live passthrough. Fireworks Mania runs the firework simulation. Garry's Mod owns the
player and the firework list. The host draws the guest's meshes and particles in the
world. The list is Garry's Mod's own panel: pick a name, and the guest spawns that
firework where you are looking and lights it. This is geometry transfer plus a spawn
command, not a frame composite and not a copy of the Fireworks Mania inventory.
Textures are read from the running game and written into the Garry's Mod materials
folder on this PC. They are not copied into the mod.

Nearest prior projects: SkyCraft, which draws guest meshes in the host and pastes the HUD
as an image, and the Minecraft-in-GTA bridge. Shellbox draws the meshes and particles
itself. The panel is a list of firework names, not a pasted image.
The unit scale (40 host units per guest metre) is the same number the Minecraft × Half-Life
bridge uses per block, and it sits 1.6% from Valve's 1-inch reading of a Source unit
(39.37 units per metre). 40 is the chosen scale.

## Versions

- Guest: Fireworks Mania, Steam app 1079260, Unity 6000.2.10f1 (Mono), game version 2026.2.2
  from `Player.log`. Loader: BepInEx 5.4.23.6 win-x64 (Doorstop `winhttp.dll`), installed for
  this mod. The game's own mod folder only loads uMod content packs, which need the Unity
  editor to build, so it cannot publish live positions.
- Host: Garry's Mod, Steam app 4000, Source, `PatchVersion=2026.04.29`. Loader: the game's
  own `garrysmod/addons` folder. No new loader.

## Ownership

| Thing | Owner | Hand-back |
|---|---|---|
| Player body, look, and walking | Garry's Mod | Never. The guest camera is only an anchor. |
| Menus, pause, loading | Each game, locally | A paused or menu guest keeps publishing; `flags` bit 0 clears when it has no camera. |
| Shells, rockets, fountains, whistlers, zippers | Fireworks Mania | A host hit may destroy a projectile in the guest (see collision). |
| Mortars, cakes, fuses, inventory, blueprints, saves | Fireworks Mania | The host lists definition names and asks the guest to spawn one by id. It does not write saves or press the guest's buttons. |
| What the player sees | Garry's Mod | Guest meshes, guest particles, dynamic lights, HL2 explosion effect and sound. |
| Health, weapons, props | Garry's Mod | Guest damage never changes host health. |

Single-player only. The guest plugin writes a file on this PC and opens no socket. Quit
Fireworks Mania and start it without BepInEx before joining any multiplayer lobby.

## Units and axes

Guest: Unity metres. X right, Y up, Z forward. Yaw degrees, 0 faces +Z, 90 faces +X.
Host: Source units. X forward, Y left, Z up. Yaw degrees, 0 faces +X, 90 faces +Y.
Scale: 40 Source units per metre.

Guest position relative to the guest camera, rotated into the host look:

```
yaw = radians(guest_yaw)
forward = (sin(yaw), 0, cos(yaw))
right   = (cos(yaw), 0, -sin(yaw))
local_forward = dot(rel.xz, forward.xz)
local_right   = dot(rel.xz, right.xz)
local_up      = rel.y

gy = radians(host_yaw)
host_forward = (cos(gy), sin(gy), 0)
host_right   = (sin(gy), -cos(gy), 0)
host_offset = host_forward * local_forward * 40
            + host_right   * local_right   * 40
            + (0, 0, local_up * 40)
host_pos = planted_host_eye + host_offset
```

`planted_host_eye` and both yaws are taken once, the first frame a guest camera exists
(or when the player runs `shellbox_plant`). The offset uses the guest position relative
to that planted guest camera, not the camera this frame. Walking and looking in Garry's
Mod leave the shells where they are. Guest pitch is stored and unused. Host pitch is
ignored so the show stays upright.

Shells are drawn with depth testing on (`$ignorez 0`). A shell the map hides is not
drawn and does not cast a dynamic light. A flight segment that hits the world or a prop
stops at the hit. The host plays its explosion there and pushes nearby physics props.
The same hit is written until that shell leaves the snapshot. The guest moves the
projectile onto that surface, freezes it, tries to burst it, and removes it about
three seconds later. A moving prop that reaches a shell does the same.

The host turns a Garry's Mod point back into guest metres with the planted anchor:

```
ox, oy, oz = host_pos - planted_host_eye
local_forward = (cos(host_yaw) * ox + sin(host_yaw) * oy) / 40
local_right   = (sin(host_yaw) * ox - cos(host_yaw) * oy) / 40
local_up      = oz / 40
ux = sin(guest_yaw) * local_forward + cos(guest_yaw) * local_right
uy = local_up
uz = cos(guest_yaw) * local_forward - sin(guest_yaw) * local_right
guest_pos = planted_guest_camera + (ux, uy, uz)
```

A spawn uses that so the firework appears where the Garry's Mod crosshair hits. The
facing yaw is `planted_guest_yaw - (look_yaw - planted_host_yaw)`.

Checked vectors (guest yaw 0, host yaw 0 unless noted):

| Relative guest metres | Host offset units |
|---|---|
| (0, 0, 10) forward | (400, 0, 0) |
| (10, 0, 0) right | (0, -400, 0) |
| (0, 5, 0) up | (0, 0, 200) |
| guest yaw 90, relative (10, 0, 0) | (400, 0, 0) forward |

## Channels

Snapshot `garrysmod/data/shellbox/state.bin`, guest writes, host reads.

- Fixed 2368 bytes: 64-byte header + 48 records × 48 bytes.
- Rate: every guest `Update`. The host keeps the last good snapshot.
- Seqlock: `seq` at offset 8. Odd means a write is in progress. The writer flushes the odd
  seq, then the body, then the even seq. The reader uses the snapshot only when two reads
  show the same even seq. A late or torn read keeps the previous snapshot. No queue, so a
  full tick drops nothing older than the latest write.
- `count` is 0..48. Extra shells are dropped, nearest to the guest camera first.
- `flags` bit 0: a camera exists.
- `tick` increases by 1 per published update. `time_ms` is guest uptime in milliseconds,
  low 32 bits.

Header:

| Offset | Type | Field |
|---|---|---|
| 0 | 4 bytes | `FWGM` |
| 4 | u16 | version = 1 |
| 6 | u16 | header size = 64 |
| 8 | u32 | seq |
| 12 | u32 | tick |
| 16 | u32 | time_ms |
| 20 | u16 | count |
| 22 | u16 | flags |
| 24 | f32 | camera x metres |
| 28 | f32 | camera y |
| 32 | f32 | camera z |
| 36 | f32 | camera yaw degrees |
| 40 | f32 | camera pitch degrees |
| 44 | 20 bytes | zero |

Record, stride 48, first record at offset 64:

| Offset | Type | Field |
|---|---|---|
| 0 | u32 | id (Unity instance id, bits unchanged) |
| 4 | u8 | kind: 1 shell, 2 rocket, 3 fountain, 6 whistler, 7 zipper |
| 5 | u8 | state: 0 live, 1 exploded (guest no longer has the object) |
| 6 | u8 | r, g, b |
| 9 | 3 bytes | zero |
| 12 | 6×f32 | x, y, z metres and vx, vy, vz metres/second, guest world |
| 36 | f32 | radius metres (guest hint; host may draw larger) |
| 40 | 8 bytes | zero |

Hits `garrysmod/data/shellbox/hits.dat`, host writes, guest reads. Garry's Mod's `file.Write` rejects `.bin` and `.log`, so the hit file is `.dat` and the host heartbeat is `host.txt`. The guest still writes `guest.log` with normal file IO.

- Header 16 bytes: `FWHT`, version u16 = 1, header size u16 = 16, seq u32, count u16, pad u16.
- Record 20 bytes: id u32, kind u8, pad 3, x y z f32 in guest metres (informational).
- Count 0..32. The host replaces the file. A bad magic is ignored.
- The host reports a hit for a live kind-1 projectile when its path meets the world or a solid prop. It keeps that hit in the file until the projectile disappears. The position is the contact point in guest metres. The guest freezes the projectile there once. It does not wait for a seen-count. Placed gear (kind 8) is not deleted by a hit. A moving prop that touches one still gets a host-side shove.

Text heartbeats, one line, overwritten: `guest.log` and `host.txt` in the same folder.
They exist so a person can see both sides without reading binary. They are not the channel.

## Lifecycle

1. Start either game first. A missing snapshot means the host draws nothing and says so.
2. The guest sets Unity `runInBackground` so the simulation continues while Garry's Mod is focused, and restores the previous value when the plugin unloads.
3. A guest restart resets `tick` and `seq`. The host treats a lower tick as a new session.
4. If `tick` stops increasing for more than a second, the host calls the guest stale and hides shells.
5. Pause and menus keep the file updating. Death and saves are not bridged.
6. One side crashing leaves the last file on disk. The other side goes stale or reads nothing. Neither game is required to keep running.
7. Uninstall removes the addon, `data/shellbox`, `materials/shellbox`, the plugin DLL, and the BepInEx files this project added. Retail game files are not modified.

## Geometry `geom.bin`

Guest writes, host reads. Magic `FWGE`, version 1, little-endian, fixed 134640 bytes.
Same seqlock as the snapshot: `seq` at offset 8 is odd while the body is changing.
The host keeps the previous body unless two reads show the same even seq.

| Offset | Type | Field |
|---|---|---|
| 0 | 4 bytes | `FWGE` |
| 4 | u16 | version = 1 |
| 6 | u16 | header size = 64 |
| 8 | u32 | seq |
| 12 | u32 | tick |
| 16 | u16 | mesh count, 0..24 |
| 18 | u16 | particle count, 0..1000 |
| 20 | u32 | vertex count, 0..4000 |
| 24 | u32 | triangle count, 0..3000 |

Mesh records start at byte 64, stride 24: filter id u32, vertex start u32, triangle start u32, vertex count u16, triangle count u16, texture key u32. Texture key 0 is an untextured vertex-coloured mesh. Any other key is `materials/shellbox/m_<key>.vtf`, written once from the live texture.

Vertices start at byte 640, stride 24: x y z u v as float32 in guest metres, then r g b a. Triangles start at byte 96640, three little-endian u16 indices into that vertex list. The host swaps the last two indices because the axis map mirrors winding. Particles start at byte 114640, stride 20: x y z size metres, then r g b a. Size is the guest particle's current size.

Meshes and particles use the same planted-anchor map as shells. A mesh bigger than 30 metres on a side is not sent. At most 32 firework roots are exported. After a spawn, fireworks within 90 metres of that spawn are chosen before ones near the guest camera, plus the spawn-tool preview. Loose particle systems farther than 45 metres, or named like weather, are not sent. When this channel is live the host does not also draw the stand-in glow for those shells.

## Spawn list

`catalog.txt` is guest-written text. The first line is `CAT1 <count>`. Each later line is `type`, `id`, `P` or `F`, and `name`, separated by tabs. `P` is placed and held still (a cake, mortar, fountain). `F` is thrown along the crosshair (a loose shell or rocket). At most 400 names.

`spawn.txt` is host-written text, replaced on each click:

```
SP1
<seq>
<id>
<x> <y> <z> <yaw> <vx> <vy> <vz> <kinematic> <ignite>
```

Positions and velocities are guest metres. The guest ignores the seq already on disk when it wakes, then calls `FireworksManager.Spawn` for each newer seq and lights the new firework. Hold Alt in Garry's Mod and click a name, or press 1-9. The firework is spawned where the crosshair meets the world. The mouse wheel scrolls the list while Alt is held.

Fireworks spawned this way stay in the snapshot even when the guest camera is somewhere else: anything within 90 metres of a recent spawn is published before the rest.

## Not covered

Guest sound, other than the host explosion on a hit. The guest world is not the Garry's Mod map; a hit freezes the guest projectile and the blast pushes Source props. Fountains and mortars are not deleted by a hit. No multiplayer. The list is names, not a pixel copy of the Fireworks panel. A texture that cannot be read stays a flat colour.
