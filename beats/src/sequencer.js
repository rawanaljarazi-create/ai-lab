export const STEPS = 16;
export const TRACKS = [
  { id: "kick", label: "Kick" },
  { id: "snare", label: "Snare" },
  { id: "hat", label: "Hat" },
  { id: "clap", label: "Clap" },
  { id: "bass", label: "Bass" },
  { id: "pluck", label: "Pluck" },
];
export const MIN_BPM = 60;
export const MAX_BPM = 180;

export function createPattern() {
  return TRACKS.map(() => Array(STEPS).fill(false));
}

export function toggle(pattern, track, step) {
  const next = pattern.map((row) => row.slice());
  next[track][step] = !next[track][step];
  return next;
}

export function clampBpm(bpm) {
  const n = Math.round(Number(bpm));
  if (!Number.isFinite(n)) return 110;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, n));
}

// Length of one sixteenth note in seconds.
export function stepSeconds(bpm) {
  return 60 / clampBpm(bpm) / 4;
}

export function nextStep(step) {
  return (step + 1) % STEPS;
}

export function activeTracks(pattern, step) {
  return pattern.flatMap((row, i) => (row[step] ? [i] : []));
}

export function encode(pattern) {
  return pattern
    .map((row) => parseInt(row.map((on) => (on ? "1" : "0")).join(""), 2).toString(16).padStart(4, "0"))
    .join("");
}

export function decode(text) {
  const pattern = createPattern();
  if (typeof text !== "string" || !/^[0-9a-f]+$/i.test(text) || text.length !== TRACKS.length * 4) return pattern;
  return pattern.map((_, t) => {
    const bits = parseInt(text.slice(t * 4, t * 4 + 4), 16).toString(2).padStart(STEPS, "0");
    return [...bits].map((b) => b === "1");
  });
}

export function demoPattern() {
  let p = createPattern();
  const on = { 0: [0, 4, 8, 12], 1: [4, 12], 2: [2, 6, 10, 14], 3: [12, 15], 4: [0, 3, 8, 11], 5: [6, 14] };
  for (const [t, steps] of Object.entries(on)) for (const s of steps) p = toggle(p, Number(t), s);
  return p;
}
