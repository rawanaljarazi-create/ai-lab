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


def _header_end(blob, i):
    """Index of the first raster byte, or None.

    One whitespace byte closes the header. A CRLF pair is that one line
    ending. Spaces or tabs in front of a '#' comment belong to the header,
    and the newline after the comment is the separator.
    """
    n = len(blob)
    j = i
    while j < n and blob[j] in b' \t':
        j += 1
    if j < n and blob[j] == 35:
        while j < n and blob[j] not in b'\r\n':
            j += 1
        if j >= n:
            return None
        if blob[j:j + 2] == b'\r\n':
            return j + 2
        return j + 1
    if i >= n:
        return None
    if blob[i:i + 2] == b'\r\n':
        return i + 2
    if blob[i] in b' \t\r\n':
        return i + 1
    return None


def parse_p6(blob):
    """Return (width, height, row_stride, raster) or None.

    The raster may be packed (width*3 bytes per row) or dword-padded, which is
    how QEMU writes a screendump: each row is pixman's 4-byte stride, so a
    1125-wide row is 3376 bytes and the last byte is unused. Which one this
    file is comes from the byte count. A short file, a trailing extra byte, or
    a header that is not three decimal tokens is rejected rather than decoded.
    """
    if len(blob) < 3 or blob[:2] != b'P6' or blob[2] not in b' \t\r\n':
        return None
    i = 2
    n = len(blob)
    tokens = []
    while len(tokens) < 3 and i < n:
        c = blob[i]
        if c in b' \t\r\n':
            i += 1
            continue
        if c == 35:  # '#'
            while i < n and blob[i] not in b'\r\n':
                i += 1
            continue
        start = i
        while i < n and blob[i] not in b' \t\r\n#':
            i += 1
        token = blob[start:i]
        if not token.isdigit():
            return None
        tokens.append(token)
    if len(tokens) != 3:
        return None
    width = int(tokens[0])
    height = int(tokens[1])
    depth = int(tokens[2])
    # Phone frames are 1125x2436. Anything larger is a bad header, and the
    # product below would try to allocate it.
    if width < 1 or height < 1 or width > 8192 or height > 8192 or depth != 255:
        return None
    end = _header_end(blob, i)
    if end is None:
        return None
    payload = blob[end:]
    tight = width * 3
    padded = (tight + 3) & ~3
    if len(payload) == tight * height:
        row_stride = tight
    elif padded != tight and len(payload) == padded * height:
        row_stride = padded
    else:
        return None
    return width, height, row_stride, payload


def shrink_ppm(src, dst):
    try:
        with open(src, 'rb') as f:
            parsed = parse_p6(f.read())
    except OSError:
        return False
    if parsed is None:
        return False
    width, height, row_stride, rgb = parsed
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
    # src rows step by row_stride, which is width*3 when the PPM is packed and
    # the next multiple of 4 when QEMU padded the row. The samples themselves
    # stay inside the RGB bytes and never read the pad.
    row_len = small_w * bpp
    span = STEP * small_w * 3
    if span > width * 3:
        return False
    for y in range(small_h):
        src_row = (y * STEP) * row_stride
        if src_row + span > len(rgb):
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
