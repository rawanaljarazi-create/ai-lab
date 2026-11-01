let ctx;
let noise;

export function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

function noiseBuffer(ac) {
  if (noise) return noise;
  noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

function env(ac, t, peak, decay) {
  const g = ac.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  g.connect(ac.destination);
  return g;
}

function tone(ac, t, type, f0, f1, peak, decay) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + decay);
  o.connect(env(ac, t, peak, decay));
  o.start(t);
  o.stop(t + decay + 0.02);
}

function hiss(ac, t, freq, peak, decay) {
  const s = ac.createBufferSource();
  s.buffer = noiseBuffer(ac);
  const f = ac.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = freq;
  s.connect(f).connect(env(ac, t, peak, decay));
  s.start(t);
  s.stop(t + decay + 0.02);
}

const BASS = [55, 55, 65.41, 49];
const PLUCK = [440, 523.25, 659.25, 587.33];

export function play(id, t, step) {
  const ac = audio();
  if (id === "kick") tone(ac, t, "sine", 150, 40, 0.9, 0.35);
  else if (id === "snare") { hiss(ac, t, 1200, 0.5, 0.18); tone(ac, t, "triangle", 220, 120, 0.3, 0.1); }
  else if (id === "hat") hiss(ac, t, 7000, 0.25, 0.05);
  else if (id === "clap") { hiss(ac, t, 1500, 0.4, 0.08); hiss(ac, t + 0.02, 1500, 0.35, 0.12); }
  else if (id === "bass") tone(ac, t, "sawtooth", BASS[Math.floor(step / 4) % 4], 0, 0.25, 0.22);
  else if (id === "pluck") tone(ac, t, "square", PLUCK[Math.floor(step / 4) % 4], 0, 0.12, 0.25);
}
