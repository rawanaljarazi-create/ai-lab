# Aetherwell

A twilight mesa outpost around a sleeping well.

From the repository root:

```bash
npm install
npm run dev:aetherwell
```

On a computer, click to enter. WASD move, Shift sprint, Space jump, E collect.

On a phone, the game reads User-Agent Client Hints (`navigator.userAgentData`, including the `mobile` hint) and shows a stick, a look pad, Jump, and Gather. Safari and Firefox, which do not expose those hints, get the same controls when the pointer is coarse.

Jump onto the terraces, gather all five wellshards, walk back to the well, and press E to wake it. The sky lifts and a light column comes out of the water when you finish.

On the Vercel dashboard it lives at `/aetherwell/`.
