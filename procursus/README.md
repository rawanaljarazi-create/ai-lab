# Procursus

A rootless shell whose packages are the real Procursus suite 3000 archive from `https://apt.procurs.us/`. `apt update` refreshes that index, and `apt install` downloads the `.deb` and unpacks its files. iPhone Mach-O binaries cannot be executed in the browser.

Nothing here talks to a device or the network. `reset-env` clears the saved filesystem.

From the repository root:

```bash
npm install
npm run dev:procursus
```

On the Vercel dashboard it lives at `/procursus/`.
