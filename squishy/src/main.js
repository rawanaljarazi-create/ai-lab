import { MATERIALS } from "./materials.js";
import { centroidOf, createSquishy, stepSquishy, translateSquishy } from "./physics.js";
import { createEngine } from "./audio.js";
import { drawScope, drawWorld } from "./render.js";

const canvas = document.querySelector("#world");
const ctx = canvas.getContext("2d");
const scope = document.querySelector("#scope");
const scopeCtx = scope.getContext("2d");
const nameEl = document.querySelector("#name");
const blurbEl = document.querySelector("#blurb");
const stateEl = document.querySelector("#state");
const specsEl = document.querySelector("#specs");
const dock = document.querySelector("#dock");
const muteBtn = document.querySelector("#mute");
const scopeLabel = document.querySelector("#scope-label");
const flattenBtn = document.querySelector("#flatten");

const engine = createEngine();
const pointers = new Map();
const keys = new Set();
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

let index = 0;
let hold = false;
let awake = false;
let body = null;
let viewLayout = null;
let scripted = null;
let last = performance.now();

function layoutOf() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const narrow = w < 880;
  const panel = narrow ? 0 : 332;
  const reserve = narrow ? Math.min(h * 0.46, 300) : 24;
  const ground = narrow ? h - reserve - 6 : Math.min(h * 0.8, h - 24);
  const playW = Math.max(160, w - panel);
  let radius = Math.min(168, Math.max(68, Math.min(playW, h) * 0.155));
  const topClear = narrow ? 64 : 28;
  radius = Math.min(radius, Math.max(64, (ground - topClear) * 0.46));
  radius = Math.min(radius, playW * 0.3);
  return {
    w,
    h,
    narrow,
    panel,
    ground,
    radius,
    x: panel + playW * 0.5,
  };
}

function seat(next, rebuild) {
  if (!body || rebuild) {
    body = createSquishy(MATERIALS[index], next.x, next.ground, next.radius);
    return;
  }
  const c = centroidOf(body.pts);
  let maxY = -Infinity;
  for (const p of body.pts) if (p.y > maxY) maxY = p.y;
  translateSquishy(body, next.x - c.x, next.ground - maxY);
  body.homeX = next.x;
  if (Math.abs(next.radius - body.baseR) / body.baseR > 0.24) {
    body = createSquishy(MATERIALS[index], next.x, next.ground, next.radius);
  }
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const next = layoutOf();
  document.documentElement.style.setProperty("--panel", next.narrow ? "0px" : "332px");
  seat(next, !body);
  viewLayout = next;
  const sw = Math.max(1, scope.clientWidth);
  const sh = Math.max(1, scope.clientHeight);
  scope.width = Math.floor(sw * dpr);
  scope.height = Math.floor(sh * dpr);
  scopeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function paintSpecs(material) {
  specsEl.replaceChildren();
  for (const [label, value] of material.meters) {
    const row = document.createElement("div");
    row.className = "spec";
    const name = document.createElement("span");
    name.textContent = label;
    const bar = document.createElement("b");
    const fill = document.createElement("i");
    fill.style.setProperty("--v", String(value));
    bar.append(fill);
    row.append(name, bar);
    specsEl.append(row);
  }
}

function select(i) {
  index = (i + MATERIALS.length) % MATERIALS.length;
  const material = MATERIALS[index];
  const lay = viewLayout || layoutOf();
  body = createSquishy(material, lay.x, lay.ground, lay.radius);
  nameEl.textContent = material.name;
  blurbEl.textContent = material.blurb;
  document.documentElement.style.setProperty("--swatch", material.color);
  paintSpecs(material);
  const buttons = dock.querySelectorAll(".mat");
  buttons.forEach((btn, n) => {
    const on = n === index;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function buildDock() {
  dock.replaceChildren();
  MATERIALS.forEach((material) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mat";
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = `radial-gradient(circle at 35% 30%, ${material.gloss}, ${material.color} 58%, ${material.deep})`;
    swatch.style.borderRadius = material.shape === "cube" ? "5px" : "50%";
    const label = document.createElement("span");
    label.textContent = material.name;
    btn.append(swatch, label);
    btn.addEventListener("click", () => select(MATERIALS.indexOf(material)));
    dock.append(btn);
  });
}

function pointerXY(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function overUi(event) {
  const target = event.target;
  return target instanceof Element && !!target.closest("#plate, #scope-wrap, #flatten");
}

function fingersNow() {
  if (scripted?.fingers) return scripted.fingers;
  const firm = keys.has("Shift");
  const r = body.baseR * (firm ? 0.22 : 0.42);
  return [...pointers.values()].map((p) => ({ x: p.x, y: p.y, px: p.px, py: p.py, r }));
}

function pressureLabel(amount, popped) {
  if (popped) return "Popped";
  if (amount < 0.05) return "Relaxed";
  if (amount < 0.16) return "Yielding";
  if (amount < 0.38) return "Squishing";
  if (amount < 0.62) return "Deep squish";
  return "Flattened";
}

async function wake() {
  if (awake || engine.failed) return;
  const state = await engine.wake();
  awake = state === "running";
  scopeLabel.textContent = awake ? "Sound engine" : "Sound unavailable";
  if (!awake) muteBtn.disabled = true;
}

canvas.addEventListener("pointerdown", (event) => {
  if (overUi(event)) return;
  canvas.setPointerCapture(event.pointerId);
  const pos = pointerXY(event);
  pointers.set(event.pointerId, { x: pos.x, y: pos.y, px: pos.x, py: pos.y });
});

canvas.addEventListener("pointermove", (event) => {
  const pos = pointerXY(event);
  const cur = pointers.get(event.pointerId);
  if (cur) {
    cur.x = pos.x;
    cur.y = pos.y;
  }
});

window.addEventListener("pointermove", (event) => {
  const pos = pointerXY(event);
  const firm = keys.has("Shift");
  hoverState.x = pos.x;
  hoverState.y = pos.y;
  hoverState.firm = firm;
  hoverState.r = body ? body.baseR * (firm ? 0.22 : 0.42) : 48;
  hoverState.show = !overUi(event) && pointers.size === 0;
});

function endPointer(event) {
  pointers.delete(event.pointerId);
}

canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

const hoverState = { x: 0, y: 0, show: false, r: 40, firm: false };

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") event.preventDefault();
  if (event.repeat) return;
  keys.add(event.code);
  if (event.code === "ArrowRight") select(index + 1);
  if (event.code === "ArrowLeft") select(index - 1);
  if (event.code.startsWith("Digit")) {
    const n = event.code === "Digit0" ? 9 : Number(event.code.slice(5)) - 1;
    if (n >= 0 && n < MATERIALS.length) select(n);
  }
});

window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => {
  keys.clear();
  hold = false;
  flattenBtn.classList.remove("is-held");
});

flattenBtn.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  hold = true;
  flattenBtn.classList.add("is-held");
  flattenBtn.setPointerCapture(event.pointerId);
});
flattenBtn.addEventListener("pointerup", () => {
  hold = false;
  flattenBtn.classList.remove("is-held");
});
flattenBtn.addEventListener("pointercancel", () => {
  hold = false;
  flattenBtn.classList.remove("is-held");
});

muteBtn.addEventListener("click", () => {
  const next = !engine.muted;
  engine.setMuted(next);
  muteBtn.textContent = next ? "Muted" : "Sound on";
  muteBtn.setAttribute("aria-pressed", next ? "true" : "false");
});

document.addEventListener("pointerdown", () => {
  wake();
}, { capture: true });

window.addEventListener("resize", resize);

function frame(now) {
  const dt = Math.min(0.034, Math.max(0.008, (now - last) / 1000));
  last = now;
  const squeeze = scripted?.squeeze ?? (keys.has("Space") || hold);
  const tel = stepSquishy(
    body,
    {
      squeeze,
      fingers: fingersNow(),
      ground: viewLayout.ground,
      homeX: viewLayout.x,
      left: viewLayout.panel + 18,
      right: viewLayout.w - 18,
    },
    dt,
  );

  for (const finger of pointers.values()) {
    finger.px = finger.x;
    finger.py = finger.y;
  }
  if (scripted?.fingers) {
    for (const finger of scripted.fingers) {
      finger.px = finger.x;
      finger.py = finger.y;
    }
  }

  const sound = body.material.sound;
  engine.send({
    pressure: Math.max(0, tel.compression),
    rate: tel.rate,
    slip: tel.slip,
    contact: tel.contact,
    moving: tel.moving,
    comV: tel.comV,
    wet: sound.wet,
    air: sound.air,
    crunch: sound.crunch,
    elastic: sound.elastic,
    slosh: sound.slosh,
    squeak: sound.squeak,
    foam: sound.foam,
    pitch: sound.pitch,
    q: sound.q,
    cutoff: sound.cutoff,
    ring: sound.ring,
    density: sound.density ?? 0.8,
    drop: sound.drop ?? 0.6,
    noise: sound.noise ?? 0.7,
    excite: tel.excite,
    impacts: tel.impacts,
  });

  hoverState.firm = keys.has("Shift");
  hoverState.r = body.baseR * (hoverState.firm ? 0.22 : 0.42);
  drawWorld(ctx, {
    width: viewLayout.w,
    height: viewLayout.h,
    ground: viewLayout.ground,
    panel: viewLayout.panel,
    body,
    time: now / 1000,
    hover: pointers.size || scripted?.fingers?.length ? null : hoverState,
    firm: hoverState.firm,
    reduce,
    squeeze,
  });

  const samples = engine.timeDomain();
  drawScope(
    scopeCtx,
    scope.clientWidth || 240,
    scope.clientHeight || 64,
    samples,
    body.material.deep,
    awake && engine.ready,
    engine.muted,
  );

  const popped = body.rings.some((ring) => ring.age < 0.14);
  stateEl.textContent = pressureLabel(Math.max(0, tel.compression), popped);
  requestAnimationFrame(frame);
}

buildDock();
resize();
select(0);

window.__squish = {
  get body() {
    return body;
  },
  get index() {
    return index;
  },
  materials: MATERIALS,
  select,
  engine,
  layout: () => viewLayout,
  poke(x, y, r) {
    const prev = scripted?.fingers?.[0];
    scripted = {
      squeeze: scripted?.squeeze ?? false,
      fingers: [{
        x,
        y,
        px: prev ? prev.x : x,
        py: prev ? prev.y : y,
        r: r ?? body.baseR * 0.42,
      }],
    };
  },
  flatten(on) {
    scripted = {
      squeeze: !!on,
      fingers: scripted?.fingers ?? [],
    };
  },
  release() {
    scripted = null;
  },
  levels() {
    return engine.levels();
  },
};

requestAnimationFrame(frame);
