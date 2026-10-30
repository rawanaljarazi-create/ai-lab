# One frame of the phone screen for the Windows touch pad.
#
# Grabs the display straight from QEMU's monitor socket (port 4444) and leaves
# it as /tmp/ios16-mirror.png, which the pad reads through \\wsl$. Runs once
# per call; the repeat loop lives in touch-mirror.ps1 on the Windows side.
# Nothing here touches the pad's QMP connection, so taps and swipes are never
# delayed by the mirror. Stale frame sets are guarded by rename (readers never
# see a half-written PNG) and by age stamps cleared releases.
import os
import socket
import sys
import time

TMP = '/tmp/ios16-mirror'
RAW = TMP + '.raw'
PNG = TMP + '.png'


def drain(s):
    # Let the monitor finish printing so the next grab can connect cleanly.
    deadline = time.time() + 1
    try:
        s.settimeout(0.2)
        while time.time() < deadline:
            if not s.recv(65536):
                break
    except (socket.timeout, OSError):
        pass


def main():
    try:
        os.unlink(RAW)
    except OSError:
        pass
    try:
        s = socket.create_connection(('127.0.0.1', 4444))
        s.settimeout(3)
    except OSError as e:
        print('monitor down:', e)
        sys.exit(1)
    s.sendall(b'\n')
    time.sleep(0.15)
    s.sendall(b'screendump ' + RAW.encode() + b' -f png\n')
    deadline = time.time() + 4
    ok = False
    while time.time() < deadline:
        try:
            if os.path.exists(RAW) and os.path.getsize(RAW) > 0:
                ok = True
                break
        except OSError:
            pass
        time.sleep(0.02)
    drain(s)
    s.close()
    if not ok:
        print('no frame')
        sys.exit(1)
    with open(RAW, 'rb') as f:
        first = f.read(8)
    if first == b'\x89PNG\r\n\x1a\n':
        os.replace(RAW, PNG)
        print('frame', os.path.getsize(PNG))
    else:
        os.unlink(RAW)
        print('bad frame magic', first[:4])
        sys.exit(1)


if __name__ == '__main__':
    main()
