export const HARBOR_WIDTH = 18;
export const HARBOR_RUNOFF = 3.6;

const TAU = Math.PI * 2;

export function harborPoints() {
  const count = 42;
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const a = -Math.PI / 2 + (i / count) * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    let x = Math.sign(c) * Math.pow(Math.abs(c), 0.48) * 198;
    let z = Math.sign(s) * Math.pow(Math.abs(s), 0.82) * 118;
    if (s > 0.42) {
      const fade = Math.sin(Math.min(1, (s - 0.42) / 0.58) * Math.PI);
      x += Math.sin((a - Math.PI / 2) * 2.2) * 24 * fade;
      z += Math.cos((a - Math.PI / 2) * 2.2) * 6 * fade;
    }
    points.push([round(x), round(z)]);
  }
  return points;
}

export function buildHarbor() {
  return buildTrack(harborPoints(), {
    width: HARBOR_WIDTH,
    runoff: HARBOR_RUNOFF,
    steps: 12,
  });
}

export function buildTrack(rawPoints, options = {}) {
  const width = options.width ?? HARBOR_WIDTH;
  const runoff = options.runoff ?? HARBOR_RUNOFF;
  const steps = options.steps ?? 12;
  const controls = rawPoints.map(([x, z]) => ({ x, z }));
  const count = controls.length;
  const samples = [];

  for (let i = 0; i < count; i += 1) {
    const p0 = controls[(i - 1 + count) % count];
    const p1 = controls[i];
    const p2 = controls[(i + 1) % count];
    const p3 = controls[(i + 2) % count];
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      samples.push({
        x: catmull(p0.x, p1.x, p2.x, p3.x, t),
        z: catmull(p0.z, p1.z, p2.z, p3.z, t),
      });
    }
  }

  let length = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const kept = [];

  for (let i = 0; i < samples.length; i += 1) {
    const a = samples[i];
    const b = samples[(i + 1) % samples.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const seg = Math.hypot(dx, dz);
    if (seg < 1e-3) continue;
    a.s = length;
    a.seg = seg;
    a.tx = dx / seg;
    a.tz = dz / seg;
    a.nx = -a.tz;
    a.nz = a.tx;
    kept.push(a);
    length += seg;
    minX = Math.min(minX, a.x);
    maxX = Math.max(maxX, a.x);
    minZ = Math.min(minZ, a.z);
    maxZ = Math.max(maxZ, a.z);
  }

  for (const sample of kept) sample.t = length > 0 ? sample.s / length : 0;

  return {
    samples: kept,
    length,
    width,
    half: width / 2,
    runoff,
    limit: width / 2 + runoff,
    minX,
    maxX,
    minZ,
    maxZ,
  };
}

export function pointAt(track, t) {
  const u = wrap01(t);
  const samples = track.samples;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (samples[mid].t <= u) lo = mid;
    else hi = mid - 1;
  }
  const a = samples[lo];
  const b = samples[(lo + 1) % samples.length];
  const span = b.t > a.t ? b.t - a.t : 1 - a.t + b.t;
  let local = 0;
  if (span > 1e-8) {
    const along = u >= a.t ? u - a.t : u + 1 - a.t;
    local = Math.min(1, Math.max(0, along / span));
  }
  const heading = Math.atan2(a.tx, a.tz);
  return {
    x: a.x + (b.x - a.x) * local,
    z: a.z + (b.z - a.z) * local,
    tx: a.tx,
    tz: a.tz,
    nx: a.nx,
    nz: a.nz,
    heading,
    t: u,
  };
}

export function placeOnTrack(track, t, lateral = 0) {
  const point = pointAt(track, t);
  return {
    x: point.x + point.nx * lateral,
    z: point.z + point.nz * lateral,
    heading: point.heading,
    t: point.t,
  };
}

export function project(track, x, z) {
  const samples = track.samples;
  let best = Infinity;
  let index = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const dx = x - samples[i].x;
    const dz = z - samples[i].z;
    const dist = dx * dx + dz * dz;
    if (dist < best) {
      best = dist;
      index = i;
    }
  }
  const count = samples.length;
  let chosen = closestOnSegment(track, index, x, z);
  const previous = closestOnSegment(track, (index - 1 + count) % count, x, z);
  const next = closestOnSegment(track, (index + 1) % count, x, z);
  if (previous.dist < chosen.dist) chosen = previous;
  if (next.dist < chosen.dist) chosen = next;
  return chosen;
}

export function arcGap(track, a, b) {
  const delta = Math.abs(a - b);
  return Math.min(delta, track.length - delta);
}

function closestOnSegment(track, index, x, z) {
  const samples = track.samples;
  const a = samples[index];
  const b = samples[(index + 1) % samples.length];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const seg2 = dx * dx + dz * dz;
  let u = seg2 > 1e-8 ? ((x - a.x) * dx + (z - a.z) * dz) / seg2 : 0;
  u = Math.min(1, Math.max(0, u));
  const px = a.x + dx * u;
  const pz = a.z + dz * u;
  const ox = x - px;
  const oz = z - pz;
  const t = wrap01((a.s + a.seg * u) / track.length);
  return {
    t,
    x: px,
    z: pz,
    nx: a.nx,
    nz: a.nz,
    tx: a.tx,
    tz: a.tz,
    heading: Math.atan2(a.tx, a.tz),
    lateral: ox * a.nx + oz * a.nz,
    dist: Math.hypot(ox, oz),
  };
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * ((2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function wrap01(t) {
  return ((t % 1) + 1) % 1;
}

function round(value) {
  return Math.round(value * 10) / 10;
}
