# Typing

A timed typing desk. Words arrive in a stream, correct and missed letters are marked as you go, and the clock keeps WPM and accuracy honest.

From the repository root:

```bash
npm install
npm run dev:typing
```

Pick 15, 30, or 60 seconds. The first letter starts the clock. Backspace repairs a letter, and the miss stays in the accuracy. A local best is kept for each length.

On the Vercel dashboard it lives at `/typing/`.
