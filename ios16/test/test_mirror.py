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

from PIL import Image

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


def open_rgb(path):
    """Colours as a normal decoder shows them, not raw BMP channel bytes."""
    with Image.open(path) as im:
        return im.convert("RGB")


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
        return dst

    def assert_matches(self, bmp, w, h, pixel, padded):
        im = open_rgb(bmp)
        bw, bh = im.size
        self.assertEqual((bw, bh), (w // mirror.STEP, h // mirror.STEP))
        for y in range(bh):
            for x in range(bw):
                got = im.getpixel((x, y))
                want = pixel(x * mirror.STEP, y * mirror.STEP)
                self.assertEqual(got, want, "x=%s y=%s padded=%s" % (x, y, padded))

    def test_real_qemu_frame_matches_native_png(self):
        native = open_rgb(FIXTURES / "native-1125x2436.png")
        self.assertEqual(native.size, (1125, 2436))
        # The stdlib reader is only a cross-check that Pillow's PNG agrees
        # with the bytes. Displayed colour is Pillow's RGB, below.
        png_w, png_h, png = read_png_rgb(FIXTURES / "native-1125x2436.png")
        self.assertEqual(native.tobytes(), png)
        self.assertEqual((png_w, png_h), native.size)
        with tempfile.TemporaryDirectory() as tmp:
            ppm = Path(tmp) / "frame.ppm"
            with gzip.open(FIXTURES / "native-1125x2436.ppm.gz", "rb") as src:
                ppm.write_bytes(src.read())
            parsed = mirror.parse_p6(ppm.read_bytes())
            self.assertIsNotNone(parsed)
            width, height, row_stride, _payload = parsed
            self.assertEqual((width, height, row_stride), (1125, 2436, 3376))
            got = open_rgb(self.convert(ppm))
        self.assertEqual(got.size, (562, 1218))
        mismatches = 0
        swapped = 0
        for y in range(got.height):
            for x in range(got.width):
                want = native.getpixel((x * mirror.STEP, y * mirror.STEP))
                seen = got.getpixel((x, y))
                if seen != want:
                    mismatches += 1
                    if seen[0] == want[2] and seen[2] == want[0] and seen[1] == want[1]:
                        swapped += 1
        self.assertEqual(mismatches, 0, "red/blue swaps %s" % swapped)
        self.assertEqual(got.width * got.height, 684516)
        # Upright: the top and bottom rows are the native top and bottom,
        # and they are not the same colour, so a vertical flip would fail.
        top = got.getpixel((0, 0))
        bottom = got.getpixel((0, got.height - 1))
        self.assertEqual(top, native.getpixel((0, 0)))
        self.assertEqual(bottom, native.getpixel((0, (got.height - 1) * mirror.STEP)))
        self.assertNotEqual(top, bottom)
        self.assertGreater(top[2], top[0])  # wallpaper blue, not the swapped orange

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
                        self.assert_matches(self.convert(src), w, h, colour_at, padded)

    def test_top_row_stays_on_top(self):
        def pixel(x, y):
            return (255, 0, 0) if y == 0 else (0, 0, 255)

        for padded in (False, True):
            with tempfile.TemporaryDirectory() as tmp:
                src = Path(tmp) / "rows.ppm"
                write_ppm(src, 1125, 6, pixel, padded)
                im = open_rgb(self.convert(src))
            self.assertEqual(im.getpixel((0, 0)), (255, 0, 0))
            self.assertEqual(im.getpixel((0, im.height - 1)), (0, 0, 255))

    def test_primary_channels_land_in_bmp_order(self):
        colours = ((255, 0, 0), (0, 255, 0), (0, 0, 255), (10, 20, 30))

        def pixel(x, _y):
            return colours[(x // mirror.STEP) % len(colours)]

        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "bars.ppm"
            write_ppm(src, 8, 2, pixel, True)
            dst = self.convert(src)
            im = open_rgb(dst)
            blob = dst.read_bytes()
        self.assertEqual(im.size[0], 4)
        for x, rgb in enumerate(colours):
            self.assertEqual(im.getpixel((x, 0)), rgb)
        # On disk the first displayed pixel is B,G,R,A. Red is stored 0,0,255,0.
        # Image.frombytes("RGBA") on these bytes swaps red and blue; Pillow's
        # BMP decoder does not.
        _off = struct.unpack_from("<I", blob, 10)[0]
        width, height = struct.unpack_from("<ii", blob, 18)
        stride = width * 4
        top = blob[_off + (height - 1) * stride:_off + (height - 1) * stride + 4]
        self.assertEqual(tuple(top), (0, 0, 255, 0))
        self.assertEqual(im.getpixel((0, 0)), (255, 0, 0))

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
