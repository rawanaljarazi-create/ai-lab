export function createAudio() {
  let ctx = null;
  let muted = false;

  function context() {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, when, dur, type, gain) {
    const ac = context();
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    amp.gain.setValueAtTime(gain, when);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(amp);
    amp.connect(ac.destination);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  function play(fn) {
    if (muted) return;
    try {
      fn();
    } catch {
      muted = true;
    }
  }

  return {
    get muted() {
      return muted;
    },
    set muted(value) {
      muted = Boolean(value);
    },
    flap() {
      play(() => {
        const t = context().currentTime;
        tone(620, t, 0.07, "square", 0.028);
        tone(390, t, 0.09, "triangle", 0.02);
      });
    },
    score() {
      play(() => {
        const t = context().currentTime;
        tone(880, t, 0.08, "sine", 0.04);
        tone(1320, t + 0.07, 0.12, "sine", 0.035);
      });
    },
    hit() {
      play(() => {
        const ac = context();
        const t = ac.currentTime;
        const osc = ac.createOscillator();
        const amp = ac.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(190, t);
        osc.frequency.exponentialRampToValueAtTime(48, t + 0.2);
        amp.gain.setValueAtTime(0.07, t);
        amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
        osc.connect(amp);
        amp.connect(ac.destination);
        osc.start(t);
        osc.stop(t + 0.26);
      });
    },
  };
}
