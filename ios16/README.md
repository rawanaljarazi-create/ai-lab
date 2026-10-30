# iOS 16 virtual machine

A window that boots **iOS 16.5** (build 20F66, the iPhone X restore Apple publishes) on Windows.

The guest is [HakiOS](https://github.com/oosexgang/hackios-xnu-kernel): the open-source XNU kernel from the iOS 16 generation (`xnu-8796.121.2`) plus the stock iOS 16.5 user space, in QEMU. It reaches `launchd`, `backboardd`, and SpringBoard, so you get the lock screen and the home screen. It is not an iPhone. There is no Secure Enclave, so an Apple Account cannot sign in, and the picture is drawn by the CPU.

The phone-shaped pieces come from Apple's public restore file. Setup downloads that file onto your PC. This folder does not contain it.

The guest stays up until you close the window.

## What you need

- Windows 10 or 11, 64-bit
- WSL2 with Ubuntu. Windows 11 shows the QEMU window through WSLg. Windows 10 uses a VNC viewer on port 5901.
- About 20 GB free inside the WSL disk
- 16 GB of RAM on the PC. The guest takes 7 GB, so WSL itself needs about 12 GB.

If WSL is using less than that, save this as `%UserProfile%\.wslconfig`:

```ini
[wsl2]
memory=12GB
```

Then run `wsl --shutdown` and start Setup again.

## Install

1. In an Administrator terminal: `wsl --install -d Ubuntu`
2. Reboot if Windows asks. Open **Ubuntu** once and create the Linux user.
3. Double-click `Setup.bat` in this folder.

That clones HakiOS at a pinned commit, downloads the iOS 16.5 images from Apple, and builds `root.apfs` and `system.apfs` under the Linux home directory (`~/ios16-vm/hackios`). Building on the Windows drive fails: the unpack step creates filenames that contain `:`, and NTFS rejects those.

From PowerShell, the same step is:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1
```

## Run

Double-click `Run.bat`.

The first picture is the white Apple logo on black. SpringBoard is already starting behind it. The lock screen follows, slowly, because the CPU is emulated. Give the clock a moment after it appears, then swipe.

- Hold the left mouse button and drag. That is a finger.
- `H` is Home, `L` is the power button, `↑` and `↓` are volume.

On Windows 10 there is no WSLg window and TigerVNC only shows the picture, so
`Run.bat` starts `touch-pad.ps1` alongside it. That pad window is the
controller, and the phone picture lives inside it (a snapshot every two
seconds, taken from QEMU's monitor port, never from the viewer's socket) -
click or drag on the picture to touch the phone, and use its Home, Power,
and volume buttons. The picture area is shaped like the phone's screen, so
you tap where you see the thing you want. Input goes through QEMU's QMP
control port, which Setup patches to listen on all interfaces; the stock
listener binds `127.0.0.1` only, and WSL does not forward that to Windows,
so on a stock tree the pad stays on "Waiting for the phone..." forever.

The pad takes the long view on trouble: it shows up right away, keeps
retrying the connection, and says so in its status line if the input port
is busy or the phone stopped. QEMU's control socket serves one connection
at a time, so if a half-open connection is ever stuck in limbo and the pad
can't get through after another window was force-closed, run this (no
password needed) and the pad reconnects on its own:

    wsl -d Ubuntu -u root -- ss -K sport = :4445

Close the window to stop the guest. Nothing inside the guest is on a timer.

If no window opens, this shell has no WSLg display and the script prints a VNC address on port 5901. A viewer such as TigerVNC can open it. On Windows 11, start `Run.bat` from the desktop so WSLg can attach.

## Linux

```bash
bash ios16/wsl/setup.sh
bash ios16/wsl/run.sh
```
