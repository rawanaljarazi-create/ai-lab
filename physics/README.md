# Physics

A felt table for circles, boxes, and polygons. Drag a shape and let go to throw it. Gravity, bounce, and friction are handled by a small impulse solver in `src/world.js`.

From the repository root:

```bash
npm install
npm run dev:physics
```

Tap or click the felt to drop the selected shape. Drag to throw. Pause, reset, the gravity slider, and Static control the table. Right-click a shape, or select it and press Make static, to pin it. On a phone the same gestures are touches.

On the Vercel dashboard it lives at `/physics/`.
