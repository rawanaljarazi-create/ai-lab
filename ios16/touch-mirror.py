# Frames of the phone screen for the Windows touch pad.
#
# One process, one monitor connection. Each pass asks QEMU for a PPM, keeps
# every second pixel, and publishes a small BMP. The pad reads that file.
# Nothing here uses the pad's QMP socket, so taps are not queued behind frames.
# Stop by deleting /tmp/ios16-mirror.run.
import os
import socket
import struct
import sys
import time

RAW = '/tmp/ios16-mirror.raw'
BMP = '/tmp/ios16-mirror.bmp'
RUN = '/tmp/ios16-mirror.run'
STEP = 2
PERIOD = 0.2
DEBUG = '/tmp/ios16-mirror.debug'  # touch this file to keep each raw PPM (RAW + '.keep')


def read_until_prompt(sock):
    buf = b''
    sock.settimeout(8)
    while b'(qemu)' not in buf:
        chunk = sock.recv(65536)
        if not chunk:
            raise OSError('monitor closed')
        buf += chunk
        if len(buf) > 1_000_000:
            buf = buf[-1000:]
    return buf


def connect():
    sock = socket.create_connection(('127.0.0.1', 4444), 5)
    read_until_prompt(sock)
    return sock


def shrink_ppm(src, dst):
    with open(src, 'rb') as f:
        if f.readline().strip() != b'P6':
            return False
        tokens = []
        while len(tokens) < 3:
            line = f.readline()
            if not line:
                return False
            if line.startswith(b'#'):
                continue
            tokens.extend(line.split())
        width, height, depth = (int(tokens[0]), int(tokens[1]), int(tokens[2]))
        if depth != 255:
            return False
        rgb = f.read(width * height * 3)
    if len(rgb) < width * height * 3:
        return False
    small_w = width // STEP
    small_h = height // STEP
    if small_w < 1 or small_h < 1:
        return False
    bpp = 4  # 32-bit truecolour B|G|R|A pixels, per user request
    stride = (small_w * bpp + 3) & ~3
    pixels = bytearray(stride * small_h)
    # Whole-row operations: three strided slices pick one colour channel of
    # every STEPth pixel (byte-step = STEP pixels x 3 bytes), and three slice
    # assignments interleave them into the BMP row (the 4th byte is the
    # alpha pad and stays 0 in a fresh zeroed buffer). Byte-slicing cannot
    # grab 3-byte pixels in one operation, so channels travel as blocks.
    # The per-pixel version took ~0.5 s of pure Python per frame; this is ~0.02 s.
    row_len = small_w * bpp
    span = STEP * small_w * 3
    for y in range(small_h):
        src_row = (y * STEP) * width * 3
        if len(rgb) < src_row + span:
            return False
        blk_b = rgb[src_row + 2 : src_row + span : STEP * 3]
        blk_g = rgb[src_row + 1 : src_row + span : STEP * 3]
        blk_r = rgb[src_row : src_row + span : STEP * 3]
        if len(blk_r) != small_w:
            return False
        dst_row = (small_h - 1 - y) * stride
        pixels[dst_row : dst_row + row_len : bpp] = blk_b
        pixels[dst_row + 1 : dst_row + row_len : bpp] = blk_g
        pixels[dst_row + 2 : dst_row + row_len : bpp] = blk_r
    image_size = len(pixels)
    file_size = 54 + image_size
    header = struct.pack('<2sIHHI', b'BM', file_size, 0, 0, 54)
    info = struct.pack('<IiiHHIIiiII', 40, small_w, small_h, 1, 32, 0, image_size, 2835, 2835, 0, 0)
    part = dst + '.part'
    with open(part, 'wb') as f:
        f.write(header)
        f.write(info)
        f.write(pixels)
    os.replace(part, dst)
    return True


def grab(sock):
    try:
        os.unlink(RAW)
    except OSError:
        pass
    sock.sendall(b'screendump ' + RAW.encode() + b' -f ppm\n')
    read_until_prompt(sock)
    if not os.path.isfile(RAW) or os.path.getsize(RAW) < 16:
        return False
    ok = shrink_ppm(RAW, BMP)
    if ok and os.path.isfile(DEBUG):
        import shutil
        shutil.copyfile(RAW, RAW + '.keep')
    return ok


def main():
    sock = None
    misses = 0
    while os.path.isfile(RUN):
        started = time.time()
        try:
            if sock is None:
                sock = connect()
            if grab(sock):
                misses = 0
                print('frame', os.path.getsize(BMP), flush=True)
            else:
                misses += 1
        except (OSError, socket.timeout):
            misses += 1
            if sock is not None:
                try:
                    sock.close()
                except OSError:
                    pass
                sock = None
        if misses > 40:
            print('monitor down', flush=True)
            return 1
        leftover = PERIOD - (time.time() - started)
        if leftover > 0:
            time.sleep(leftover)
    if sock is not None:
        sock.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
