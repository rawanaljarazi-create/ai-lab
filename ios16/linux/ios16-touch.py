#!/usr/bin/env python3
"""Linux touch window for the iOS 16 guest.

One window, next to the VM that is already running. It grabs a PPM from
QEMU's monitor on 127.0.0.1:4444 and sends taps, drags, and the hardware
keys to QMP on 127.0.0.1:4445. Those are the same two ports the Windows
touch pad uses. Nothing here listens, and the host is forced to loopback.

The picture path is the row-stride fix from the mirror converter: a QEMU
screendump is packed RGB only when width*3 is a multiple of 4. Otherwise
each row is padded to 4 bytes (1125-wide rows are 3376 bytes). Sampling
uses that stride, keeps every second pixel, and shows the rows top-down.

This does not start, stop, or reconfigure the guest.
"""
import json
import os
import socket
import sys
import threading
import time

STEP = 2
MONITOR_PORT = 4444
QMP_PORT = 4445
RAW = "/tmp/ios16-linux-touch.ppm"
AXIS = 32767


def check_loopback(host):
    if host not in ("127.0.0.1", "localhost", "::1"):
        raise SystemExit("ios16-touch.py: refusing %s. This window only dials loopback." % host)
    return host


def _header_end(blob, i):
    n = len(blob)
    j = i
    while j < n and blob[j] in b" \t":
        j += 1
    if j < n and blob[j] == 35:
        while j < n and blob[j] not in b"\r\n":
            j += 1
        if j >= n:
            return None
        if blob[j:j + 2] == b"\r\n":
            return j + 2
        return j + 1
    if i >= n:
        return None
    if blob[i:i + 2] == b"\r\n":
        return i + 2
    if blob[i] in b" \t\r\n":
        return i + 1
    return None


def parse_p6(blob):
    """Return (width, height, row_stride, raster) or None.

    Same rule as ios16/touch-mirror.py on the row-padding fix: the raster
    is packed when its length is width*height*3, and dword-padded when its
    length is height times the 4-byte stride. Any other length is rejected.
    """
    if len(blob) < 3 or blob[:2] != b"P6" or blob[2] not in b" \t\r\n":
        return None
    i = 2
    n = len(blob)
    tokens = []
    while len(tokens) < 3 and i < n:
        c = blob[i]
        if c in b" \t\r\n":
            i += 1
            continue
        if c == 35:
            while i < n and blob[i] not in b"\r\n":
                i += 1
            continue
        start = i
        while i < n and blob[i] not in b" \t\r\n#":
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


def sample_frame(blob, step=STEP):
    """Top-down RGB, every step-th pixel. None if the PPM is not usable."""
    parsed = parse_p6(blob)
    if parsed is None:
        return None
    width, height, row_stride, rgb = parsed
    small_w = width // step
    small_h = height // step
    if small_w < 1 or small_h < 1:
        return None
    span = step * small_w * 3
    if span > width * 3:
        return None
    out = bytearray(small_w * small_h * 3)
    row_len = small_w * 3
    for y in range(small_h):
        src_row = (y * step) * row_stride
        if src_row + span > len(rgb):
            return None
        blk_r = rgb[src_row:src_row + span:step * 3]
        blk_g = rgb[src_row + 1:src_row + span:step * 3]
        blk_b = rgb[src_row + 2:src_row + span:step * 3]
        if len(blk_r) != small_w:
            return None
        dst = y * row_len
        out[dst:dst + row_len:3] = blk_r
        out[dst + 1:dst + row_len:3] = blk_g
        out[dst + 2:dst + row_len:3] = blk_b
    return small_w, small_h, bytes(out)


def rgb_ppm(width, height, rgb):
    header = ("P6\n%d %d\n255\n" % (width, height)).encode()
    return header + rgb


def axis(fraction):
    if fraction < 0:
        fraction = 0
    elif fraction > 1:
        fraction = 1
    return int(round(fraction * AXIS))


def pointer_fraction(x, y, width, height):
    """Fraction of the picture under a click. None if the click misses it."""
    if width < 1 or height < 1:
        return None
    if x < 0 or y < 0 or x >= width or y >= height:
        return None
    return x / width, y / height


def is_tap(x0, y0, x1, y1, width, height):
    """True when the release is under 8 pixels from the press, as the pad is."""
    dx = (x1 - x0) * width
    dy = (y1 - y0) * height
    return dx * dx + dy * dy < 64


def pointer_events(x, y, down):
    events = [
        {"type": "abs", "data": {"axis": "x", "value": axis(x)}},
        {"type": "abs", "data": {"axis": "y", "value": axis(y)}},
    ]
    if down is not None:
        events.append({"type": "btn", "data": {"button": "left", "down": bool(down)}})
    return events


def tap_points(x, y):
    return [(x, y, None), (x, y, True), (x, y, False)]


def swipe_points(x0, y0, x1, y1):
    points = [(x0, y0, None), (x0, y0, True)]
    for i in range(1, 7):
        points.append((x0 + (x1 - x0) * i / 6, y0 + (y1 - y0) * i / 6, None))
    points.append((x1, y1, False))
    return points


def qmp_line(execute, arguments=None):
    message = {"execute": execute}
    if arguments is not None:
        message["arguments"] = arguments
    return json.dumps(message, separators=(",", ":")) + "\n"


def pointer_command(x, y, down):
    return qmp_line("input-send-event", {"events": pointer_events(x, y, down)})


def key_command(name, down):
    event = {
        "type": "key",
        "data": {"down": bool(down), "key": {"type": "qcode", "data": name}},
    }
    return qmp_line("input-send-event", {"events": [event]})


class QmpSession:
    """One QMP client. Matches the touch pad: capabilities, then input events."""

    def __init__(self, host, port):
        self.host = host
        self.port = port
        self.sock = None
        self.reader = None
        self.lock = threading.Lock()

    def close(self):
        sock = self.sock
        self.sock = None
        self.reader = None
        if sock is not None:
            try:
                sock.close()
            except OSError:
                pass

    def _readline(self):
        line = self.reader.readline()
        if not line:
            raise OSError("the phone closed the input connection")
        return line.decode("utf-8", "replace")

    def handshake(self):
        deadline = time.time() + 5
        seen = False
        while time.time() < deadline:
            line = self._readline()
            if '"QMP"' in line:
                seen = True
                break
        if not seen:
            raise OSError("the input port did not greet")
        self.sock.sendall(qmp_line("qmp_capabilities").encode())
        reply = self.read_result()
        if '"error"' in reply:
            raise OSError("the phone refused the controller")

    def read_result(self):
        while True:
            line = self._readline()
            if '"return"' in line or '"error"' in line:
                return line

    def connect(self):
        self.close()
        sock = socket.create_connection((self.host, self.port), 5)
        sock.settimeout(3)
        self.sock = sock
        self.reader = sock.makefile("rb")
        try:
            self.handshake()
        except Exception:
            self.close()
            raise

    def command(self, line):
        with self.lock:
            if self.sock is None:
                raise OSError("the phone is not connected yet")
            self.sock.sendall(line.encode())
            reply = self.read_result()
        if '"error"' in reply:
            raise OSError("the phone rejected an input event")
        return reply

    def pointer(self, x, y, down):
        self.command(pointer_command(x, y, down))

    def key(self, name):
        self.command(key_command(name, True))
        time.sleep(0.08)
        self.command(key_command(name, False))

    def tap(self, x, y):
        points = tap_points(x, y)
        self.pointer(*points[0])
        self.pointer(*points[1])
        time.sleep(0.06)
        self.pointer(*points[2])

    def swipe(self, x0, y0, x1, y1):
        points = swipe_points(x0, y0, x1, y1)
        self.pointer(*points[0])
        self.pointer(*points[1])
        for point in points[2:-1]:
            time.sleep(0.028)
            self.pointer(*point)
        time.sleep(0.02)
        self.pointer(*points[-1])


def read_until(sock, token):
    buf = b""
    while token not in buf:
        chunk = sock.recv(65536)
        if not chunk:
            raise OSError("monitor closed")
        buf += chunk
        if len(buf) > 1_000_000:
            buf = buf[-1000:]
    return buf


def grab_ppm(sock, path):
    try:
        os.unlink(path)
    except OSError:
        pass
    sock.sendall(b"screendump " + path.encode() + b" -f ppm\n")
    read_until(sock, b"(qemu)")
    try:
        with open(path, "rb") as handle:
            blob = handle.read()
    except OSError:
        return None
    if len(blob) < 16:
        return None
    return sample_frame(blob)


class Mirror(threading.Thread):
    def __init__(self, host, port, state, stop):
        super().__init__(name="ios16-mirror", daemon=True)
        self.host = host
        self.port = port
        self.state = state
        self.stop = stop

    def run(self):
        sock = None
        while not self.stop.is_set():
            started = time.time()
            try:
                if sock is None:
                    sock = socket.create_connection((self.host, self.port), 5)
                    sock.settimeout(8)
                    read_until(sock, b"(qemu)")
                frame = grab_ppm(sock, RAW)
                if frame is None:
                    self.state.set_status("Waiting for a picture from the phone...")
                else:
                    self.state.set_frame(*frame)
            except OSError:
                if sock is not None:
                    try:
                        sock.close()
                    except OSError:
                        pass
                    sock = None
                self.state.set_status("Monitor port %s is not answering. Retrying..." % self.port)
            leftover = 0.25 - (time.time() - started)
            if leftover > 0:
                self.stop.wait(leftover)
        if sock is not None:
            try:
                sock.close()
            except OSError:
                pass


class State:
    def __init__(self):
        self.lock = threading.Lock()
        self.frame = None
        self.generation = 0
        self.status = "Waiting for the phone..."

    def set_frame(self, width, height, rgb):
        with self.lock:
            self.frame = (width, height, rgb)
            self.generation += 1
            self.status = "Drag or tap the picture. Home, Power, and volume are the buttons."

    def set_status(self, text):
        with self.lock:
            if self.frame is None:
                self.status = text

    def snapshot(self):
        with self.lock:
            return self.generation, self.frame, self.status


def run_window(host, monitor_port, qmp_port):
    try:
        import tkinter as tk
    except ModuleNotFoundError:
        raise SystemExit(
            "ios16-touch.py: Python has no tkinter. On Ubuntu or Debian: sudo apt-get install python3-tk"
        )

    state = State()
    stop = threading.Event()
    mirror = Mirror(host, monitor_port, state, stop)
    qmp = QmpSession(host, qmp_port)
    mirror.start()

    root = tk.Tk()
    root.title("iPhone touch")
    root.configure(bg="#1c1c1e")
    status = tk.StringVar(value=state.status)
    tk.Label(root, textvariable=status, fg="white", bg="#1c1c1e", pady=8).pack(side="top", fill="x")
    view = tk.Label(root, bg="#0a0a0c", bd=0)
    view.pack(side="top")
    buttons = tk.Frame(root, bg="#1c1c1e")
    buttons.pack(side="bottom", fill="x", pady=6)

    shown = {"generation": -1, "photo": None}
    origin = {"at": None}

    def fraction(event):
        photo = shown["photo"]
        if photo is None:
            return None
        return pointer_fraction(event.x, event.y, photo.width(), photo.height())

    def gesture(start, end):
        photo = shown["photo"]
        if photo is None or start is None or end is None:
            return
        try:
            if is_tap(start[0], start[1], end[0], end[1], photo.width(), photo.height()):
                qmp.tap(*end)
                label = "Tap sent."
            else:
                qmp.swipe(start[0], start[1], end[0], end[1])
                label = "Swipe sent."
        except OSError as exc:
            status.set(str(exc))
            return
        status.set(label)

    def press(event):
        origin["at"] = fraction(event)

    def release(event):
        start = origin["at"]
        origin["at"] = None
        gesture(start, fraction(event))

    view.bind("<ButtonPress-1>", press)
    view.bind("<ButtonRelease-1>", release)

    def send_key(name, label):
        try:
            qmp.key(name)
        except OSError as exc:
            status.set(str(exc))
            return
        status.set(label + " sent.")

    for label, qcode in (("Home", "h"), ("Power", "l"), ("Vol +", "up"), ("Vol -", "down")):
        tk.Button(
            buttons,
            text=label,
            command=lambda code=qcode, text=label: send_key(code, text),
            width=8,
        ).pack(side="left", padx=4)

    paths = ["/tmp/ios16-linux-touch-view-0.ppm", "/tmp/ios16-linux-touch-view-1.ppm"]
    slot = {"n": 0}

    def connect_qmp():
        try:
            qmp.connect()
        except OSError:
            status.set("Waiting for input port %s..." % qmp_port)
            root.after(1000, connect_qmp)
            return
        if state.snapshot()[1] is not None:
            status.set("Drag or tap the picture. Home, Power, and volume are the buttons.")

    def poll():
        if not root.winfo_exists():
            return
        generation, frame, text = state.snapshot()
        if qmp.sock is None and frame is None:
            status.set(text)
        elif generation != shown["generation"] and frame is not None:
            width, height, rgb = frame
            path = paths[slot["n"]]
            slot["n"] ^= 1
            with open(path, "wb") as handle:
                handle.write(rgb_ppm(width, height, rgb))
            photo = tk.PhotoImage(file=path)
            if photo.height() > 720:
                photo = photo.subsample(2, 2)
            shown["photo"] = photo
            shown["generation"] = generation
            view.configure(image=photo)
            status.set(text)
        root.after(80, poll)

    def close():
        stop.set()
        qmp.close()
        root.destroy()

    root.protocol("WM_DELETE_WINDOW", close)
    root.after(80, poll)
    root.after(200, connect_qmp)
    root.mainloop()
    stop.set()
    qmp.close()


def main(argv):
    host = check_loopback(os.environ.get("IOS16_HOST", "127.0.0.1"))
    monitor = int(os.environ.get("IOS16_MONITOR_PORT", str(MONITOR_PORT)))
    qmp_port = int(os.environ.get("IOS16_QMP_PORT", str(QMP_PORT)))
    if argv[1:] not in ([],):
        raise SystemExit("usage: python3 ios16-touch.py")
    run_window(host, monitor, qmp_port)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
