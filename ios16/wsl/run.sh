#!/bin/bash
# Boot the iOS 16.5 guest and leave it running until the window is closed.
set -euo pipefail

ROOT="${HAKIOS_ROOT:-$HOME/ios16-vm/hackios}"

if [ ! -f "$ROOT/userland/system.apfs" ] || [ ! -f "$ROOT/userland/root.apfs" ]; then
	echo "run.sh: disk images are missing. Run ios16/wsl/setup.sh first." >&2
	exit 1
fi
if [ ! -x "$ROOT/qemu/run-ios.sh" ]; then
	echo "run.sh: $ROOT does not look like the HakiOS tree." >&2
	exit 1
fi
if ! grep -q 'LIMIT=0' "$ROOT/qemu/run-ios.sh"; then
	echo "run.sh: the guest tree has no session-timer patch. Run ios16/wsl/setup.sh again." >&2
	exit 1
fi

if [ -z "${QEMU_EFI:-}" ]; then
	if [ -f /usr/share/AAVMF/AAVMF_CODE.fd ]; then
		QEMU_EFI=/usr/share/AAVMF/AAVMF_CODE.fd
		QEMU_VARS="${QEMU_VARS:-/usr/share/AAVMF/AAVMF_VARS.fd}"
	elif [ -f /usr/share/qemu-efi-aarch64/QEMU_EFI.fd ]; then
		QEMU_EFI=/usr/share/qemu-efi-aarch64/QEMU_EFI.fd
		QEMU_VARS="${QEMU_VARS:-/usr/share/AAVMF/AAVMF_VARS.fd}"
	elif [ -f /usr/share/edk2/aarch64/QEMU_EFI.fd ]; then
		QEMU_EFI=/usr/share/edk2/aarch64/QEMU_EFI.fd
		QEMU_VARS="${QEMU_VARS:-/usr/share/edk2/aarch64/QEMU_VARS.fd}"
	else
		echo "run.sh: no aarch64 UEFI firmware. Install qemu-efi-aarch64 or edk2-aarch64." >&2
		exit 1
	fi
fi
export QEMU_EFI QEMU_VARS

export QEMU_RAM_GB="${QEMU_RAM_GB:-7}"
export QEMU_SMP="${QEMU_SMP:-4}"
export CMDLINE="${CMDLINE:-cpus=${QEMU_SMP}}"

if [ -n "${IOS16_DISPLAY:-}" ]; then
	display=(-display "$IOS16_DISPLAY")
elif [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; then
	display=(-display gtk,zoom-to-fit=on)
else
	display=(-display vnc=0.0.0.0:1)
	echo "run.sh: no desktop in this shell. Connect a VNC viewer to port 5901."
	echo "run.sh: on Windows 11, start Run.bat from the desktop so WSLg can open a window."
fi

mkdir -p "$ROOT/logs"
cd "$ROOT"
echo "run.sh: iOS 16.5 guest, ${QEMU_RAM_GB} GB RAM, ${QEMU_SMP} cores"
echo "run.sh: stays up until the window is closed"
echo "run.sh: hold the left mouse button to touch. H home, L power, Up and Down volume."
# 0 means no loader_return_after and no host timeout. See patches/no-session-timer.patch.
exec qemu/run-ios.sh 0 "${display[@]}"
