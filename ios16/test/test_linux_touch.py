"""Checks the touch window can run without the guest.

Colour and orientation use the captured 1125x2436 PPM and PNG. Pointer
fractions and QMP payloads are checked against the Windows pad's rules.
Nothing dials a port.
"""
import gzip
import importlib.util
import struct
import unittest
import zlib
from pathlib import Path

IOS16 = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).resolve().parent / "fixtures"
spec = importlib.util.spec_from_file_location("ios16_touch", IOS16 / "linux" / "ios16-touch.py")
touch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(touch)


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
            raise ValueError("bad png filter")
        prev = row
        rows.append(row)
    return width, height, b"".join(rows)


class TouchLogicTests(unittest.TestCase):
    def test_captured_frame_is_upright_and_coloured(self):
        png_w, png_h, png = read_png_rgb(FIXTURES / "native-1125x2436.png")
        self.assertEqual((png_w, png_h), (1125, 2436))
        with gzip.open(FIXTURES / "native-1125x2436.ppm.gz", "rb") as handle:
            frame = touch.sample_frame(handle.read())
        self.assertIsNotNone(frame)
        width, height, rgb = frame
        self.assertEqual((width, height), (562, 1218))
        mismatches = 0
        for y in range(height):
            src = (y * touch.STEP) * png_w * 3
            for x in range(width):
                i = src + (x * touch.STEP) * 3
                j = (y * width + x) * 3
                if rgb[j:j + 3] != png[i:i + 3]:
                    mismatches += 1
        self.assertEqual(mismatches, 0)
        self.assertEqual(rgb[0:3], png[0:3])
        self.assertEqual(tuple(rgb[0:3]), (8, 123, 202))
        self.assertGreater(rgb[2], rgb[0])
        bottom = (height - 1) * width * 3
        native_bottom = ((height - 1) * touch.STEP) * png_w * 3
        self.assertEqual(rgb[bottom:bottom + 3], png[native_bottom:native_bottom + 3])
        self.assertNotEqual(rgb[0:3], rgb[bottom:bottom + 3])

    def test_pointer_matches_the_pad(self):
        self.assertEqual(touch.axis(0), 0)
        self.assertEqual(touch.axis(1), 32767)
        self.assertEqual(touch.axis(-0.2), 0)
        self.assertEqual(touch.axis(1.2), 32767)
        self.assertIsNone(touch.pointer_fraction(-1, 0, 320, 692))
        self.assertIsNone(touch.pointer_fraction(320, 0, 320, 692))
        self.assertEqual(touch.pointer_fraction(0, 0, 320, 692), (0, 0))
        self.assertEqual(touch.pointer_fraction(160, 346, 320, 692), (0.5, 0.5))
        self.assertTrue(touch.is_tap(0, 0, 0.01, 0, 320, 692))
        self.assertFalse(touch.is_tap(0, 0, 8 / 320, 0, 320, 692))
        self.assertTrue(touch.is_tap(0, 0, 7 / 320, 0, 320, 692))

    def test_tap_drag_and_key_payloads(self):
        tap = touch.tap_points(0.25, 0.5)
        self.assertEqual(tap, [(0.25, 0.5, None), (0.25, 0.5, True), (0.25, 0.5, False)])
        swipe = touch.swipe_points(0, 0, 1, 1)
        self.assertEqual(swipe[0], (0, 0, None))
        self.assertEqual(swipe[1], (0, 0, True))
        self.assertEqual(swipe[2][2], None)
        self.assertAlmostEqual(swipe[2][0], 1 / 6)
        self.assertEqual(swipe[-2], (1, 1, None))
        self.assertEqual(swipe[-1], (1, 1, False))
        self.assertEqual(len(swipe), 9)
        line = touch.pointer_command(1, 0, True)
        self.assertIn('"execute":"input-send-event"', line)
        self.assertIn('"axis":"x","value":32767', line)
        self.assertIn('"axis":"y","value":0', line)
        self.assertIn('"button":"left","down":true', line)
        self.assertNotIn('"down":false', line)
        up = touch.pointer_command(0, 1, False)
        self.assertIn('"down":false', up)
        move = touch.pointer_command(0.5, 0.5, None)
        self.assertNotIn('"button"', move)
        key = touch.key_command("h", True)
        self.assertIn('"type":"key"', key)
        self.assertIn('"down":true', key)
        self.assertIn('"type":"qcode","data":"h"', key)
        for name in ("h", "l", "up", "down"):
            self.assertIn(name, touch.key_command(name, False))

    def test_qmp_handshake_skips_events_and_stays_on_loopback(self):
        class Fake:
            def __init__(self):
                self.sent = []
                self.lines = [
                    b'{"QMP":{"version":"test"}}\n',
                    b'{"event":"STOP"}\n',
                    b'{"return":{}}\n',
                ]

            def sendall(self, data):
                self.sent.append(data)

            def makefile(self, _mode):
                return self

            def readline(self):
                return self.lines.pop(0) if self.lines else b""

            def close(self):
                pass

        session = touch.QmpSession("127.0.0.1", 4445)
        fake = Fake()
        session.sock = fake
        session.reader = fake
        session.handshake()
        self.assertIn(b'"execute":"qmp_capabilities"', fake.sent[0])
        self.assertRaises(SystemExit, touch.check_loopback, "10.0.0.1")
        self.assertEqual(touch.check_loopback("127.0.0.1"), "127.0.0.1")
        self.assertEqual(touch.check_loopback("localhost"), "localhost")


if __name__ == "__main__":
    unittest.main()
