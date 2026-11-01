# ai-lab

A folder per experiment. The Vercel site is a dashboard: [Aetherwell](https://ai-lab-zeta-lyart.vercel.app/aetherwell/) is the mesa that was already live, and [Squishy](https://ai-lab-zeta-lyart.vercel.app/squishy/), [Flappy](https://ai-lab-zeta-lyart.vercel.app/flappy/), and [Typing](https://ai-lab-zeta-lyart.vercel.app/typing/) ship on that same site.

```bash
npm install
```

| Folder | What it is | Run |
| --- | --- | --- |
| [`aetherwell/`](aetherwell) | First-person Three.js twilight mesa. Jump the terraces, gather five wellshards, return to the well, press E, and wake it. | `npm run dev:aetherwell` |
| [`squishy/`](squishy) | Browser dough you can knead, with a live squelch. | `npm run dev:squishy` |
| [`flappy/`](flappy) | A 3D meadow bird. One flap, then the pipes. | `npm run dev:flappy` |
| [`typing/`](typing) | Timed typing desk. Live WPM and accuracy, 15/30/60 second runs, a local best. | `npm run dev:typing` |
| [`shellbox/`](shellbox) | Bridge that draws a Fireworks Mania show inside Garry's Mod. Windows + those two Steam games. Not on Vercel. | See [`shellbox/README.md`](shellbox/README.md) |
| [`ios16/`](ios16) | iOS 16.5 lock screen and home screen in QEMU. Windows via WSL2, or Linux directly. Listed on the site at `/ios16/`. | See [`ios16/README.md`](ios16/README.md) |
| [`site/`](site) | Dashboard that Vercel serves at `/`. | `npm run build:site` then `npm run preview:site` |

`npm run dev` still starts Aetherwell locally.

```bash
npm test
npm run build:site
```

`build:site` writes `dist/` with the dashboard plus `/aetherwell/`, `/squishy/`, `/flappy/`, and `/typing/`. That is what Vercel publishes.
