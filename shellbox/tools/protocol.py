"""Shellbox snapshot layout. The byte layout in docs/CONTRACT.md is the spec."""

from __future__ import annotations

import math
import struct

HEADER = 64
RECORD = 48
MAX_RECORDS = 48
FILE_SIZE = HEADER + RECORD * MAX_RECORDS
SCALE = 40.0

KIND_SHELL = 1
KIND_ROCKET = 2
KIND_FOUNTAIN = 3
KIND_WHISTLER = 6
KIND_ZIPPER = 7


def map_offset(ux: float, uy: float, uz: float, guest_yaw: float, host_yaw: float) -> tuple[float, float, float]:
    yaw = math.radians(guest_yaw)
    local_f = ux * math.sin(yaw) + uz * math.cos(yaw)
    local_r = ux * math.cos(yaw) - uz * math.sin(yaw)
    gy = math.radians(host_yaw)
    ox = math.cos(gy) * local_f * SCALE + math.sin(gy) * local_r * SCALE
    oy = math.sin(gy) * local_f * SCALE + (-math.cos(gy)) * local_r * SCALE
    oz = uy * SCALE
    return ox, oy, oz


def unmap_offset(ox: float, oy: float, oz: float, guest_yaw: float, host_yaw: float) -> tuple[float, float, float]:
    hy = math.radians(host_yaw)
    local_f = (math.cos(hy) * ox + math.sin(hy) * oy) / SCALE
    local_r = (math.sin(hy) * ox - math.cos(hy) * oy) / SCALE
    up = oz / SCALE
    gy = math.radians(guest_yaw)
    ux = math.sin(gy) * local_f + math.cos(gy) * local_r
    uz = math.cos(gy) * local_f - math.sin(gy) * local_r
    return ux, up, uz


def pack_snapshot(seq: int, tick: int, time_ms: int, flags: int, cam, items: list[dict]) -> bytes:
    if seq % 2 == 1:
        raise ValueError("published seq must be even")
    buf = bytearray(FILE_SIZE)
    struct.pack_into(
        "<4sHHIIIHH",
        buf,
        0,
        b"FWGM",
        1,
        HEADER,
        seq,
        tick,
        time_ms & 0xFFFFFFFF,
        len(items),
        flags,
    )
    cx, cy, cz, yaw, pitch = cam
    struct.pack_into("<fffff", buf, 24, cx, cy, cz, yaw, pitch)
    for i, item in enumerate(items[:MAX_RECORDS]):
        o = HEADER + i * RECORD
        struct.pack_into(
            "<IBBBBB3x7f",
            buf,
            o,
            item["id"] & 0xFFFFFFFF,
            item["kind"],
            item.get("state", 0),
            item["r"],
            item["g"],
            item["b"],
            item["x"],
            item["y"],
            item["z"],
            item.get("vx", 0.0),
            item.get("vy", 0.0),
            item.get("vz", 0.0),
            item.get("radius", 0.25),
        )
    return bytes(buf)


def unpack_snapshot(data: bytes) -> dict:
    if data[:4] != b"FWGM":
        raise ValueError("bad magic")
    version, header, seq, tick, time_ms, count, flags = struct.unpack_from("<HHIIIHH", data, 4)
    if version != 1 or header != HEADER or count > MAX_RECORDS:
        raise ValueError("bad header")
    cam = struct.unpack_from("<fffff", data, 24)
    items = []
    for i in range(count):
        o = HEADER + i * RECORD
        id_, kind, state, r, g, b, x, y, z, vx, vy, vz, radius = struct.unpack_from("<IBBBBB3x7f", data, o)
        items.append(
            dict(id=id_, kind=kind, state=state, r=r, g=g, b=b, x=x, y=y, z=z, vx=vx, vy=vy, vz=vz, radius=radius)
        )
    return {"seq": seq, "tick": tick, "time_ms": time_ms, "flags": flags, "cam": cam, "items": items}
