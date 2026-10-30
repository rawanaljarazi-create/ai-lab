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
# The system image sits at a fixed address, so the guest map stays 7 GB. This PC
# has two cores, so two vCPUs is the match. A 256 MB translation cache is the
# part that stays in RAM; a smaller one makes QEMU retranslate iOS constantly.
# serial=0 keeps the console off the UART. Printing it through Windows was
# slower than the phone. The loader already has serial=3 unless we pass one.
host_mb=$(awk '/^MemTotal:/ { print int($2 / 1024) }' /proc/meminfo)
if [ "${host_mb:-0}" -lt 8192 ]; then
	export QEMU_SMP="${QEMU_SMP:-2}"
	export QEMU_TB_MB="${QEMU_TB_MB:-256}"
else
	export QEMU_SMP="${QEMU_SMP:-4}"
fi
export CMDLINE="${CMDLINE:-serial=0 cpus=${QEMU_SMP}}"
commit_mb=$(awk '/^CommitLimit:/ { print int($2 / 1024) }' /proc/meminfo)
if [ "${commit_mb:-0}" -lt $((QEMU_RAM_GB * 1024)) ]; then
	echo "run.sh: the guest needs a ${QEMU_RAM_GB} GB memory map, and Linux can only promise ${commit_mb} MB." >&2
	echo "run.sh: on a 6 GB Windows PC, %UserProfile%\\.wslconfig should contain:" >&2
	echo "run.sh:   [wsl2]" >&2
	echo "run.sh:   memory=4GB" >&2
	echo "run.sh:   swap=8GB" >&2
	echo "run.sh: then run wsl --shutdown and start Run.bat again." >&2
	exit 1
fi

if [ -n "${IOS16_DISPLAY:-}" ]; then
	display=(-display "$IOS16_DISPLAY")
elif [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; then
	display=(-display gtk,zoom-to-fit=on)
else
	display=(-display vnc=0.0.0.0:1)
	echo "run.sh: no desktop in this shell. TigerVNC address: 127.0.0.1:1"
	echo "run.sh: that is display 1. Typing :5901 makes TigerVNC try the wrong port and the connection is refused."
fi

# virtio-sound cannot be written into a snapshot, so leave it out.
export AUDIO=off

# The prebuilt kernel loops on a CPU-monitor denial, and the input library
# registers the touch screen on a HID client backboardd will not accept.
# Both are repaired here when they are still the stock bytes.
python3 "$(cd "$(dirname "$0")" && pwd)/fix-guest.py" "$ROOT"

mkdir -p "$ROOT/logs"
cd "$ROOT"
echo "run.sh: iOS 16.5 guest, ${QEMU_RAM_GB} GB RAM, ${QEMU_SMP} cores"
echo "run.sh: stays up until the window is closed"
echo "run.sh: click and drag in the iPhone touch window. TigerVNC is the picture."
# 0 means no loader_return_after and no host timeout. See patches/no-session-timer.patch.
exec qemu/run-ios.sh 0 "${display[@]}"
