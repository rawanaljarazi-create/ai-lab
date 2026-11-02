export function qualityFor({ phone = false, cores = 8, width = 1280, height = 720 } = {}) {
  const narrow = width < 900 || (width < 1100 && height < 520);
  const low = Boolean(phone) || cores <= 4;
  return {
    phone: Boolean(phone),
    narrow,
    touch: Boolean(phone) || narrow,
    pixelCap: low ? 1.5 : 2,
    shadowSize: low ? 1024 : 2048,
    bloom: true,
    bloomScale: low ? 0.55 : 0.8,
    trees: low ? 32 : 64,
    city: low ? 16 : 28,
    antialias: true,
  };
}

export function isPhone(nav = globalThis.navigator, win = globalThis.window) {
  if (!nav) return false;
  const touch = (nav.maxTouchPoints || 0) > 0;
  const coarse = win?.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const narrow = (win?.innerWidth || 1200) < 900;
  return (coarse && touch) || (touch && narrow);
}

export function hintFor(phone) {
  if (phone) return "Tap to race. Pad steers, the round pedal is gas.";
  return "Enter to race. Arrows or WASD. Space brakes. C changes camera.";
}

export function againFor(phone) {
  return phone ? "Tap to race again" : "Enter to race again";
}
