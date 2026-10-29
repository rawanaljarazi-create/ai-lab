export function createEngine() {
  let ctx = null;
  let node = null;
  let master = null;
  let analyser = null;
  let muted = false;
  let failed = false;
  const wave = new Uint8Array(1024);
  const freq = new Uint8Array(512);
  const bins = new Float32Array(1024);

  async function ensure() {
    if (ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    ctx = new AudioCtx();
    await ctx.audioWorklet.addModule(new URL("./squish-worklet.js", import.meta.url));
    try {
      node = new AudioWorkletNode(ctx, "squish-voice", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
    } catch {
      node = new AudioWorkletNode(ctx, "squish-voice");
    }
    const shelf = ctx.createBiquadFilter();
    shelf.type = "highshelf";
    shelf.frequency.value = 7600;
    shelf.gain.value = -2;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 3;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.55;
    node.connect(shelf);
    shelf.connect(comp);
    comp.connect(master);
    master.connect(ctx.destination);
    master.connect(analyser);
  }

  return {
    async wake() {
      try {
        await ensure();
        if (ctx.state !== "running") await ctx.resume();
        return ctx.state;
      } catch (err) {
        failed = true;
        console.error("Squish sound engine failed", err);
        return "failed";
      }
    },
    send(payload) {
      if (node) node.port.postMessage(payload);
    },
    setMuted(next) {
      muted = next;
      if (master && ctx) master.gain.setTargetAtTime(next ? 0 : 0.9, ctx.currentTime, 0.02);
    },
    get muted() {
      return muted;
    },
    get failed() {
      return failed;
    },
    get ready() {
      return !!ctx && ctx.state === "running";
    },
    timeDomain() {
      if (!analyser) return null;
      analyser.getByteTimeDomainData(wave);
      return wave;
    },
    rms() {
      if (!analyser) return 0;
      analyser.getFloatTimeDomainData(bins);
      let s = 0;
      for (let i = 0; i < bins.length; i++) s += bins[i] * bins[i];
      return Math.sqrt(s / bins.length);
    },
    levels() {
      if (!analyser) return null;
      analyser.getByteFrequencyData(freq);
      const n = freq.length;
      const take = (a, b) => {
        const i0 = Math.floor(a * n);
        const i1 = Math.max(i0 + 1, Math.floor(b * n));
        let s = 0;
        for (let i = i0; i < i1; i++) s += freq[i];
        return s / (i1 - i0) / 255;
      };
      return { low: take(0, 0.06), mid: take(0.06, 0.22), high: take(0.22, 0.72), rms: this.rms() };
    },
  };
}
