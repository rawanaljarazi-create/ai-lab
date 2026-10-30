#!/usr/bin/env python3
"""Heal the two boot failures this PC hits every time, before QEMU starts.

Launch Services retries forever when the prebuilt kernel refuses a CPU-monitor
escape, and that refusal is a printk in a loop. Only that call is replaced
with a no-op. Skipping the whole check deadlocks a kernel lock.

Clicks and the H/L/volume keys reach the guest, then backboardd drops them:
the input library registers its touch screen on a send-only HID client, so the
usage page is read back as 0 and the screen is "not a digitizer". The client
table is swapped so the normal HID client is tried first.
"""
import struct
import subprocess
import sys
from pathlib import Path

DENIAL = b"process %s[%d] denied attempt to escape CPU monitor"
# Compiled from { HID_CLIENT_SIMPLE, HID_CLIENT_RATE_CONTROLLED } and the
# following cstring. SIMPLE is 4 and cannot answer property reads.
HID_OLD = b"\x04\x00\x00\x00\x03\x00\x00\x00back"
HID_NEW = b"\x03\x00\x00\x00\x04\x00\x00\x00back"


def segments(data):
    if data[:4] != b"\xcf\xfa\xed\xfe":
        raise SystemExit("fix-guest.py: kernel is not a 64-bit Mach-O")
    ncmds = struct.unpack_from("<I", data, 16)[0]
    off = 32
    found = []
    for _ in range(ncmds):
        cmd, cmdsize = struct.unpack_from("<II", data, off)
        if cmd == 0x19:
            name = data[off + 8:off + 24].split(b"\x00", 1)[0].decode()
            vmaddr, vmsize, fileoff, filesize = struct.unpack_from("<QQQQ", data, off + 24)
            found.append((name, vmaddr, vmsize, fileoff, filesize))
        off += cmdsize
    return found


def va_of(segs, fileoff):
    for name, vm, vms, fo, fs in segs:
        if fo <= fileoff < fo + fs:
            return vm + (fileoff - fo)
    return None


def file_of(segs, va):
    for name, vm, vms, fo, fs in segs:
        if vm <= va < vm + vms:
            return fo + (va - vm)
    return None


def u32(data, off):
    return struct.unpack_from("<I", data, off)[0]


def adrp_target(ins, pc):
    if (ins & 0x9F000000) != 0x90000000:
        return None
    immlo = (ins >> 29) & 3
    immhi = (ins >> 5) & 0x7FFFF
    imm = (immhi << 2) | immlo
    if imm & (1 << 20):
        imm -= 1 << 21
    return (pc & ~0xFFF) + (imm << 12), ins & 31


def add_imm(ins):
    if (ins & 0xFF800000) != 0x91000000:
        return None
    imm12 = (ins >> 10) & 0xFFF
    if (ins >> 22) & 1:
        imm12 <<= 12
    return imm12, (ins >> 5) & 31, ins & 31


def cond_target(ins, pc):
    """Where a conditional branch goes, or None."""
    if (ins & 0xFF000010) == 0x54000000:
        imm = (ins >> 5) & 0x7FFFF
        if imm & (1 << 18):
            imm -= 1 << 19
        return pc + imm * 4
    if (ins & 0x7E000000) == 0x34000000:
        imm = (ins >> 5) & 0x7FFFF
        if imm & (1 << 18):
            imm -= 1 << 19
        return pc + imm * 4
    if (ins & 0x7E000000) == 0x36000000:
        imm = (ins >> 5) & 0x3FFF
        if imm & (1 << 13):
            imm -= 1 << 14
        return pc + imm * 4
    return None


NOP = 0xD503201F


def printk_call(data):
    """File offset of the call that prints the CPU-monitor denial, if it is still a call."""
    segs = segments(data)
    idx = data.find(DENIAL)
    if idx < 0:
        return None
    string_va = va_of(segs, idx)
    execseg = next(s for s in segs if s[0] == "__TEXT_EXEC")
    _, vm, vms, fo, fs = execseg
    for i in range(0, fs - 16, 4):
        pc = vm + i
        decoded = adrp_target(u32(data, fo + i), pc)
        if decoded is None:
            continue
        page, rd = decoded
        for k in range(1, 5):
            added = add_imm(u32(data, fo + i + 4 * k))
            if added is None:
                continue
            imm12, rn, rd2 = added
            if rn != rd or page + imm12 != string_va:
                continue
            for j in range(k + 1, k + 4):
                if i + 4 * j + 4 > fs:
                    break
                at = fo + i + 4 * j
                call = u32(data, at)
                if (call & 0xFC000000) == 0x94000000 or call == NOP:
                    return at
    return None


def patch_kernel(path):
    backup = path.with_name(path.name + ".orig")
    # Skipping the check, rather than the printk, left a ticket lock held and the guest panicked.
    if backup.is_file():
        data = bytearray(path.read_bytes())
        call = printk_call(data)
        if call is None or u32(data, call) != NOP:
            path.write_bytes(backup.read_bytes())
    data = bytearray(path.read_bytes())
    call = printk_call(data)
    if call is None:
        print("fix-guest.py: kernel has no CPU-monitor denial, left as it is")
        return False
    if u32(data, call) == NOP:
        print("fix-guest.py: CPU-monitor denial already silenced")
        return False
    if not backup.is_file():
        backup.write_bytes(bytes(data))
    struct.pack_into("<I", data, call, NOP)
    path.write_bytes(data)
    print("fix-guest.py: CPU-monitor denial will not be printed")
    return True


def patch_hid(path):
    data = bytearray(path.read_bytes())
    at = data.find(HID_OLD)
    if at < 0:
        if data.find(HID_NEW) >= 0:
            return False
        print(f"fix-guest.py: {path} has no HID client table, left as it is")
        return False
    data[at:at + len(HID_NEW)] = HID_NEW
    path.write_bytes(data)
    print(f"fix-guest.py: touch screen will register on the normal HID client ({path})")
    return True


def rebuild_ramdisk(root):
    userland = root / "userland"
    subprocess.check_call(
        [sys.executable, str(root / "tools" / "apfs" / "mkapfs.py"),
         "-z", "--plain", "fw", "-o", "root.apfs", "redwood=root"],
        cwd=userland,
    )
    print("fix-guest.py: root ramdisk rebuilt")


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else Path.home() / "ios16-vm" / "hackios")
    kernel = root / "prebuilt" / "mach.development.bcm2837"
    if kernel.is_file():
        patch_kernel(kernel)
    else:
        print(f"fix-guest.py: no kernel at {kernel}")
    changed = False
    for rel in (
        "userland/root/lib/libhakios.dylib",
        "userland/obj/libhakios.dylib",
        "prebuilt/userland/libhakios.dylib",
    ):
        path = root / rel
        if path.is_file() and patch_hid(path):
            changed = changed or rel.startswith("userland/root/")
    dylib = root / "userland/root/lib/libhakios.dylib"
    ram = root / "userland/root.apfs"
    stale = dylib.is_file() and ram.is_file() and dylib.stat().st_mtime > ram.stat().st_mtime + 1
    if changed or stale:
        rebuild_ramdisk(root)


if __name__ == "__main__":
    main()
