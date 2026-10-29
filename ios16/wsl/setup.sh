#!/bin/bash
# Build the iOS 16.5 QEMU guest on Linux or WSL2.
# Apple's IPSW is downloaded to this machine only. Nothing from it is written back to the repo.
set -euo pipefail

ROOT="${HAKIOS_ROOT:-$HOME/ios16-vm/hackios}"
URL="${HAKIOS_URL:-https://github.com/oosexgang/hackios-xnu-kernel.git}"
COMMIT="${HAKIOS_COMMIT:-88513176b1e96ecf0b764cd62c6f4e6ac71345e3}"

if [ -n "${WSL_DISTRO_NAME:-}" ] && [[ "$ROOT" == /mnt/* ]]; then
	echo "setup.sh: HAKIOS_ROOT is on the Windows drive ($ROOT)." >&2
	echo "setup.sh: unpacking iOS creates filenames with ':' which NTFS rejects. Use WSL's own disk, for example \$HOME/ios16-vm/hackios." >&2
	exit 1
fi

mkdir -p "$(dirname "$ROOT")"
avail_gb=$(df -BG "$(dirname "$ROOT")" | awk 'NR==2 { gsub(/G/,"",$4); print $4 }')
if [ "${avail_gb:-0}" -lt 20 ]; then
	echo "setup.sh: about ${avail_gb} GB free. The IPSW unpack and the two disk images need roughly 20 GB." >&2
	exit 1
fi

if command -v sudo >/dev/null 2>&1 && [ "$(id -u)" -ne 0 ]; then
	SUDO=sudo
else
	SUDO=
fi

$SUDO apt-get update -qq
$SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y \
	git python3 build-essential clang lld 7zip \
	qemu-system-arm qemu-system-gui qemu-efi-aarch64 \
	ca-certificates

command -v 7z >/dev/null
ver=$(7z | awk 'NR==2 { print $2; exit }')
# 7-Zip 23 reads the APFS images inside the IPSW. p7zip 16 does not.
major=${ver%%.*}
if [ "${major:-0}" -lt 23 ]; then
	echo "setup.sh: 7z is $ver. Need 7-Zip 23 or newer (Ubuntu package: 7zip)." >&2
	exit 1
fi

if [ ! -d "$ROOT/.git" ]; then
	git clone "$URL" "$ROOT"
fi
git -C "$ROOT" fetch --depth 1 origin "$COMMIT"
git -C "$ROOT" checkout -f --detach "$COMMIT"
# The display request is stored through MMIO, then the device clears the control word.
# Without a volatile reload, clang keeps the old nonzero value, the loader gives up,
# and iOS draws into a screen QEMU is not showing.
patch -p1 -d "$ROOT" --forward --batch < "$(dirname "$0")/../patches/ramfb-volatile.patch"

if ! command -v lzfse >/dev/null 2>&1 && [ ! -x "$ROOT/xnu-deps/host/bin/lzfse" ]; then
	tmp=$(mktemp -d)
	git clone --depth 1 https://github.com/lzfse/lzfse "$tmp/lzfse"
	make -C "$tmp/lzfse"
	mkdir -p "$ROOT/xnu-deps/host/bin"
	cp "$tmp/lzfse/build/bin/lzfse" "$ROOT/xnu-deps/host/bin/lzfse"
	rm -rf "$tmp"
fi

if [ ! -f "$ROOT/sysimage/.done-cryptex-app" ]; then
	(cd "$ROOT" && sysimage/fetch.sh)
fi

if [ ! -f "$ROOT/userland/system.apfs" ] || [ ! -f "$ROOT/userland/root.apfs" ]; then
	(cd "$ROOT" && REST=1 userland/build.sh)
fi

(cd "$ROOT" && xnuloader/build.sh)

echo "setup.sh: ready at $ROOT"
echo "setup.sh: next, run ios16/wsl/run.sh"
