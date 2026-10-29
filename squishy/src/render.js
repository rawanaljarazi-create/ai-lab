const TAU = Math.PI * 2;

let grainCanvas = null;
let grainPat = null;

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function mix(hex, toward, t) {
  const n = parseInt(hex.slice(1), 16);
  const m = parseInt(toward.slice(1), 16);
  const ch = (shift) => Math.round(((n >> shift) & 255) * (1 - t) + ((m >> shift) & 255) * t);
  const r = ch(16);
  const g = ch(8);
  const b = ch(0);
  return `#${(1 << 24 | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function grainPattern(ctx) {
  if (!grainCanvas) {
    grainCanvas = document.createElement("canvas");
    grainCanvas.width = 128;
    grainCanvas.height = 128;
    const g = grainCanvas.getContext("2d");
    const img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 90 + Math.random() * 165;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  if (!grainPat) grainPat = ctx.createPattern(grainCanvas, "repeat");
  return grainPat;
}

function trace(ctx, pts) {
  const n = pts.length;
  const a = pts[n - 1];
  const b = pts[0];
  ctx.beginPath();
  ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
  }
  ctx.closePath();
}

function centroid(pts) {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

function drawBead(ctx, bead, kind) {
  if (!bead.alive || bead.cr < 0.6) return;
  const r = bead.cr;
  ctx.beginPath();
  ctx.arc(bead.x, bead.y, r, 0, TAU);
  if (kind === "cells") {
    ctx.fillStyle = rgba(bead.color, 0.55);
    ctx.fill();
    return;
  }
  if (kind === "lumps") {
    const g = ctx.createRadialGradient(bead.x, bead.y, r * 0.2, bead.x, bead.y, r);
    g.addColorStop(0, rgba(bead.color, 0.42));
    g.addColorStop(1, rgba(bead.color, 0));
    ctx.fillStyle = g;
    ctx.fill();
    return;
  }
  const g = ctx.createRadialGradient(bead.x - r * 0.32, bead.y - r * 0.38, r * 0.08, bead.x, bead.y, r);
  if (kind === "liquid" || kind === "bits") {
    g.addColorStop(0, "rgba(255,255,255,0.75)");
    g.addColorStop(0.45, rgba(bead.color, 0.55));
    g.addColorStop(1, rgba(bead.color, 0.05));
  } else {
    g.addColorStop(0, mix(bead.color, "#ffffff", 0.72));
    g.addColorStop(0.42, bead.color);
    g.addColorStop(1, mix(bead.color, "#1a1020", 0.28));
  }
  ctx.fillStyle = g;
  ctx.fill();
  if (bead.flash > 0.04) {
    ctx.fillStyle = `rgba(255,255,255,${bead.flash * 0.65})`;
    ctx.beginPath();
    ctx.arc(bead.x, bead.y, r * 0.55, 0, TAU);
    ctx.fill();
  }
}

function drawFinger(ctx, finger, firm) {
  const r = finger.r;
  ctx.beginPath();
  ctx.arc(finger.x, finger.y, r, 0, TAU);
  const g = ctx.createRadialGradient(finger.x - r * 0.3, finger.y - r * 0.35, r * 0.1, finger.x, finger.y, r);
  g.addColorStop(0, firm ? "rgba(255,236,214,0.55)" : "rgba(255,244,230,0.38)");
  g.addColorStop(0.7, "rgba(255,236,220,0.08)");
  g.addColorStop(1, "rgba(255,236,220,0)");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(finger.x, finger.y, r * 0.92, 0, TAU);
  ctx.strokeStyle = "rgba(90,62,40,0.28)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

export function drawWorld(ctx, view) {
  const { width: w, height: h, ground, body, time, hover, reduce, panel } = view;
  const mat = body.material;
  const pts = body.pts;
  const c = centroid(pts);
  const r = body.baseR;

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#f6f1e8");
  sky.addColorStop(0.55, "#e7dccb");
  sky.addColorStop(1, "#ddd1be");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const lamp = ctx.createRadialGradient(w * 0.62, h * 0.08, 20, w * 0.55, h * 0.2, Math.max(w, h) * 0.75);
  lamp.addColorStop(0, "rgba(255,252,245,0.95)");
  lamp.addColorStop(1, "rgba(255,252,245,0)");
  ctx.fillStyle = lamp;
  ctx.fillRect(0, 0, w, h);

  const table = ctx.createLinearGradient(0, ground - 8, 0, h);
  table.addColorStop(0, "#f3e6d2");
  table.addColorStop(0.025, "#e7d3b6");
  table.addColorStop(0.2, "#d2bc9e");
  table.addColorStop(1, "#c3ab8c");
  ctx.fillStyle = table;
  ctx.fillRect(0, ground, w, h - ground);
  ctx.fillStyle = "rgba(255,250,242,0.85)";
  ctx.fillRect(0, ground, w, 2);
  ctx.strokeStyle = "rgba(120, 86, 48, 0.045)";
  ctx.lineWidth = 1;
  for (let y = ground + 16; y < h; y += 13) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(w * 0.3, y + 1.5, w * 0.6, y - 1.2, w, y + 0.4);
    ctx.stroke();
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let near = 0;
  for (const p of pts) {
    if (p.y > ground - 22) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      near++;
    }
  }
  const span = near > 2 ? (maxX - minX) * 0.62 : r * 0.85;
  ctx.save();
  ctx.translate((minX + maxX) / 2 || c.x, ground + 2);
  ctx.scale(1, 0.22);
  const sg = ctx.createRadialGradient(0, 0, span * 0.15, 0, 0, span);
  sg.addColorStop(0, "rgba(86, 58, 32, 0.28)");
  sg.addColorStop(1, "rgba(86, 58, 32, 0)");
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(20, span), 0, TAU);
  ctx.fill();
  ctx.restore();

  const calm = !reduce && body.touch.every((t) => !t.hit) && !view.squeeze;
  const breathe = calm ? Math.sin(time * 1.45) * 0.012 : 0;

  ctx.save();
  if (breathe) {
    ctx.translate(c.x, c.y);
    ctx.scale(1 + breathe * 0.45, 1 + breathe);
    ctx.translate(-c.x, -c.y);
  }

  const gel = mat.finish === "gel" || mat.alpha < 0.9;
  const kind = mat.fill?.kind;

  if (gel && kind && kind !== "lumps") {
    ctx.save();
    trace(ctx, pts);
    ctx.clip();
    for (const bead of body.beads) drawBead(ctx, bead, kind);
    ctx.restore();
  }

  trace(ctx, pts);
  const skin = ctx.createRadialGradient(c.x - r * 0.28, c.y - r * 0.36, r * 0.12, c.x + r * 0.1, c.y + r * 0.2, r * 1.25);
  skin.addColorStop(0, mix(mat.color, mat.gloss, mat.finish === "plush" ? 0.35 : 0.55));
  skin.addColorStop(0.45, mat.color);
  skin.addColorStop(1, mat.deep);
  ctx.globalAlpha = mat.alpha;
  ctx.fillStyle = skin;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.save();
  trace(ctx, pts);
  ctx.clip();

  if (mat.core) {
    ctx.save();
    ctx.translate(c.x, c.y);
    const s = mat.coreScale || 0.55;
    ctx.scale(s, s * 0.94);
    ctx.translate(-c.x, -c.y);
    trace(ctx, pts);
    ctx.fillStyle = mat.core;
    ctx.globalAlpha = mat.finish === "gel" ? 0.28 : 0.92;
    ctx.fill();
    ctx.restore();
  }

  if (!gel && kind === "lumps") {
    for (const bead of body.beads) drawBead(ctx, bead, kind);
  }
  if (!gel && kind === "cells") {
    for (const bead of body.beads) drawBead(ctx, bead, kind);
  }

  if (body.speckles.length) {
    for (const spec of body.speckles) {
      let sx = 0;
      let sy = 0;
      let acc = 0;
      for (const p of pts) {
        const ang = Math.atan2(p.y - c.y, p.x - c.x);
        let d = Math.abs(ang - spec.ang);
        if (d > Math.PI) d = TAU - d;
        const w = Math.max(0, 1 - d * 2.2);
        sx += p.x * w;
        sy += p.y * w;
        acc += w;
      }
      if (!acc) continue;
      const px = c.x + ((sx / acc - c.x) * spec.rf);
      const py = c.y + ((sy / acc - c.y) * spec.rf);
      ctx.fillStyle = rgba(mat.deep, spec.alpha);
      ctx.beginPath();
      ctx.arc(px, py, spec.size, 0, TAU);
      ctx.fill();
    }
  }

  if (mat.grain > 0.01) {
    ctx.save();
    ctx.globalAlpha = mat.grain;
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = grainPattern(ctx);
    ctx.fillRect(c.x - r * 1.4, c.y - r * 1.4, r * 2.8, r * 2.8);
    ctx.restore();
  }

  const ao = ctx.createLinearGradient(0, ground - r * 0.45, 0, ground);
  ao.addColorStop(0, "rgba(70,40,20,0)");
  ao.addColorStop(1, "rgba(70,40,20,0.16)");
  ctx.fillStyle = ao;
  ctx.fillRect(c.x - r * 1.3, ground - r * 0.5, r * 2.6, r * 0.5);

  for (const touch of body.touch) {
    if (!touch.hit) continue;
    const dent = ctx.createRadialGradient(touch.x, touch.y, touch.r * 0.15, touch.x, touch.y, touch.r * 1.65);
    dent.addColorStop(0, rgba(mat.deep, 0.38));
    dent.addColorStop(1, rgba(mat.deep, 0));
    ctx.fillStyle = dent;
    ctx.beginPath();
    ctx.arc(touch.x, touch.y, touch.r * 1.65, 0, TAU);
    ctx.fill();
  }

  let hx = c.x - r * 0.3;
  let hy = c.y - r * 0.36;
  const press = body.touch.find((t) => t.hit);
  if (press) {
    hx += (c.x - press.x) * 0.12;
    hy += (c.y - press.y) * 0.12;
  }
  const glossA = mat.finish === "gloss" || mat.finish === "gel" ? 0.72 : 0.32;
  const glossR = mat.finish === "plush" || mat.finish === "matte" ? r * 0.62 : r * 0.34;
  const shine = ctx.createRadialGradient(hx, hy, 2, hx, hy, glossR);
  shine.addColorStop(0, `rgba(255,255,255,${glossA})`);
  shine.addColorStop(0.45, `rgba(255,255,255,${glossA * 0.28})`);
  shine.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.ellipse(hx, hy, glossR, glossR * 0.72, -0.5, 0, TAU);
  ctx.fill();

  ctx.restore();

  trace(ctx, pts);
  const rim = ctx.createLinearGradient(c.x - r, c.y - r, c.x + r, c.y + r);
  rim.addColorStop(0, rgba(mat.gloss, 0.95));
  rim.addColorStop(0.35, rgba(mat.color, 0.15));
  rim.addColorStop(1, rgba(mat.deep, 0.72));
  ctx.strokeStyle = rim;
  ctx.lineWidth = mat.finish === "gel" ? 2.25 : 2.75;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();

  for (const ring of body.rings) {
    const u = ring.age / 0.42;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, 6 + u * 46, 0, TAU);
    ctx.strokeStyle = rgba(ring.color, (1 - u) * 0.8);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  for (const splat of body.splats) {
    const u = splat.age / 0.38;
    ctx.fillStyle = rgba(splat.color, (1 - u) * 0.85);
    ctx.beginPath();
    ctx.ellipse(splat.x, splat.y, 3.2 * (1 - u * 0.4), 2.2, 0, 0, TAU);
    ctx.fill();
  }

  if (body.plateY > -30 && body.plateY < h) {
    const left = (panel || 0) + 36;
    const right = w - 36;
    const y = body.plateY;
    const barH = Math.max(80, y + 40);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(left, y - barH);
    ctx.lineTo(right, y - barH);
    ctx.lineTo(right, y - 18);
    ctx.quadraticCurveTo(right, y, right - 18, y);
    ctx.lineTo(left + 18, y);
    ctx.quadraticCurveTo(left, y, left, y - 18);
    ctx.closePath();
    const pg = ctx.createLinearGradient(0, y - 80, 0, y);
    pg.addColorStop(0, "#cbbba6");
    pg.addColorStop(1, "#efe4d4");
    ctx.fillStyle = pg;
    ctx.shadowColor = "rgba(80,50,20,0.15)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(255,250,244,0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  if (body.touch.length) {
    for (const touch of body.touch) drawFinger(ctx, touch, view.firm);
  } else if (hover?.show) {
    drawFinger(ctx, hover, hover.firm);
  }
}

export function drawScope(ctx, w, h, samples, color, awake, muted) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,250,244,0.35)";
  ctx.fillRect(0, 0, w, h);
  ctx.beginPath();
  ctx.moveTo(0, h * 0.72);
  ctx.lineTo(w, h * 0.72);
  ctx.strokeStyle = "rgba(70,52,36,0.08)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  const mid = h * 0.46;
  if (!samples || !awake) {
    ctx.moveTo(8, mid);
    ctx.lineTo(w - 8, mid);
    ctx.strokeStyle = "rgba(70,52,36,0.25)";
    ctx.setLineDash([3, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * w;
    const y = mid + (samples[i] - 128) * (muted ? 0.05 : 0.42);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = muted ? "rgba(70,52,36,0.35)" : color;
  ctx.lineWidth = 1.6;
  ctx.stroke();
}
