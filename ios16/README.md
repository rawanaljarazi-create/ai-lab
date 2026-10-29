# iOS 16 virtual machine

A window that boots **iOS 16.5** (build 20F66, the iPhone X restore Apple publishes) on Windows.

The guest is [HakiOS](https://github.com/oosexgang/hackios-xnu-kernel): the open-source XNU kernel from the iOS 16 generation (`xnu-8796.121.2`) plus the stock iOS 16.5 user space, in QEMU. It reaches `launchd`, `backboardd`, and SpringBoard, so you get the lock screen and the home screen. It is not an iPhone. There is no Secure Enclave, so an Apple Account cannot sign in, and the picture is drawn by the CPU.

The phone-shaped pieces come from Apple's public restore file. `setup` downloads that file onto your PC. This folder does not contain it.

## What you need

- Windows 10 or 11, 64-bit
- WSL2 with Ubuntu (Windows 11 shows the QEMU window through WSLg; Windows 10 falls back to VNC)
- About 20 GB free inside the WSL disk, and 16 GB of RAM on the PC (the guest takes 6 GB)

## Install

1. In an Administrator terminal: `wsl --install -d Ubuntu`
2. Reboot if Windows asks. Open **Ubuntu** once and create the Linux user.
3. From this folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1
```

That clones HakiOS at a pinned commit, downloads the iOS 16.5 images from Apple, and builds `root.apfs` and `system.apfs` under the Linux home directory (`~/ios16-vm/hackios`). Building on the Windows drive fails: the unpack step creates filenames that contain `:`, and NTFS rejects those.

## Run

```powershell
powershell -ExecutionPolicy Bypass -File .\run-windows.ps1
```

The session lasts 20 minutes. `.\run-windows.ps1 -Minutes 40` keeps it longer.

- Hold the left mouse button and drag. That is a finger.
- `H` is Home, `L` is the power button, `↑` and `↓` are volume.

The first frame of the lock screen takes a few minutes. The CPU is emulated, so the home screen is slow. Give it a moment after the wallpaper appears before you swipe.

If no window opens, this shell has no WSLg display. The script prints a VNC address on port 5901. A viewer such as TigerVNC can open it. On Windows 11, start the script from a normal PowerShell window so WSLg can attach.

## Linux

The same two scripts run without PowerShell:

```bash
bash ios16/wsl/setup.sh
bash ios16/wsl/run.sh 1200
```
