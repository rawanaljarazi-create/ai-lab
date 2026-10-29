"""Check the contract vectors and a snapshot round trip. No game required."""

import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from protocol import map_offset, pack_snapshot, unmap_offset, unpack_snapshot

def near(a, b, eps=1e-4):
    if abs(a - b) > eps:
        raise SystemExit(f"{a} != {b}")

def test_axes():
    cases = [
        ((0, 0, 10), 0, 0, (400, 0, 0)),
        ((10, 0, 0), 0, 0, (0, -400, 0)),
        ((0, 5, 0), 0, 0, (0, 0, 200)),
        ((10, 0, 0), 90, 0, (400, 0, 0)),
    ]
    for rel, gyaw, hyaw, expect in cases:
        got = map_offset(*rel, gyaw, hyaw)
        for g, e in zip(got, expect):
            near(g, e)
        back = unmap_offset(*got, gyaw, hyaw)
        for g, e in zip(back, rel):
            near(g, e)
    print("axes ok", len(cases))

def test_roundtrip():
    items = [
        {"id": 7, "kind": 1, "state": 0, "r": 255, "g": 10, "b": 20, "x": 1.5, "y": -2.0, "z": 3.25, "vx": 0.5, "vy": 4.0, "vz": -1.0, "radius": 0.25},
        {"id": 0xFFFFFFFF, "kind": 3, "state": 1, "r": 1, "g": 2, "b": 3, "x": 0, "y": 0, "z": 0, "radius": 0.6},
    ]
    blob = pack_snapshot(2, 99, 1234, 1, (8.0, 1.5, -4.0, 90.0, 12.0), items)
    if blob[:4] != b"FWGM" or len(blob) != 64 + 48 * 48:
        raise SystemExit("size")
    # seq sits at offset 8 and is even
    seq = struct.unpack_from("<I", blob, 8)[0]
    if seq != 2:
        raise SystemExit("seq")
    back = unpack_snapshot(blob)
    if back["tick"] != 99 or back["flags"] != 1 or len(back["items"]) != 2:
        raise SystemExit(back)
    near(back["cam"][0], 8.0)
    near(back["cam"][3], 90.0)
    near(back["items"][0]["z"], 3.25)
    near(back["items"][0]["vy"], 4.0)
    if back["items"][1]["id"] != 0xFFFFFFFF or back["items"][1]["state"] != 1:
        raise SystemExit(back["items"][1])
    print("roundtrip ok", len(blob))

def test_geom_layout():
    header = 64
    mesh_at = header
    vert_at = mesh_at + 24 * 24
    tri_at = vert_at + 4000 * 24
    part_at = tri_at + 3000 * 6
    size = part_at + 1000 * 20
    if (mesh_at, vert_at, tri_at, part_at, size) != (64, 640, 96640, 114640, 134640):
        raise SystemExit((mesh_at, vert_at, tri_at, part_at, size))
    print("geom layout ok", size)

if __name__ == "__main__":
    test_axes()
    test_roundtrip()
    test_geom_layout()
    print("protocol ok")
