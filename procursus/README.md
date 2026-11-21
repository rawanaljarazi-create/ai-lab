# Procursus

Not real Procursus. A browser shell that imitates a rootless bootstrap, as if you had SSH'd into an iPhone. Sileo is the package manager: Get, queue, and confirm, and it drives the same local apt database as the terminal.

Nothing here talks to a device or the network. `reset-env` clears the saved filesystem.

From the repository root:

```bash
npm install
npm run dev:procursus
```

On the Vercel dashboard it lives at `/procursus/`.
