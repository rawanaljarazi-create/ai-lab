const TAU = Math.PI * 2;
const COUNT = 64;
const SUBSTEPS = 4;
const ITERS = 5;

// Recovery times are seconds. Zeta < 1 wobbles; zeta > 1 creeps back without bounce.
const RHEOLOGY = {
  needoh: { recover: 2.6, flow: 0.2, remember: 0.26, bite: 0.82, plate: 0.38, bulge: 2.4, zeta: 1.45 },
  nicecube: { recover: 2.8, flow: 0.16, remember: 0.24, bite: 0.76, plate: 0.42, bulge: 2.2, zeta: 1.4 },
  butter: { recover: 9, flow: 0.85, remember: 0.03, bite: 0.9, plate: 0.3, bulge: 0.65, zeta: 2.4 },
  crunchy: { recover: 0.48, flow: 0.04, remember: 0.5, bite: 0.64, plate: 0.5, bulge: 1.35, zeta: 0.9 },
  jelly: { recover: 0.33, flow: 0, remember: 0.15, bite: 0.72, plate: 0.56, bulge: 2.6, zeta: 0.15 },
  mochi: { recover: 1.45, flow: 0.22, remember: 0.2, bite: 0.74, plate: 0.44, bulge: 1.15, zeta: 1.1 },
  foam: { recover: 1.9, flow: 0.34, remember: 0.14, bite: 0.84, plate: 0.34, bulge: 0.28, zeta: 1.6 },
  water: { recover: 0.4, flow: 0, remember: 0.25, bite: 0.66, plate: 0.58, bulge: 3, zeta: 0.32 },
  cloud: { recover: 0.85, flow: 0.07, remember: 0.38, bite: 0.7, plate: 0.46, bulge: 0.5, zeta: 1.15 },
  boba: { recover: 0.55, flow: 0.05, remember: 0.32, bite: 0.6, plate: 0.5, bulge: 1.6, zeta: 0.72 },
};

function physOf(m) {
  const r = RHEOLOGY[m.id] || RHEOLOGY.needoh;
  return {
    edgeK: 0.18 + m.firmness * 0.22,
    recover: r.recover,
    flow: r.flow,
    remember: r.remember,
    pressure: r.bulge,
    damp: Math.min(0.16, 0.012 + r.zeta * 0.04),
    tack: m.tack,
    gravity: 0.008 + m.weight * 0.01 + r.flow * 0.05,
    bite: r.bite,
    plate: r.plate,
    zeta: r.zeta,
    friction: 0.16 + m.tack * 0.12,
  };
}

function shapePoint(shape, angle, radius) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  if (shape === "cube") {
    const n = 3.5;
    const m = (Math.abs(c) ** n + Math.abs(s) ** n) ** (-1 / n);
    return { x: c * m * radius, y: s * m * radius };
  }
  if (shape === "oval") return { x: c * radius * 0.94, y: s * radius * 1.06 };
  return { x: c * radius, y: s * radius };
}

export function centroidOf(pts) {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  const n = pts.length || 1;
  return { x: x / n, y: y / n };
}

function areaOf(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a * 0.5;
}

function pointInPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    const hit = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function closestEdge(pts, x, y, cx, cy) {
  let best = Infinity;
  let qx = x;
  let qy = y;
  let nx = 0;
  let ny = -1;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((x - p.x) * dx + (y - p.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = p.x + dx * t;
    const py = p.y + dy * t;
    const ddx = x - px;
    const ddy = y - py;
    const d = Math.hypot(ddx, ddy);
    if (d < best) {
      best = d;
      qx = px;
      qy = py;
      let enx = -dy;
      let eny = dx;
      const el = Math.hypot(enx, eny) || 1;
      enx /= el;
      eny /= el;
      if ((cx - px) * enx + (cy - py) * eny < 0) {
        enx = -enx;
        eny = -eny;
      }
      nx = enx;
      ny = eny;
    }
  }
  return { dist: best, x: qx, y: qy, nx, ny };
}

function radiusAlong(pts, cx, cy, ang, fallback) {
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-8) continue;
    const t = ((a.x - cx) * ey - (a.y - cy) * ex) / den;
    const u = ((a.x - cx) * dy - (a.y - cy) * dx) / den;
    if (t > 1 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best < Infinity ? best : fallback;
}

function clampFinger(body, finger) {
  const c = centroidOf(body.pts);
  let dx = finger.x - c.x;
  let dy = finger.y - c.y;
  let d = Math.hypot(dx, dy);
  if (d < 1) {
    dx = 0;
    dy = -1;
    d = 1;
  }
  const ang = Math.atan2(dy, dx);
  const br = radiusAlong(body.pts, c.x, c.y, ang, body.baseR);
  // Keep the thumb outside the skin, overlapping it by `bite` of its radius,
  // so the surface is pushed inward instead of ballooning out.
  const pen = Math.min(0.86, Math.max(0.35, body.phys.bite));
  const bounded = Math.min(br, body.baseR * 1.45);
  const desired = bounded + finger.r * (1 - pen);
  if (d < desired) {
    const s = desired / d;
    return { x: c.x + dx * s, y: c.y + dy * s, r: finger.r, px: finger.px, py: finger.py };
  }
  return finger;
}

function stabilizeFinger(body, finger, index) {
  const placed = clampFinger(body, finger);
  if (!body.fingerStable) body.fingerStable = [];
  const prev = body.fingerStable[index];
  let x = placed.x;
  let y = placed.y;
  if (prev) {
    const dx = x - prev.x;
    const dy = y - prev.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 32) {
      x = prev.x + (dx / dist) * 32;
      y = prev.y + (dy / dist) * 32;
    }
  }
  body.fingerStable[index] = { x, y };
  return { x, y, px: finger.px, py: finger.py, r: finger.r, stable: true };
}

function clampRadii(body) {
  const c = centroidOf(body.pts);
  const maxR = body.baseR * 1.72;
  const minR = body.baseR * 0.2;
  for (const p of body.pts) {
    let dx = p.x - c.x;
    let dy = p.y - c.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    if (dist > maxR) {
      p.x = c.x + (dx / dist) * maxR;
      p.y = c.y + (dy / dist) * maxR;
    } else if (dist < minR) {
      p.x = c.x + (dx / dist) * minR;
      p.y = c.y + (dy / dist) * minR;
    }
  }
}

function pushImpact(list, impact) {
  if (list.length < 18) {
    list.push(impact);
    return;
  }
  let min = 0;
  for (let i = 1; i < list.length; i++) if (list[i].g < list[min].g) min = i;
  if (impact.g > list[min].g) list[min] = impact;
}

function modeEnergies(pts, c) {
  const out = [0, 0, 0, 0];
  const n = pts.length;
  for (let k = 0; k < 4; k++) {
    const harm = k + 2;
    let re = 0;
    let im = 0;
    for (const p of pts) {
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const ang = Math.atan2(dy, dx);
      const rad = Math.hypot(dx, dy);
      const rest = Math.hypot(p.rx, p.ry);
      const dev = rad - rest;
      re += dev * Math.cos(harm * ang);
      im += dev * Math.sin(harm * ang);
    }
    out[k] = Math.hypot(re, im) / n;
  }
  return out;
}

export function createSquishy(material, x, ground, radius) {
  const raw = [];
  let maxY = -Infinity;
  for (let i = 0; i < COUNT; i++) {
    const o = shapePoint(material.shape, (i / COUNT) * TAU - Math.PI / 2, radius);
    raw.push(o);
    if (o.y > maxY) maxY = o.y;
  }
  const cy = ground - maxY;
  const pts = raw.map((o) => ({
    x: x + o.x * 1.045,
    y: cy + o.y * 1.045,
    px: x + o.x * 1.08,
    py: cy + o.y * 1.08,
    rx: o.x,
    ry: o.y,
    ox: o.x,
    oy: o.y,
  }));

  const restLen = new Float64Array(COUNT);
  const span = new Float64Array(COUNT);
  const bendRest = new Float64Array(COUNT);
  const bendSpan = new Float64Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    const p = raw[i];
    const q = raw[(i + 1) % COUNT];
    const b = raw[(i + 2) % COUNT];
    restLen[i] = Math.hypot(q.x - p.x, q.y - p.y);
    span[i] = restLen[i];
    bendRest[i] = Math.hypot(b.x - p.x, b.y - p.y);
    bendSpan[i] = bendRest[i];
  }

  let origArea = 0;
  for (let i = 0; i < COUNT; i++) {
    const p = raw[i];
    const q = raw[(i + 1) % COUNT];
    origArea += p.x * q.y - q.x * p.y;
  }
  origArea = Math.abs(origArea * 0.5);
  let restMin = Infinity;
  let restMax = -Infinity;
  for (const o of raw) {
    if (o.y < restMin) restMin = o.y;
    if (o.y > restMax) restMax = o.y;
  }
  const restH = Math.max(1, restMax - restMin);

  const beads = [];
  const fill = material.fill;
  if (fill) {
    for (let i = 0; i < fill.count; i++) {
      const ang = Math.random() * TAU;
      const rad = Math.sqrt(Math.random()) * radius * 0.62;
      const rf = fill.radius * (0.82 + Math.random() * 0.36);
      beads.push({
        x: x + Math.cos(ang) * rad,
        y: cy + Math.sin(ang) * rad * 0.8,
        px: x + Math.cos(ang) * rad,
        py: cy + Math.sin(ang) * rad * 0.8,
        rf,
        cr: rf * radius,
        color: fill.colors[i % fill.colors.length],
        alive: true,
        grow: 1,
        flash: 0,
        latched: false,
        wallDist: radius,
        prevSpace: null,
        respawn: 0,
      });
    }
  }

  const speckles = [];
  for (let i = 0; i < material.speckles; i++) {
    speckles.push({
      ang: Math.random() * TAU,
      rf: 0.15 + Math.random() * 0.7,
      size: 1.2 + Math.random() * 2.4,
      alpha: 0.08 + Math.random() * 0.16,
    });
  }

  return {
    material,
    phys: physOf(material),
    pts,
    restLen,
    span,
    bendRest,
    bendSpan,
    origArea,
    restArea: origArea,
    restH,
    baseR: radius,
    homeX: x,
    beads,
    speckles,
    rings: [],
    splats: [],
    plateY: -400,
    touch: [],
    lastArea: Math.abs(areaOf(pts)) || origArea,
    prevCompression: 0,
    prevSquish: 0,
    prevModes: [0, 0, 0, 0],
    prevCx: x,
    prevCy: cy,
    wasContact: false,
    popLatch: false,
    pocketLatch: false,
  };
}

function fillMode(kind) {
  if (kind === "beads") return { sep: 0.55, crunch: true };
  if (kind === "pearls") return { sep: 0.5, crunch: true, pop: true };
  if (kind === "liquid") return { sep: 0.22, bloop: true };
  if (kind === "lumps") return { sep: 0.1, pocket: true };
  if (kind === "cells") return { sep: 0.06, air: true };
  return { sep: 0.12 };
}

function popPearl(body, bead, impacts) {
  if (!bead.alive) return;
  bead.alive = false;
  bead.respawn = 1.15;
  bead.flash = 0;
  body.rings.push({ x: bead.x, y: bead.y, age: 0, color: bead.color });
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * TAU;
    const s = 0.8 + Math.random() * 2.2;
    body.splats.push({
      x: bead.x,
      y: bead.y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 1.2,
      age: 0,
      color: bead.color,
    });
  }
  pushImpact(impacts, {
    g: 0.55 + Math.random() * 0.45,
    f: 420 + Math.random() * 520,
    kind: 2,
    pan: Math.random() * 1.4 - 0.7,
  });
}

function containBead(bead, pts, cx, cy) {
  const info = closestEdge(pts, bead.x, bead.y, cx, cy);
  const inside = pointInPoly(pts, bead.x, bead.y);
  const signed = inside ? info.dist : -info.dist;
  bead.wallDist = signed;
  const need = bead.cr + 1.4;
  if (signed < need) {
    const push = need - signed;
    bead.x += info.nx * push;
    bead.y += info.ny * push;
  }
  return signed;
}

export function translateSquishy(body, dx, dy) {
  if (!dx && !dy) return;
  for (const p of body.pts) {
    p.x += dx;
    p.y += dy;
    p.px += dx;
    p.py += dy;
  }
  for (const b of body.beads) {
    b.x += dx;
    b.y += dy;
    b.px += dx;
    b.py += dy;
  }
  body.prevCx += dx;
  body.prevCy += dy;
  body.homeX += dx;
}

function integratePoint(p, damp, gravity) {
  let vx = (p.x - p.px) * (1 - damp);
  let vy = (p.y - p.py) * (1 - damp) + gravity;
  const sp = Math.hypot(vx, vy);
  if (sp > 16) {
    vx = (vx / sp) * 16;
    vy = (vy / sp) * 16;
  }
  p.px = p.x;
  p.py = p.y;
  p.x += vx;
  p.y += vy;
}

function solveEdges(body) {
  const { pts, span, bendSpan, phys } = body;
  const n = pts.length;
  const k = phys.edgeK;
  const bk = k * 0.35;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    let dx = q.x - p.x;
    let dy = q.y - p.y;
    let dist = Math.hypot(dx, dy) || 0.0001;
    const diff = ((dist - span[i]) / dist) * k * 0.5;
    dx *= diff;
    dy *= diff;
    p.x += dx;
    p.y += dy;
    q.x -= dx;
    q.y -= dy;
  }
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 2) % n];
    let dx = q.x - p.x;
    let dy = q.y - p.y;
    let dist = Math.hypot(dx, dy) || 0.0001;
    const diff = ((dist - bendSpan[i]) / dist) * bk * 0.5;
    dx *= diff;
    dy *= diff;
    p.x += dx;
    p.y += dy;
    q.x -= dx;
    q.y -= dy;
  }
}

function solvePressure(body) {
  const { pts, phys } = body;
  const n = pts.length;
  const area = Math.abs(areaOf(pts));
  const strain = (body.restArea - area) / (body.restArea || 1);
  if (Math.abs(strain) < 0.0008) return;
  const c = centroidOf(pts);
  const push = strain * phys.pressure;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += body.span[i];
  mean = mean / n || 1;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    const mx = (p.x + q.x) * 0.5 - c.x;
    const my = (p.y + q.y) * 0.5 - c.y;
    if (nx * mx + ny * my < 0) {
      nx = -nx;
      ny = -ny;
    }
    const s = push * (len / mean) * 0.5;
    p.x += nx * s;
    p.y += ny * s;
    q.x += nx * s;
    q.y += ny * s;
  }
}

function touching(fingers, body, input, p) {
  for (let i = 0; i < fingers.length; i++) {
    const f = fingers[i];
    if (Math.hypot(p.x - f.x, p.y - f.y) < f.r * 1.2) return true;
  }
  return input.squeeze && body.plateY > 0 && p.y < body.plateY + 16;
}

function pinWeight(body, ground) {
  const n = body.pts.length || 1;
  let maxY = -Infinity;
  let vy = 0;
  for (const p of body.pts) {
    if (p.y > maxY) maxY = p.y;
    vy += p.y - p.py;
  }
  if (ground - maxY > 8) return;
  vy /= n;
  if (vy < 0) {
    for (const p of body.pts) p.py += vy;
  }
}

function restoreShape(body, dt) {
  const phys = body.phys;
  const c = centroidOf(body.pts);
  const zeta = phys.zeta;
  const wobble = zeta < 0.85;
  const n = body.pts.length || 1;
  let sumX = 0;
  let sumY = 0;
  const step = [];
  for (const p of body.pts) {
    const ex = c.x + p.rx - p.x;
    const ey = c.y + p.ry - p.y;
    const err = Math.hypot(ex, ey);
    const tau = err < body.baseR * 0.08 ? Math.min(phys.recover, 0.45) : phys.recover;
    const k = 1 - Math.exp(-dt / Math.max(0.08, tau));
    const dx = ex * k;
    const dy = ey * k;
    step.push(dx, dy);
    sumX += dx;
    sumY += dy;
  }
  const mx = sumX / n;
  const my = sumY / n;
  for (let i = 0; i < n; i++) {
    const p = body.pts[i];
    const dx = step[i * 2] - mx;
    const dy = step[i * 2 + 1] - my;
    p.x += dx;
    p.y += dy;
    if (wobble) {
      const boost = (1.15 - zeta) * 1.15;
      p.px -= dx * boost;
      p.py -= dy * boost;
    } else {
      p.px += (p.x - p.px) * 0.55;
      p.py += (p.y - p.py) * 0.55;
    }
  }
}

function collideFinger(body, finger, impacts, mode, emit) {
  const f = finger.stable ? finger : clampFinger(body, finger);
  let hit = 0;
  let slip = 0;
  const fvx = f.x - (f.px ?? f.x);
  const fvy = f.y - (f.py ?? f.y);
  const mid = centroidOf(body.pts);
  let ix = mid.x - f.x;
  let iy = mid.y - f.y;
  const il = Math.hypot(ix, iy) || 1;
  ix /= il;
  iy /= il;
  for (const p of body.pts) {
    let dx = p.x - f.x;
    let dy = p.y - f.y;
    let d = Math.hypot(dx, dy);
    if (d < 0.001) {
      dx = ix;
      dy = iy;
      d = 1;
    }
    if (d < f.r) {
      let nx = dx / d;
      let ny = dy / d;
      // Keep the skin on the inner side of the thumb so it dents instead of spiking.
      if (nx * ix + ny * iy < 0.25) {
        const tx = nx - (nx * ix + ny * iy) * ix;
        const ty = ny - (nx * ix + ny * iy) * iy;
        const tl = Math.hypot(tx, ty);
        nx = ix * 0.72 + (tl > 0.001 ? (tx / tl) * 0.28 : 0);
        ny = iy * 0.72 + (tl > 0.001 ? (ty / tl) * 0.28 : 0);
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl;
        ny /= nl;
      }
      p.x = f.x + nx * f.r;
      p.y = f.y + ny * f.r;
      const tx = -ny;
      const ty = nx;
      const fingerT = fvx * tx + fvy * ty;
      const pvx = p.x - p.px;
      const pvy = p.y - p.py;
      const partT = pvx * tx + pvy * ty;
      slip += Math.abs(fingerT - partT);
      if (body.phys.tack > 0.02) {
        const stick = body.phys.tack * 0.65;
        const pN = pvx * nx + pvy * ny;
        const newT = partT * (1 - stick) + fingerT * stick;
        p.px = p.x - (nx * pN + tx * newT);
        p.py = p.y - (ny * pN + ty * newT);
      }
      hit++;
    }
  }

  if (body.beads.length && hit) {
    for (const bead of body.beads) {
      if (!bead.alive) continue;
      let dx = bead.x - f.x;
      let dy = bead.y - f.y;
      let d = Math.hypot(dx, dy) || 0.001;
      const min = f.r + bead.cr * 0.92;
      if (d < min) {
        const overlap = min - d;
        const nx = dx / d;
        const ny = dy / d;
        const avx = bead.x - bead.px;
        const avy = bead.y - bead.py;
        bead.x += nx * overlap;
        bead.y += ny * overlap;
        const approaching = -(avx * nx + avy * ny);
        if (emit && mode.crunch && approaching > 0.4) {
          bead.flash = 1;
          pushImpact(impacts, {
            g: Math.min(1, (approaching - 0.4) / 3.2),
            f: 1700 + Math.random() * 4600,
            kind: 1,
            pan: Math.random() * 2 - 1,
          });
        }
        if (mode.pop && overlap > bead.cr * 0.85) popPearl(body, bead, impacts);
        if (emit && mode.pocket && overlap > bead.cr * 0.45 && !bead.latched) {
          bead.latched = true;
          bead.flash = 1;
          pushImpact(impacts, {
            g: 0.45 + Math.random() * 0.4,
            f: 680 + Math.random() * 500,
            kind: 3,
            pan: Math.random() * 0.6 - 0.3,
          });
        }
      } else if (mode.pocket && bead.latched) {
        const gap = d - min;
        if (gap > bead.cr * 0.3) bead.latched = false;
      }
    }
  }

  body.touch.push({ x: f.x, y: f.y, r: f.r, hit });
  return { hit, slip, speed: Math.hypot(fvx, fvy) };
}

function collideBounds(body, input) {
  const ground = input.ground;
  const left = input.left ?? 24;
  const right = input.right ?? 2000;
  const friction = body.phys.friction;
  for (const p of body.pts) {
    if (p.y > ground) {
      p.y = ground;
      const vx = p.x - p.px;
      p.py = p.y;
      p.px = p.x - vx * (1 - friction);
    }
    if (body.plateY > 0 && p.y < body.plateY) {
      p.y = body.plateY;
      p.py = p.y;
    }
    if (p.x < left) {
      p.x = left;
      p.px = p.x;
    } else if (p.x > right) {
      p.x = right;
      p.px = p.x;
    }
  }
}

function collideBeads(body, impacts, mode) {
  const beads = body.beads;
  const hard = mode.crunch || mode.pop;
  for (let i = 0; i < beads.length; i++) {
    const a = beads[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < beads.length; j++) {
      const b = beads[j];
      if (!b.alive) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      const min = (a.cr + b.cr) * (hard ? 1 : 0.92);
      if (d >= min) continue;
      if (d < 0.001) {
        dx = 1;
        dy = 0;
        d = 1;
      }
      const nx = dx / d;
      const ny = dy / d;
      const avx = a.x - a.px;
      const avy = a.y - a.py;
      const bvx = b.x - b.px;
      const bvy = b.y - b.py;
      const rel = (avx - bvx) * nx + (avy - bvy) * ny;
      const overlap = min - d;
      const sep = mode.sep;
      a.x -= nx * overlap * sep;
      a.y -= ny * overlap * sep;
      b.x += nx * overlap * sep;
      b.y += ny * overlap * sep;
      if (mode.crunch && rel > 0.22) {
        const g = Math.min(1, (rel - 0.5) / 3.4);
        a.flash = Math.max(a.flash, g);
        b.flash = Math.max(b.flash, g);
        pushImpact(impacts, {
          g,
          f: 1500 + Math.random() * 4800 + rel * 220,
          kind: 1,
          pan: Math.random() * 2 - 1,
        });
      }
    }
  }
}

function rescue(body) {
  const c = centroidOf(body.pts);
  for (const p of body.pts) {
    p.x = c.x + p.rx;
    p.y = c.y + p.ry;
    p.px = p.x;
    p.py = p.y;
  }
}

export function stepSquishy(body, input, dt) {
  const impacts = [];
  const phys = body.phys;
  const kind = body.material.fill?.kind ?? "none";
  const mode = fillMode(kind);
  body.touch = [];

  const fingers = input.fingers ?? [];
  let hitTotal = 0;
  let slipTotal = 0;
  let moveTotal = 0;
  const posedFingers = fingers.map((finger, index) => stabilizeFinger(body, finger, index));
  if (!fingers.length) body.fingerStable = [];

  for (let s = 0; s < SUBSTEPS; s++) {
    const target = input.squeeze ? input.ground - body.baseR * phys.plate * 2 : -360;
    body.plateY += (target - body.plateY) * 0.25;
    if (input.squeeze) {
      const limit = input.ground - 30;
      if (body.plateY > limit) body.plateY = limit;
    }

    for (const p of body.pts) integratePoint(p, phys.damp, phys.gravity);
    for (const b of body.beads) {
      if (!b.alive) continue;
      integratePoint(b, 0.18, phys.gravity * 1.35);
      b.cr = b.rf * body.baseR * b.grow;
    }

    for (let k = 0; k < ITERS; k++) {
      solveEdges(body);
      solvePressure(body);
      collideBounds(body, input);
      const emit = s === SUBSTEPS - 1 && k === ITERS - 1;
      if (emit) body.touch = [];
      for (const finger of posedFingers) {
        const res = collideFinger(body, finger, impacts, mode, emit);
        if (emit) {
          hitTotal += res.hit;
          slipTotal += res.slip;
          moveTotal = Math.max(moveTotal, res.speed);
        }
      }
      if (!emit) body.touch = [];
      collideBounds(body, input);
    }
    pinWeight(body, input.ground);
    clampRadii(body);

    const c = centroidOf(body.pts);
    for (const b of body.beads) {
      if (!b.alive) continue;
      const signed = containBead(b, body.pts, c.x, c.y);
      if (s === SUBSTEPS - 1 && mode.pop && signed < -b.cr * 0.25) popPearl(body, b, impacts);
      if (mode.bloop && signed < b.cr * 0.15) {
        const sp = Math.hypot(b.x - b.px, b.y - b.py);
        if (sp > 1.3 && !b.latched) {
          b.latched = true;
          pushImpact(impacts, {
            g: Math.min(0.7, sp / 6),
            f: 160 + Math.random() * 140,
            kind: 2,
            pan: Math.random() * 0.8 - 0.4,
          });
        }
      } else if (mode.bloop && signed > b.cr * 0.8) {
        b.latched = false;
      }
      if (body.plateY > 0 && b.y < body.plateY + b.cr) {
        b.y = body.plateY + b.cr;
        b.py = b.y;
      }
    }
    if (body.beads.length) collideBeads(body, impacts, mode);

    const area = Math.abs(areaOf(body.pts));
    let far = false;
    const cc = centroidOf(body.pts);
    for (const p of body.pts) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) far = true;
      if (Math.hypot(p.x - cc.x, p.y - cc.y) > body.baseR * 2.6) far = true;
    }
    if (far || area < body.origArea * 0.12) rescue(body);
  }

  // While a thumb is in it, the skin accepts the new shape so the
  // edge springs stop fighting the dent. After release, everything
  // creeps back on the material's own timescale.
  const area = Math.abs(areaOf(body.pts));
  const held = hitTotal > 0 || input.squeeze;
  const nPts = body.pts.length;
  const adapt = held ? 1 - Math.exp(-6 * dt) : 0;
  const flow = held ? 1 - Math.exp(-phys.flow * dt) : 0;
  const back = 1 - Math.exp(-dt / Math.max(0.2, phys.recover));
  const memory = 1 - Math.exp(-phys.remember * dt);
  const cFlow = centroidOf(body.pts);
  for (let i = 0; i < nPts; i++) {
    const p = body.pts[i];
    const q = body.pts[(i + 1) % nPts];
    const b = body.pts[(i + 2) % nPts];
    const d1 = Math.hypot(q.x - p.x, q.y - p.y);
    const d2 = Math.hypot(b.x - p.x, b.y - p.y);
    const crease = held && (touching(posedFingers, body, input, p) || touching(posedFingers, body, input, q));
    const spread = held ? 1 - Math.exp(-phys.flow * 2.5 * dt) : 0;
    const spanK = Math.max(crease ? adapt : 0, spread);
    if (spanK) {
      body.span[i] += (d1 - body.span[i]) * spanK;
      body.bendSpan[i] += (d2 - body.bendSpan[i]) * spanK;
      if (flow) {
        p.rx += (p.x - cFlow.x - p.rx) * flow;
        p.ry += (p.y - cFlow.y - p.ry) * flow;
      }
    }
    body.span[i] += (body.restLen[i] - body.span[i]) * back;
    body.bendSpan[i] += (body.bendRest[i] - body.bendSpan[i]) * back;
    p.rx += (p.ox - p.rx) * memory;
    p.ry += (p.oy - p.ry) * memory;
  }
  if (adapt && phys.flow > 0.2) body.restArea += (area - body.restArea) * flow;
  body.restArea += (body.origArea - body.restArea) * back * 0.35;

  restoreShape(body, dt);
  pinWeight(body, input.ground);

  const c = centroidOf(body.pts);
  const pull = (input.homeX - c.x) * 0.035;
  if (pull) {
    for (const p of body.pts) p.x += pull;
    for (const b of body.beads) b.x += pull;
  }

  for (const b of body.beads) {
    if (!b.alive) {
      b.respawn -= dt;
      if (b.respawn <= 0) {
        b.alive = true;
        b.grow = 0.15;
        const ang = Math.random() * TAU;
        const rad = body.baseR * 0.15;
        b.x = c.x + Math.cos(ang) * rad;
        b.y = c.y + Math.sin(ang) * rad;
        b.px = b.x;
        b.py = b.y;
        b.cr = b.rf * body.baseR * b.grow;
      }
    } else {
      b.grow = Math.min(1, b.grow + dt * 0.85);
      b.cr = b.rf * body.baseR * b.grow;
      b.flash = Math.max(0, b.flash - dt * 2.4);
    }
    if (mode.air && b.alive) {
      if (b.prevSpace != null) {
        const shrink = b.prevSpace - b.wallDist;
        if (shrink > 2.2) {
          pushImpact(impacts, {
            g: Math.min(0.8, shrink / 10),
            f: 280 + Math.random() * 520,
            kind: 5,
            pan: Math.random() * 0.5 - 0.25,
          });
        }
      }
      b.prevSpace = b.wallDist;
    }
  }

  for (let i = body.rings.length - 1; i >= 0; i--) {
    body.rings[i].age += dt;
    if (body.rings[i].age > 0.42) body.rings.splice(i, 1);
  }
  for (let i = body.splats.length - 1; i >= 0; i--) {
    const spt = body.splats[i];
    spt.vy += 0.28;
    spt.x += spt.vx;
    spt.y += spt.vy;
    spt.age += dt;
    if (spt.age > 0.38) body.splats.splice(i, 1);
  }
  if (body.rings.length > 16) body.rings.splice(0, body.rings.length - 16);
  if (body.splats.length > 40) body.splats.splice(0, body.splats.length - 40);

  let dev = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of body.pts) {
    const rad = Math.hypot(p.x - c.x, p.y - c.y);
    const rest = Math.hypot(p.ox, p.oy) || 1;
    dev += Math.abs(rad - rest) / rest;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
  }
  dev /= body.pts.length;
  const flat = Math.max(0, Math.min(1, 1 - (maxY - minY) / body.restH));
  const compression = Math.max(0, Math.min(1, Math.max(flat, dev * 1.7)));
  let rate = (compression - body.prevSquish) / Math.max(0.008, dt);
  body.prevSquish = compression;
  body.prevCompression = compression;
  if (Math.abs(rate) < 0.04) rate = 0;
  if (body.idleSquish == null) body.idleSquish = compression;
  const idleTau = body.touchedOnce ? 12 : 0.35;
  if (!held) body.idleSquish += (compression - body.idleSquish) * (1 - Math.exp(-dt / idleTau));
  if (held) body.touchedOnce = true;
  const live = Math.max(0, Math.min(1, compression - body.idleSquish * 0.92));

  const contact = Math.max(0, Math.min(1, hitTotal / 8));
  const slip = Math.max(0, Math.min(1, slipTotal / Math.max(1, hitTotal) / 10));
  const moving = Math.max(0, Math.min(1, moveTotal / 14));
  const comV = Math.max(0, Math.min(1, Math.abs(c.x - body.prevCx) / Math.max(0.008, dt) / 900));
  body.prevCx = c.x;
  body.prevCy = c.y;

  const modes = modeEnergies(body.pts, c);
  const excite = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const d = modes[i] - body.prevModes[i];
    excite[i] = d > 0.45 ? d : 0;
    body.prevModes[i] = modes[i];
  }

  const pressing = contact > 0.2 || (input.squeeze && live > 0.08);
  if (pressing && !body.wasContact) {
    pushImpact(impacts, {
      g: Math.max(0.28, Math.min(1, Math.abs(rate) / 3 + contact * 0.4)),
      f: 70,
      kind: 4,
      pan: 0,
    });
  }
  body.wasContact = pressing;

  if (body.material.sound.wet > 0.5 && rate > 1.15 && !body.pocketLatch) {
    body.pocketLatch = true;
    pushImpact(impacts, {
      g: Math.min(1, rate / 3.5),
      f: 520 + Math.random() * 380,
      kind: 3,
      pan: Math.random() * 0.4 - 0.2,
    });
  }
  if (rate < 0.35) body.pocketLatch = false;

  body.lastArea = area;
  return { compression: live, rate, slip, contact, moving, comV, excite, impacts, area };
}
