#!/bin/bash
# Open the iPhone touch window beside a guest that is already running.
# Python 3 with tkinter is required. On Ubuntu or Debian: sudo apt-get install python3-tk
#
# Loopback only. The defaults are monitor 127.0.0.1:4444 and QMP 127.0.0.1:4445.
# Override with IOS16_HOST, IOS16_MONITOR_PORT, and IOS16_QMP_PORT.
# IOS16_HOST must be 127.0.0.1, localhost, or ::1.
set -euo pipefail
dir=$(cd "$(dirname "$0")" && pwd)
exec python3 "$dir/ios16-touch.py"
