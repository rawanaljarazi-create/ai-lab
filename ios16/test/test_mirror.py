"""Converter checks for the touch-pad mirror.

The captured frame is the QEMU screendump from 2026-11-07 19:02 (1125x2436).
Its rows are 3376 bytes, one longer than packed RGB. These tests run
shrink_ppm on that file and on synthetic packed and padded images. They do
not open the Windows touch window.
"""
import gzip
import importlib.util
import struct
import tempfile
import unittest
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).resolve().parent / "fixtures"
spec = importlib.util.spec_from_file_location("touch_mirror", ROOT / "touch-mirror.py")
mirror = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mirror)


def paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def read_png_rgb(path):
    data = Path(path).read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a png")
    pos = 8
    width = height = None
    idat = []
    while pos + 8 <= len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        kind = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            width, height, bit, color, comp, filt, inter = struct.unpack(">IIBBBBB", chunk)
            if (bit, color, comp, filt, inter) != (8, 2, 0, 0, 0):
                raise ValueError("png is not plain 8-bit rgb")
        elif kind == b"IDAT":
            idat.append(chunk)
        elif kind == b"IEND":
            break
    raw = zlib.decompress(b"".join(idat))
    stride = width * 3
    rows = []
    i = 0
    prev = bytearray(stride)
    for _ in range(height):
        filt = raw[i]
        i += 1
        row = bytearray(raw[i:i + stride])
        i += stride
        if filt == 1:
            for x in range(stride):
                left = row[x - 3] if x >= 3 else 0
                row[x] = (row[x] + left) & 255
        elif filt == 2:
            for x in range(stride):
                row[x] = (row[x] + prev[x]) & 255
        elif filt == 3:
            for x in range(stride):
                left = row[x - 3] if x >= 3 else 0
                row[x] = (row[x] + ((left + prev[x]) // 2)) & 255
        elif filt == 4:
            for x in range(stride):
                a = row[x - 3] if x >= 3 else 0
                b = prev[x]
                c = prev[x - 3] if x >= 3 else 0
                row[x] = (row[x] + paeth(a, b, c)) & 255
        elif filt != 0:
            raise ValueError("bad png filter %s" % filt)
        prev = row
        rows.append(bytes(row))
    return width, height, b"".join(rows)


def read_bmp(path):
    blob = Path(path).read_bytes()
    magic, file_size, _r1, _r2, off = struct.unpack_from("<2sIHHI", blob, 0)
    dib, bw, bh, planes, bits, comp, img, _x, _y, _u, _i = struct.unpack_from("<IiiHHIIiiII", blob, 14)
    if magic != b"BM" or dib != 40 or planes != 1 or bits != 32 or comp != 0 or bh < 1:
        raise ValueError("unexpected bmp header")
    if file_size != len(blob) or off != 54:
        raise ValueError("bmp size does not match the header")
    stride = ((bw * 4 + 3) & ~3)
    if img != stride * bh or len(blob) != 54 + img:
        raise ValueError("bmp stride does not match the payload")
    pix = blob[off:]
    out = bytearray(bw * bh * 4)
    for y in range(bh):
        src = (bh - 1 - y) * stride
        dst = y * bw * 4
        out[dst:dst + bw * 4] = pix[src:src + bw * 4]
    return bw, bh, bytes(out)


def write_ppm(path, w, h, pixel, padded, header=None):
    tight = w * 3
    row_stride = ((tight + 3) & ~3) if padded else tight
    raster = bytearray()
    for y in range(h):
        row = bytearray(row_stride)
        for x in range(w):
            row[x * 3:x * 3 + 3] = bytes(pixel(x, y))
        raster += row
    if header is None:
        header = ("P6\n%d %d\n255\n" % (w, h)).encode()
    path.write_bytes(header + raster)


def colour_at(x, y):
    return ((x * 3 + y * 5) & 255, (x * 7 + 20) & 255, (y * 11 + 40) & 255)


class MirrorTests(unittest.TestCase):
    def convert(self, src):
        dst = src.with_suffix(".bmp")
        self.assertTrue(mirror.shrink_ppm(str(src), str(dst)))
        return read_bmp(dst)

    def assert_matches(self, bmp, w, h, pixel, padded):
        bw, bh, pix = bmp
        self.assertEqual((bw, bh), (w // mirror.STEP, h // mirror.STEP))
        for y in range(bh):
            for x in range(bw):
                want = pixel(x * mirror.STEP, y * mirror.STEP)
                i = (y * bw + x) * 4
                got = (pix[i + 2], pix[i + 1], pix[i], pix[i + 3])
                self.assertEqual(got, want + (0,), "x=%s y=%s padded=%s" % (x, y, padded))

    def test_real_qemu_frame_matches_native_png(self):
        png_w, png_h, png = read_png_rgb(FIXTURES / "native-1125x2436.png")
        self.assertEqual((png_w, png_h), (1125, 2436))
        with tempfile.TemporaryDirectory() as tmp:
            ppm = Path(tmp) / "frame.ppm"
            with gzip.open(FIXTURES / "native-1125x2436.ppm.gz", "rb") as src:
                ppm.write_bytes(src.read())
            parsed = mirror.parse_p6(ppm.read_bytes())
            self.assertIsNotNone(parsed)
            width, height, row_stride, _payload = parsed
            self.assertEqual((width, height, row_stride), (1125, 2436, 3376))
            bw, bh, pix = self.convert(ppm)
        self.assertEqual((bw, bh), (562, 1218))
        mismatches = 0
        for y in range(bh):
            src_row = (y * mirror.STEP) * (png_w * 3)
            for x in range(bw):
                s = src_row + (x * mirror.STEP) * 3
                want = png[s:s + 3]
                i = (y * bw + x) * 4
                got = bytes((pix[i + 2], pix[i + 1], pix[i]))
                if got != want or pix[i + 3] != 0:
                    mismatches += 1
        self.assertEqual(mismatches, 0)
        self.assertEqual(bw * bh, 684516)

    def test_packed_and_padded_agree_on_colour_and_orientation(self):
        cases = (
            (5, 3),    # odd, pad would be 1
            (7, 5),
            (3, 5),
            (8, 4),    # already dword aligned
            (1124, 4),
            (1125, 6),
            (1125, 5),
        )
        for w, h in cases:
            for padded in (False, True):
                with self.subTest(w=w, h=h, padded=padded):
                    with tempfile.TemporaryDirectory() as tmp:
                        src = Path(tmp) / "shot.ppm"
                        write_ppm(src, w, h, colour_at, padded)
                        bmp = self.convert(src)
                    self.assert_matches(bmp, w, h, colour_at, padded)

    def test_top_row_stays_on_top(self):
        def pixel(x, y):
            return (255, 0, 0) if y == 0 else (0, 0, 255)

        for padded in (False, True):
            with tempfile.TemporaryDirectory() as tmp:
                src = Path(tmp) / "rows.ppm"
                write_ppm(src, 1125, 6, pixel, padded)
                bw, bh, pix = self.convert(src)
            self.assertEqual(pix[2], 255)          # top-left red
            self.assertEqual(pix[0], 0)
            last = (bh - 1) * bw * 4
            self.assertEqual(pix[last], 255)       # bottom-left blue, stored in B
            self.assertEqual(pix[last + 2], 0)

    def test_primary_channels_land_in_bmp_order(self):
        colours = ((255, 0, 0), (0, 255, 0), (0, 0, 255), (10, 20, 30))

        def pixel(x, _y):
            return colours[(x // mirror.STEP) % len(colours)]

        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "bars.ppm"
            write_ppm(src, 8, 2, pixel, True)
            bw, _bh, pix = self.convert(src)
        self.assertEqual(bw, 4)
        for x, (r, g, b) in enumerate(colours):
            i = x * 4
            self.assertEqual((pix[i], pix[i + 1], pix[i + 2], pix[i + 3]), (b, g, r, 0))

    def test_header_variants_of_a_packed_image(self):
        def pixel(x, y):
            return (x & 255, y & 255, 200)

        headers = (
            b"P6\n4 4\n255\n",
            b"P6\r\n4 4\r\n255\r\n",
            b"P6\n# note\n4 4\n255\n",
            b"P6\n4   4\n255\n",
            b"P6\n4 4\n255 ",
            b"P6\n  # c\n4 4\n255\n",
            b"P6\n4 4\n255 # tail\n",
        )
        for header in headers:
            with self.subTest(header=header):
                with tempfile.TemporaryDirectory() as tmp:
                    src = Path(tmp) / "h.ppm"
                    write_ppm(src, 4, 4, pixel, False, header)
                    self.assert_matches(self.convert(src), 4, 4, pixel, False)

    def test_invalid_input_is_rejected(self):
        samples = [
            b"",
            b"P5\n4 4\n255\n" + bytes(48),
            b"P6\n4 4\n15\n" + bytes(48),
            b"P6\n4 4\n255\n" + bytes(10),
            b"P6\n4 4\n255\n" + bytes(49),
            b"P6\n  # c\n4 4\n255\n",  # header only, no raster of the right length
            b"P6\n#\n4 4\n255\n" + bytes(47),
            b"P6\n0 4\n255\n",
            b"P6\n4 4\n255\n" + bytes(48) + b"\n",
        ]
        # The indented-comment header above has no raster. Build one padded
        # length that is neither packed nor dword so the size check fires.
        tight = b"P6\n5 2\n255\n" + bytes(5 * 2 * 3)
        samples.append(tight + b"\x00")  # one extra byte, not a full pad row
        for blob in samples:
            with self.subTest(blob=blob[:24]):
                self.assertIsNone(mirror.parse_p6(blob))
                with tempfile.TemporaryDirectory() as tmp:
                    src = Path(tmp) / "bad.ppm"
                    dst = Path(tmp) / "bad.bmp"
                    src.write_bytes(blob)
                    self.assertFalse(mirror.shrink_ppm(str(src), str(dst)))
                    self.assertFalse(dst.exists())


if __name__ == "__main__":
    unittest.main()
