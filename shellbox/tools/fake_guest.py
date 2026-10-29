"""Write a live snapshot so Garry's Mod can be checked without Fireworks Mania.

A shell orbits 8 metres in front of a fixed camera. Stop this before launching
the real guest so the two writers do not share the file.
"""

import math
import struct
import time
from pathlib import Path

from protocol import FILE_SIZE, HEADER, pack_snapshot

STATE = Path(r"C:\Program Files (x86)\Steam\steamapps\common\GarrysMod\garrysmod\data\shellbox\state.bin")


def publish(seq: int, tick: int, items: list[dict]) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    odd = seq | 1
    even = odd + 1
    # Open once and keep the same bytes the C# writer uses: odd seq, body, even seq.
    blank = pack_snapshot(even, tick, tick * 16, 1, (0.0, 1.0, 0.0, 0.0, 0.0), items)
    buf = bytearray(blank)
    struct.pack_into("<I", buf, 8, odd)
    # Garry's Mod opens this file every frame. Retry when that handle overlaps ours.
    last_error = None
    for _ in range(40):
        try:
            with STATE.open("r+b" if STATE.exists() else "w+b") as f:
                f.seek(0)
                f.write(buf)
                f.truncate(FILE_SIZE)
                f.flush()
                struct.pack_into("<I", buf, 8, even)
                f.seek(8)
                f.write(buf[8:12])
                f.flush()
            return
        except PermissionError as exc:
            last_error = exc
            time.sleep(0.005)
    raise last_error


def main() -> None:
    print("fake guest ->", STATE)
    tick = 0
    while True:
        ang = tick * 0.08
        items = [
            {
                "id": 1,
                "kind": 1,
                "r": 255,
                "g": 140,
                "b": 40,
                "x": math.sin(ang) * 3.0,
                "y": 1.0 + 6.0 + math.sin(tick * 0.2) * 2.0,
                "z": 8.0,
                "vx": math.cos(ang),
                "vy": 2.0,
                "vz": 0.0,
                "radius": 0.35,
            },
            {
                "id": 2,
                "kind": 3,
                "r": 80,
                "g": 220,
                "b": 255,
                "x": -4.0,
                "y": 1.0,
                "z": 6.0,
                "radius": 0.6,
            },
        ]
        publish(tick * 2 + 2, tick, items)
        line = f"seq={tick * 2 + 2} tick={tick} camx=0.000 camy=1.000 camz=0.000 yaw=0.0 count=2 cam=1\n"
        (STATE.parent / "guest.log").write_text(line, encoding="ascii")
        tick += 1
        time.sleep(1 / 30)


if __name__ == "__main__":
    main()
