export function createAudio() {
  let ctx = null;
  let engine = null;
  let muted = false;
  let lastHit = 0;

  function context() {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function ensureEngine() {
    const ac = context();
    if (engine) return engine;
    const osc = ac.createOscillator();
    const body = ac.createOscillator();
    const filter = ac.createBiquadFilter();
    const gain = ac.createGain();
    osc.type = "sawtooth";
    body.type = "triangle";
    filter.type = "lowpass";
    filter.frequency.value = 280;
    gain.gain.value = 0.0001;
    osc.connect(filter);
    body.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    osc.start();
    body.start();
    engine = { osc, body, filter, gain };
    return engine;
  }

  function tone(freq, when, dur, type, level) {
    const ac = context();
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    amp.gain.setValueAtTime(level, when);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(amp);
    amp.connect(ac.destination);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  return {
    get muted() {
      return muted;
    },
    set muted(value) {
      muted = Boolean(value);
      if (muted && engine && ctx) engine.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
    },
    unlock() {
      if (muted) return;
      try {
        context();
      } catch {
        muted = true;
      }
    },
    update(speed, throttle, phase) {
      if (muted) return;
      try {
        const node = ensureEngine();
        const ac = context();
        const moving = phase === "racing" || phase === "lights";
        const rate = 52 + Math.abs(speed) * 2.05 + throttle * 46;
        node.osc.frequency.setTargetAtTime(rate, ac.currentTime, 0.08);
        node.body.frequency.setTargetAtTime(rate * 0.5, ac.currentTime, 0.08);
        node.filter.frequency.setTargetAtTime(220 + throttle * 900 + Math.abs(speed) * 8, ac.currentTime, 0.08);
        const level = moving ? 0.012 + throttle * 0.01 + Math.min(0.012, Math.abs(speed) * 0.00015) : 0.0001;
        node.gain.gain.setTargetAtTime(level, ac.currentTime, 0.06);
      } catch {
        muted = true;
      }
    },
    blip(index) {
      if (muted) return;
      try {
        const t = context().currentTime;
        tone(520 + index * 70, t, 0.09, "square", 0.03);
      } catch {
        muted = true;
      }
    },
    go() {
      if (muted) return;
      try {
        const t = context().currentTime;
        tone(880, t, 0.12, "square", 0.04);
        tone(1320, t + 0.08, 0.16, "square", 0.03);
      } catch {
        muted = true;
      }
    },
    hit(now) {
      if (muted || now - lastHit < 0.28) return;
      lastHit = now;
      try {
        const ac = context();
        const t = ac.currentTime;
        const buffer = ac.createBuffer(1, ac.sampleRate * 0.12, ac.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        const noise = ac.createBufferSource();
        const amp = ac.createGain();
        const filter = ac.createBiquadFilter();
        noise.buffer = buffer;
        filter.type = "lowpass";
        filter.frequency.value = 420;
        amp.gain.setValueAtTime(0.08, t);
        amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        noise.connect(filter);
        filter.connect(amp);
        amp.connect(ac.destination);
        noise.start(t);
        noise.stop(t + 0.13);
      } catch {
        muted = true;
      }
    },
  };
}
