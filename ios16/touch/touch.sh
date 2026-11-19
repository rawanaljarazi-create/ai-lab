#!/bin/bash
# Touch window for a guest that is already running. Linux and macOS.
# Needs Python 3 with tkinter. Ubuntu/Debian: sudo apt-get install python3-tk
#
# Loopback only. Defaults: monitor 127.0.0.1:4444, QMP 127.0.0.1:4445.
# IOS16_HOST, IOS16_MONITOR_PORT, IOS16_QMP_PORT override them.
# IOS16_HOST must be 127.0.0.1, localhost, or ::1.
set -euo pipefail
dir=$(cd "$(dirname "$0")" && pwd)
exec python3 "$dir/ios16-touch.py"
