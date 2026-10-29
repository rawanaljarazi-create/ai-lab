// Squish voice. Dough is a run of wet downward chirps (a collapsing gel
// pocket), not a wash of filtered noise. Foam is only air leaving.
// Crunch is separate bright ticks. Impact kinds:
// 1 bead tick, 2 pop/bloop, 3 wet pocket, 4 contact thump, 5 air puff.

const PARAMS = [
  "pressure", "rate", "slip", "contact", "moving", "comV",
  "wet", "air", "crunch", "elastic", "slosh", "squeak", "foam",
  "pitch", "q", "cutoff", "ring", "density", "drop", "noise",
];

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

class SquishProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.rng = 0xa341316c;
    this.tg = {
      pressure: 0, rate: 0, slip: 0, contact: 0, moving: 0, comV: 0,
      wet: 0.8, air: 0.1, crunch: 0, elastic: 0.2, slosh: 0, squeak: 0.1, foam: 0,
      pitch: 480, q: 4, cutoff: 2200, ring: 0.2, density: 0.85, drop: 0.62, noise: 0.75,
    };
    this.sm = { ...this.tg };
    this.chirps = Array.from({ length: 10 }, () => this.makeChirp());
    this.ticks = Array.from({ length: 12 }, () => this.makeTick());
    this.pops = Array.from({ length: 6 }, () => ({
      on: 0, phase: 0, f0: 700, f1: 220, age: 0, dur: 0.05, g: 0, pan: 0,
    }));
    this.thump = { on: 0, phase: 0, f: 72, age: 0, dur: 0.08, g: 0 };
    this.bed = this.makeSVF();
    this.air = this.makeSVF();
    this.master = this.makeSVF();
    this.puff = { on: 0, age: 0, dur: 0.05, g: 0, ...this.makeSVF() };
    this.queue = new Float32Array(128 * 4);
    this.iw = 0;
    this.ir = 0;
    this.chirpWait = 2000;
    this.tickWait = 800;
    this.peelWait = 4000;
    this.bloopWait = 0;
    this.releaseLatch = false;
    this.sloshPhase = 0;
    this.block = 0;
    this.dcIn = 0;
    this.dcOut = 0;
    this.port.onmessage = (event) => this.ingest(event.data);
  }

  makeSVF() {
    return { ic1: 0, ic2: 0, a1: 1, a2: 0, a3: 0, k: 1 };
  }

  makeChirp() {
    return {
      on: 0, phase: 0, f0: 420, f1: 140, age: 0, dur: 0.09,
      g: 0, pan: 0, noise: 0.7, q: 4.5, up: 0, step: 0,
      ...this.makeSVF(),
      hi: this.makeSVF(),
    };
  }

  makeTick() {
    return { on: 0, age: 0, dur: 0.005, f: 4200, g: 0, pan: 0, step: 0, ...this.makeSVF() };
  }

  rand() {
    let x = this.rng >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rng = x >>> 0;
    return this.rng / 4294967296;
  }

  bipolar() {
    return this.rand() * 2 - 1;
  }

  setSVF(f, freq, q) {
    const cutoff = Math.min(Math.max(32, freq), sampleRate * 0.45);
    const g = Math.tan((Math.PI * cutoff) / sampleRate);
    const k = 1 / Math.max(0.2, q);
    const a1 = 1 / (1 + g * (g + k));
    f.a1 = a1;
    f.a2 = g * a1;
    f.a3 = g * f.a2;
    f.k = k;
  }

  tickSVF(f, x) {
    const v3 = x - f.ic2;
    const v1 = f.a1 * f.ic1 + f.a2 * v3;
    const v2 = f.ic2 + f.a2 * f.ic1 + f.a3 * v3;
    f.ic1 = 2 * v1 - f.ic1;
    f.ic2 = 2 * v2 - f.ic2;
    if (f.ic1 > 4 || f.ic1 < -4) {
      f.ic1 *= 0.2;
      f.ic2 *= 0.2;
    }
    return { lp: v2, bp: v1 };
  }

  ingest(data) {
    if (!data) return;
    const tg = this.tg;
    tg.pressure = clamp(data.pressure ?? 0, 0, 1.5);
    tg.rate = clamp(data.rate ?? 0, -12, 12);
    tg.slip = clamp(data.slip ?? 0, 0, 1);
    tg.contact = clamp(data.contact ?? 0, 0, 1);
    tg.moving = clamp(data.moving ?? 0, 0, 1);
    tg.comV = clamp(data.comV ?? 0, 0, 1);
    tg.wet = clamp(data.wet ?? 0, 0, 1);
    tg.air = clamp(data.air ?? 0, 0, 1);
    tg.crunch = clamp(data.crunch ?? 0, 0, 1);
    tg.elastic = clamp(data.elastic ?? 0, 0, 1);
    tg.slosh = clamp(data.slosh ?? 0, 0, 1);
    tg.squeak = clamp(data.squeak ?? 0, 0, 1);
    tg.foam = clamp(data.foam ?? 0, 0, 1);
    tg.pitch = clamp(data.pitch ?? 400, 50, 1800);
    tg.q = clamp(data.q ?? 4, 0.4, 14);
    tg.cutoff = clamp(data.cutoff ?? 2200, 180, 14000);
    tg.ring = clamp(data.ring ?? 0.2, 0.02, 1.6);
    tg.density = clamp(data.density ?? 0.8, 0, 1.6);
    tg.drop = clamp(data.drop ?? 0.6, 0, 0.92);
    tg.noise = clamp(data.noise ?? 0.7, 0, 1);
    const impacts = data.impacts;
    if (!impacts) return;
    for (let i = 0; i < impacts.length; i++) {
      const hit = impacts[i];
      const w = this.iw;
      this.queue[w] = hit.g || 0;
      this.queue[w + 1] = hit.f || 200;
      this.queue[w + 2] = hit.kind || 0;
      this.queue[w + 3] = hit.pan || 0;
      let next = w + 4;
      if (next >= this.queue.length) next = 0;
      this.iw = next;
      if (this.iw === this.ir) {
        this.ir += 4;
        if (this.ir >= this.queue.length) this.ir = 0;
      }
    }
  }

  smooth() {
    const sm = this.sm;
    const tg = this.tg;
    for (let i = 0; i < PARAMS.length; i++) {
      const key = PARAMS[i];
      sm[key] += (tg[key] - sm[key]) * 0.22;
    }
  }

  activity() {
    const sm = this.sm;
    const motion = Math.abs(sm.rate) * 0.9 + sm.slip * 1.35 + sm.moving * 0.45 + sm.comV * 0.25;
    const pressed = 0.3 + sm.pressure * 0.75 + sm.contact * 0.25;
    return Math.min(3.2, motion * pressed);
  }

  freeChirp() {
    for (let i = 0; i < this.chirps.length; i++) if (!this.chirps[i].on) return this.chirps[i];
    return this.chirps[(this.block >>> 3) % this.chirps.length];
  }

  freeTick() {
    for (let i = 0; i < this.ticks.length; i++) if (!this.ticks[i].on) return this.ticks[i];
    return this.ticks[this.block % this.ticks.length];
  }

  freePop() {
    for (let i = 0; i < this.pops.length; i++) if (!this.pops[i].on) return this.pops[i];
    return this.pops[0];
  }

  startChirp(opts) {
    const ch = this.freeChirp();
    ch.on = 1;
    ch.phase = this.rand();
    ch.f0 = opts.f0;
    ch.f1 = opts.f1;
    ch.age = 0;
    ch.dur = opts.dur;
    ch.g = opts.g;
    ch.pan = opts.pan;
    ch.noise = opts.noise;
    ch.q = opts.q;
    ch.up = opts.up ? 1 : 0;
    ch.step = 0;
    ch.ic1 = 0;
    ch.ic2 = 0;
    ch.hi.ic1 = 0;
    ch.hi.ic2 = 0;
  }

  startTick(f, g, pan) {
    const t = this.freeTick();
    t.on = 1;
    t.age = 0;
    t.dur = 0.0022 + this.rand() * 0.0045;
    t.f = f;
    t.g = g;
    t.pan = pan;
    t.step = 0;
    t.ic1 = 0;
    t.ic2 = 0;
  }

  spawnSquelch(act, up) {
    const sm = this.sm;
    const press = clamp(sm.pressure, 0, 1);
    const jitter = 0.86 + this.rand() * 0.28;
    const base = sm.pitch * jitter * (up ? 0.72 : 1.12 - press * 0.38);
    const drop = sm.drop * (0.62 + press * 0.38);
    const f0 = up ? base * (1 - drop * 0.75) : base;
    const f1 = up ? base * (0.85 + this.rand() * 0.25) : base * (1 - drop);
    const dur = (up ? 0.09 : 0.068 + (1 - press) * 0.04) + this.rand() * 0.028;
    const g = Math.min(0.95, (0.22 + Math.min(1, act / 1.6) * 0.7) * (0.35 + sm.wet));
    this.startChirp({
      f0: Math.max(70, f0),
      f1: Math.max(48, f1),
      dur,
      g,
      pan: this.rand() * 0.7 - 0.35,
      noise: sm.noise,
      q: 2.2 + sm.wet * 3.4 + (1 - sm.noise) * 2,
      up,
    });
  }

  spawnPeel() {
    const sm = this.sm;
    this.startChirp({
      f0: sm.pitch * (1.8 + this.rand() * 0.5),
      f1: sm.pitch * (1.15 + this.rand() * 0.2),
      dur: 0.028 + this.rand() * 0.02,
      g: 0.12 + sm.squeak * 0.22,
      pan: this.rand() * 0.8 - 0.4,
      noise: 0.25,
      q: 7,
      up: 1,
    });
  }

  spawnBloop(gain) {
    const sm = this.sm;
    const f0 = sm.pitch * (0.72 + this.rand() * 0.12);
    this.startChirp({
      f0,
      f1: f0 * (0.62 + sm.drop * 0.15),
      dur: 0.16 + sm.ring * 0.12,
      g: gain,
      pan: this.rand() * 0.4 - 0.2,
      noise: 0.08 + sm.slosh * 0.15,
      q: 8,
      up: 0,
    });
  }

  takeImpacts() {
    while (this.ir !== this.iw) {
      const g = this.queue[this.ir];
      const f = this.queue[this.ir + 1];
      const kind = this.queue[this.ir + 2];
      const pan = this.queue[this.ir + 3];
      this.ir += 4;
      if (this.ir >= this.queue.length) this.ir = 0;
      if (kind === 1) this.startTick(1800 + f * 4 + this.rand() * 2200, g * (0.35 + this.sm.crunch), pan);
      else if (kind === 2) {
        const pop = this.freePop();
        pop.on = 1;
        pop.phase = 0;
        pop.f0 = Math.max(280, f * 3.2);
        pop.f1 = pop.f0 * 0.38;
        pop.age = 0;
        pop.dur = 0.034 + this.rand() * 0.02;
        pop.g = Math.min(0.8, g * (0.45 + this.sm.elastic * 0.4));
        pop.pan = pan;
      } else if (kind === 3) this.spawnSquelch(0.6 + g, false);
      else if (kind === 4) {
        this.thump.on = 1;
        this.thump.phase = 0;
        this.thump.f = 58 + this.sm.pressure * 24;
        this.thump.age = 0;
        this.thump.dur = 0.07;
        this.thump.g = Math.min(0.45, g * 0.32 * (0.4 + this.sm.wet));
      } else if (kind === 5) {
        this.puff.on = 1;
        this.puff.age = 0;
        this.puff.dur = 0.04 + this.rand() * 0.03;
        this.puff.g = g * this.sm.air * 0.5;
        this.puff.ic1 = 0;
        this.puff.ic2 = 0;
      }
    }
  }

  voiceChirp(ch) {
    const t = ch.age / ch.dur;
    if (t >= 1) {
      ch.on = 0;
      return 0;
    }
    const atk = t < 0.045 ? t / 0.045 : 1;
    const env = atk * Math.exp(-Math.max(0, t - 0.07) * (ch.up ? 1.7 : 2.05));
    const freq = ch.f0 + (ch.f1 - ch.f0) * Math.pow(Math.min(1, t), 0.3);
    ch.phase += freq / sampleRate;
    if (ch.phase >= 1) ch.phase -= 1;
    if ((ch.step++ & 7) === 0) {
      this.setSVF(ch, freq * 1.25, ch.q);
      this.setSVF(ch.hi, freq * 2.35, 1.7);
    }
    const sine = Math.sin(ch.phase * 6.28318530718);
    const bp = this.tickSVF(ch, this.bipolar()).bp;
    const hi = this.tickSVF(ch.hi, this.bipolar()).bp;
    const tone = (1 - ch.noise) * 0.85;
    const grit = 0.42 + ch.noise * 0.9;
    const wet = sine * tone + bp * grit + hi * ch.noise * 0.28;
    ch.age += 1 / sampleRate;
    return Math.tanh(wet * 1.7) * env * ch.g;
  }

  voiceTick(t) {
    const u = t.age / t.dur;
    if (u >= 1) {
      t.on = 0;
      return 0;
    }
    const env = (1 - u) * (1 - u);
    if ((t.step++ & 3) === 0) this.setSVF(t, t.f, 2.4);
    const bp = this.tickSVF(t, this.bipolar()).bp;
    t.age += 1 / sampleRate;
    return bp * env * t.g * 1.8;
  }

  voicePop(p) {
    const t = p.age / p.dur;
    if (t >= 1) {
      p.on = 0;
      return 0;
    }
    const freq = p.f0 + (p.f1 - p.f0) * t;
    p.phase += freq / sampleRate;
    if (p.phase >= 1) p.phase -= 1;
    const env = Math.exp(-t * 3.2) * (t < 0.04 ? t / 0.04 : 1);
    const click = t < 0.012 ? (this.bipolar() * (1 - t / 0.012)) : 0;
    p.age += 1 / sampleRate;
    return (Math.sin(p.phase * 6.28318530718) * 0.75 + click * 0.55) * env * p.g;
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    if (!out || !out[0]) return true;
    const left = out[0];
    const right = out[1] || null;
    const n = left.length;
    this.smooth();
    this.takeImpacts();
    const sm = this.sm;
    const act = this.activity();
    const foamish = sm.foam > 0.55;
    if (sm.rate < -0.4 && !this.releaseLatch && sm.pressure > 0.08) {
      this.releaseLatch = true;
      if (!foamish && sm.wet > 0.15) this.spawnSquelch(Math.min(2.2, -sm.rate * 0.8 + 0.4), true);
      if (sm.elastic > 0.55) {
        this.spawnBloop(0.28 + sm.elastic * 0.35);
        this.bloopWait = (0.16 + this.rand() * 0.06) * sampleRate;
      }
    }
    if (sm.rate > -0.08) this.releaseLatch = false;

    if ((this.block & 31) === 0) {
      const open = foamish ? 220 + (1 - sm.pressure) * sm.cutoff : sm.cutoff * (0.42 + (1 - sm.pressure) * 0.75);
      this.setSVF(this.master, open, 0.75);
      const bedCut = Math.max(90, sm.pitch * (0.55 - sm.pressure * 0.28));
      this.setSVF(this.bed, bedCut, 1.3);
      const airCut = 160 + (1 - sm.pressure) * (foamish ? sm.cutoff : sm.cutoff * 0.4);
      this.setSVF(this.air, airCut, 0.7);
    }

    for (let i = 0; i < n; i++) {
      this.block++;
      if (this.bloopWait > 0) {
        this.bloopWait--;
        if (this.bloopWait === 0) this.spawnBloop(0.16 + sm.elastic * 0.12);
      }
      this.chirpWait--;
      if (this.chirpWait <= 0) {
        if (!foamish && sm.wet > 0.18 && act > 0.16) this.spawnSquelch(act, false);
        const density = 0.28 + sm.density;
        const gap = (0.2 - Math.min(0.15, act * 0.045)) / density;
        this.chirpWait = Math.max(140, gap * sampleRate * (0.62 + this.rand() * 0.75));
      }
      this.tickWait--;
      if (this.tickWait <= 0) {
        if (sm.crunch > 0.2 && act > 0.12) {
          const f = 2200 + this.rand() * 5200 + sm.pressure * 800;
          this.startTick(f, (0.18 + this.rand() * 0.55) * sm.crunch * Math.min(1, act), this.rand() * 0.9 - 0.45);
          if (this.rand() < 0.35) {
            this.startTick(f * (0.8 + this.rand() * 0.5), 0.25 * sm.crunch, this.rand() - 0.5);
          }
        }
        const gap = 0.018 + (1 - Math.min(1, act / 2)) * 0.05;
        this.tickWait = gap * sampleRate * (0.45 + this.rand());
      }
      this.peelWait--;
      if (this.peelWait <= 0) {
        if (sm.squeak > 0.12 && sm.slip > 0.28 && act > 0.2) this.spawnPeel();
        this.peelWait = (0.12 + this.rand() * 0.2) * sampleRate;
      }

      let sample = 0;
      for (let c = 0; c < this.chirps.length; c++) {
        const ch = this.chirps[c];
        if (ch.on) sample += this.voiceChirp(ch);
      }
      for (let c = 0; c < this.ticks.length; c++) {
        const t = this.ticks[c];
        if (t.on) sample += this.voiceTick(t);
      }
      for (let c = 0; c < this.pops.length; c++) {
        const p = this.pops[c];
        if (p.on) sample += this.voicePop(p);
      }
      if (this.thump.on) {
        const t = this.thump.age / this.thump.dur;
        if (t >= 1) this.thump.on = 0;
        else {
          this.thump.phase += this.thump.f / sampleRate;
          const env = Math.exp(-t * 4.5);
          sample += Math.sin(this.thump.phase * 6.28318530718) * env * this.thump.g;
          this.thump.age += 1 / sampleRate;
        }
      }

      const bed = this.tickSVF(this.bed, this.bipolar()).lp;
      sample += bed * act * sm.wet * (1 - sm.foam) * 0.035;
      const air = this.tickSVF(this.air, this.bipolar()).lp;
      const airAmt = foamish ? act * 0.7 + sm.pressure * sm.moving * 0.15 : act * 0.22;
      sample += air * airAmt * sm.air * 0.55;
      if (sm.slosh > 0.45 && act > 0.12) {
        this.sloshPhase += (1.6 + sm.pressure * 1.4) / sampleRate;
        const wob = Math.sin(this.sloshPhase * 6.28318530718);
        sample += wob * wob * wob * sm.slosh * Math.min(1, act) * 0.07;
      }
      if (this.puff.on) {
        const t = this.puff.age / this.puff.dur;
        if (t >= 1) this.puff.on = 0;
        else {
          this.setSVF(this.puff, 500 + (1 - t) * 1600, 0.8);
          sample += this.tickSVF(this.puff, this.bipolar()).lp * (1 - t) * this.puff.g;
          this.puff.age += 1 / sampleRate;
        }
      }

      sample = this.tickSVF(this.master, sample).lp;
      sample = Math.tanh(sample * 1.25);
      const dc = sample - this.dcIn + 0.995 * this.dcOut;
      this.dcIn = sample;
      this.dcOut = dc;
      left[i] = dc;
      if (right) right[i] = dc;
    }
    return true;
  }
}

registerProcessor("squish-voice", SquishProcessor);
