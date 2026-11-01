import "./style.css";
import {
  DEFAULT_GRAVITY,
  addBox,
  addCircle,
  addRegularPolygon,
  bodyAt,
  createWorld,
  grabBody,
  moveGrab,
  outlineOf,
  releaseBody,
  removeBody,
  seedTable,
  setGravity,
  setPaused,
  setStatic,
  step,
} from "./world.js";

const CAP = 50;
const COLORS = ["#ff5a36", "#ffb703", "#fff1a8", "#3ec1e0", "#c77dff", "#ff7096", "#f4a261", "#fff8ee"];
const POLYGONS = [3, 5, 6];

const canvas = document.querySelector("#table");
const ctx = canvas.getContext("2d");
const pauseBtn = document.querySelector("#pause");
const resetBtn = document.querySelector("#reset");
const pausedEl = document.querySelector("#paused");
const toggleBtn = document.querySelector("#toggle-body");
const staticInput = document.querySelector("#static-spawn");
const gravityInput = document.querySelector("#gravity");
const gravityRead = document.querySelector("#gravity-read");
const countEl = document.querySelector("#count");
const hintEl = document.querySelector("#hint");
const toolButtons = [...document.querySelectorAll("[data-tool]")];

const world = createWorld({ gravity: DEFAULT_GRAVITY });
const grabs = new Map();
const coarse = window.matchMedia("(pointer: coarse)").matches;

let tool = "circle";
let selected = null;
let serial = 0;
let specks = null;
let shownCount = -1;
let last = performance.now();

hintEl.textContent = coarse
  ? "Tap the felt to drop a shape. Drag to throw."
  : "Click the felt to drop a shape. Drag to throw. Right-click pins.";

paintTools();
paintPause();
paintGravity();
paintSelection();

function fit() {
  const viewport = window.visualViewport;
  const width = viewport?.width || window.innerWidth;
  const height = viewport?.height || window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  layout(width, height);
  if (!specks) specks = makeSpecks();
  if (world.bodies.length === 0) seedTable(world);
}

function layout(width, height) {
  const narrow = width < 760;
  const padX = Math.max(16, Math.min(46, width * 0.045));
  const padTop = narrow ? 74 : 96;
  const dock = document.querySelector("#dock");
  const dockBox = dock?.getBoundingClientRect();
  const measured = dockBox && dockBox.height > 40 ? height - dockBox.top + 30 : 0;
  const padBottom = Math.max(narrow ? 196 : 176, measured);
  const minX = padX + 10;
  const minY = padTop;
  const maxX = Math.max(minX + 140, width - padX - 10);
  const maxY = Math.max(minY + 160, height - padBottom);
  world.bounds.minX = minX;
  world.bounds.minY = minY;
  world.bounds.maxX = maxX;
  world.bounds.maxY = maxY;
}

function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  for (const grab of grabs.values()) {
    if (!grab.fresh) {
      grab.idle += dt;
      if (grab.idle > 0.06) {
        grab.body.vx = 0;
        grab.body.vy = 0;
      }
      continue;
    }
    moveGrab(grab.body, grab.x, grab.y, dt || 1 / 60);
    grab.fresh = false;
    grab.idle = 0;
  }
  step(world, dt);
  if (selected && !world.bodies.includes(selected)) selected = null;
  draw(canvas.clientWidth, canvas.clientHeight);
  paintCount();
  requestAnimationFrame(frame);
}

function spawnAt(x, y) {
  serial += 1;
  const cushion = 30;
  const point = {
    x: clamp(x, world.bounds.minX + cushion, world.bounds.maxX - cushion),
    y: clamp(y, world.bounds.minY + cushion, world.bounds.maxY - cushion),
    angle: (Math.random() - 0.5) * 0.6,
    color: COLORS[serial % COLORS.length],
    static: staticInput.checked,
  };
  let body;
  if (tool === "circle") {
    body = addCircle(world, { ...point, radius: 16 + Math.random() * 16, restitution: 0.74, friction: 0.22 });
  } else if (tool === "box") {
    body = addBox(world, {
      ...point,
      width: 36 + Math.random() * 36,
      height: 32 + Math.random() * 28,
      restitution: 0.14,
      friction: 0.55,
    });
  } else {
    body = addRegularPolygon(world, {
      ...point,
      sides: POLYGONS[serial % POLYGONS.length],
      radius: 22 + Math.random() * 14,
      restitution: 0.32,
      friction: 0.42,
    });
  }
  trim();
  return body;
}

function trim() {
  while (world.bodies.length > CAP) {
    const spare = world.bodies.find((body) => !body.static && !body.held && body !== selected)
      ?? world.bodies.find((body) => !body.held && body !== selected);
    if (!spare) break;
    removeBody(world, spare);
  }
}

function select(body) {
  selected = body;
  paintSelection();
}

function paintTools() {
  for (const button of toolButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.tool === tool));
  }
}

function paintPause() {
  pauseBtn.textContent = world.paused ? "Play" : "Pause";
  pauseBtn.setAttribute("aria-pressed", String(world.paused));
  pausedEl.hidden = !world.paused;
}

function paintGravity() {
  gravityRead.textContent = String(world.gravity);
  gravityInput.value = String(world.gravity);
}

function paintSelection() {
  if (selected && !world.bodies.includes(selected)) selected = null;
  toggleBtn.disabled = !selected;
  toggleBtn.textContent = selected?.static ? "Make dynamic" : "Make static";
  toggleBtn.setAttribute("aria-pressed", String(!!selected?.static));
}

function paintCount() {
  if (world.bodies.length === shownCount) return;
  shownCount = world.bodies.length;
  const noun = shownCount === 1 ? "shape" : "shapes";
  countEl.textContent = `${shownCount} ${noun}`;
}

function paintGrab() {
  document.body.dataset.grabbing = grabs.size > 0 ? "yes" : "no";
}

function localPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function onFelt(point) {
  const bounds = world.bounds;
  return point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY;
}

function draw(width, height) {
  ctx.clearRect(0, 0, width, height);
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#1c2822");
  sky.addColorStop(1, "#0c1210");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  drawTable();
  ctx.save();
  roundRect(world.bounds.minX, world.bounds.minY, world.bounds.maxX - world.bounds.minX, world.bounds.maxY - world.bounds.minY, 12);
  ctx.clip();
  for (const body of world.bodies) drawBody(body);
  if (selected && world.bodies.includes(selected)) drawSelection(selected);
  ctx.restore();
  drawBolts();
}

function drawTable() {
  const bounds = world.bounds;
  const rail = 16;
  const outerW = bounds.maxX - bounds.minX + rail * 2;
  const outerH = bounds.maxY - bounds.minY + rail * 2;
  roundRect(bounds.minX - rail, bounds.minY - rail, outerW, outerH, 22);
  const wood = ctx.createLinearGradient(0, bounds.minY - rail, 0, bounds.maxY + rail);
  wood.addColorStop(0, "#e7c091");
  wood.addColorStop(0.18, "#c4844a");
  wood.addColorStop(0.72, "#8a4e28");
  wood.addColorStop(1, "#5e3418");
  ctx.fillStyle = wood;
  ctx.fill();

  const feltW = bounds.maxX - bounds.minX;
  const feltH = bounds.maxY - bounds.minY;
  roundRect(bounds.minX, bounds.minY, feltW, feltH, 12);
  const felt = ctx.createLinearGradient(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
  felt.addColorStop(0, "#34a56a");
  felt.addColorStop(0.42, "#1f7a4c");
  felt.addColorStop(1, "#14573a");
  ctx.fillStyle = felt;
  ctx.fill();

  ctx.save();
  roundRect(bounds.minX, bounds.minY, feltW, feltH, 12);
  ctx.clip();
  const shade = ctx.createLinearGradient(bounds.minX, bounds.minY, bounds.minX, bounds.minY + 28);
  shade.addColorStop(0, "rgba(0, 0, 0, 0.22)");
  shade.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = shade;
  ctx.fillRect(bounds.minX, bounds.minY, feltW, 28);
  if (specks) {
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = specks;
    ctx.fillRect(bounds.minX, bounds.minY, feltW, feltH);
  }
  ctx.restore();
}

function drawBolts() {
  const bounds = world.bounds;
  const inset = 8;
  for (const x of [bounds.minX - inset, bounds.maxX + inset]) {
    for (const y of [bounds.minY - inset, bounds.maxY + inset]) bolt(x, y);
  }
}

function bolt(x, y) {
  ctx.beginPath();
  ctx.fillStyle = "#f3ddb8";
  ctx.arc(x, y, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.strokeStyle = "rgba(70, 36, 16, 0.6)";
  ctx.lineWidth = 1;
  ctx.moveTo(x - 2, y);
  ctx.lineTo(x + 2, y);
  ctx.stroke();
}

function drawBody(body) {
  const lift = body.held ? 12 : 5;
  ctx.save();
  ctx.translate(2, lift);
  trace(body);
  ctx.fillStyle = "rgba(4, 20, 12, 0.28)";
  ctx.fill();
  ctx.restore();

  trace(body);
  ctx.fillStyle = bodyGradient(body);
  ctx.fill();
  ctx.lineWidth = body.held ? 3 : 1.75;
  ctx.strokeStyle = body.held ? "rgba(255, 248, 230, 0.95)" : "rgba(255, 255, 255, 0.3)";
  ctx.stroke();
  if (body.static) drawPin(body);
  else drawMark(body);
}

function drawSelection(body) {
  trace(body);
  ctx.save();
  ctx.strokeStyle = "rgba(255, 248, 230, 0.95)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.stroke();
  ctx.restore();
}

function drawMark(body) {
  const reach = Math.max(6, body.radius * 0.48);
  const cosine = Math.cos(body.angle);
  const sine = Math.sin(body.angle);
  ctx.beginPath();
  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  ctx.arc(body.x + cosine * reach, body.y + sine * reach, Math.max(2.2, body.radius * 0.11), 0, Math.PI * 2);
  ctx.fill();
}

function drawPin(body) {
  ctx.save();
  ctx.translate(body.x, body.y);
  ctx.fillStyle = "#fff8ee";
  ctx.strokeStyle = "rgba(28, 48, 32, 0.45)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -2);
  ctx.lineTo(0, -11);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -13, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function trace(body) {
  ctx.beginPath();
  if (body.kind === "circle") {
    ctx.arc(body.x, body.y, body.radius, 0, Math.PI * 2);
    return;
  }
  const points = outlineOf(body);
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
}

function bodyGradient(body) {
  const gradient = ctx.createLinearGradient(body.x, body.y - body.radius, body.x, body.y + body.radius);
  gradient.addColorStop(0, mix(body.color, "#ffffff", 0.46));
  gradient.addColorStop(0.48, body.color);
  gradient.addColorStop(1, mix(body.color, "#1c1208", 0.32));
  return gradient;
}

function roundRect(x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function makeSpecks() {
  const tile = document.createElement("canvas");
  tile.width = 96;
  tile.height = 96;
  const ink = tile.getContext("2d");
  for (let i = 0; i < 28; i += 1) {
    ink.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.05)";
    ink.fillRect(Math.random() * 96, Math.random() * 96, 1.4, 1.4);
  }
  return ctx.createPattern(tile, "repeat");
}

function mix(hex, other, amount) {
  const from = rgb(hex);
  const to = rgb(other);
  const channel = (start, end) => Math.round(start + (end - start) * amount);
  return `rgb(${channel(from.r, to.r)}, ${channel(from.g, to.g)}, ${channel(from.b, to.b)})`;
}

function rgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const point = localPoint(event);
  let body = bodyAt(world, point.x, point.y);
  if (!body) {
    if (!onFelt(point)) return;
    body = spawnAt(point.x, point.y);
    hintEl.classList.add("spent");
  }
  select(body);
  grabBody(body, point.x, point.y);
  grabs.set(event.pointerId, {
    body,
    x: point.x,
    y: point.y,
    fresh: false,
    idle: 0,
  });
  paintGrab();
  if (canvas.setPointerCapture) {
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // The pointer can vanish before capture on some mobile browsers.
    }
  }
  event.preventDefault();
});

canvas.addEventListener("pointermove", (event) => {
  const grab = grabs.get(event.pointerId);
  if (!grab) return;
  const point = localPoint(event);
  grab.x = point.x;
  grab.y = point.y;
  grab.fresh = true;
});

function finishPointer(event) {
  const grab = grabs.get(event.pointerId);
  if (!grab) return;
  grabs.delete(event.pointerId);
  if (grab.fresh) moveGrab(grab.body, grab.x, grab.y, 1 / 60);
  releaseBody(grab.body);
  paintGrab();
}

canvas.addEventListener("pointerup", finishPointer);
canvas.addEventListener("pointercancel", finishPointer);

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  if (grabs.size > 0) return;
  const point = localPoint(event);
  const body = bodyAt(world, point.x, point.y);
  if (!body) return;
  select(body);
  setStatic(body, !body.static);
  paintSelection();
});

for (const button of toolButtons) {
  button.addEventListener("click", () => {
    tool = button.dataset.tool;
    paintTools();
  });
}

toggleBtn.addEventListener("click", () => {
  if (!selected) return;
  setStatic(selected, !selected.static);
  paintSelection();
});

pauseBtn.addEventListener("click", () => {
  setPaused(world, !world.paused);
  paintPause();
});

resetBtn.addEventListener("click", () => {
  for (const grab of grabs.values()) releaseBody(grab.body);
  grabs.clear();
  paintGrab();
  seedTable(world);
  selected = null;
  setPaused(world, false);
  paintPause();
  paintSelection();
  paintCount();
});

gravityInput.addEventListener("input", () => {
  setGravity(world, Number(gravityInput.value));
  paintGravity();
});

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
  if (event.code === "Space" && (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement)) return;
  if (event.code === "Space") {
    event.preventDefault();
    setPaused(world, !world.paused);
    paintPause();
    return;
  }
  if (event.code === "KeyR") {
    resetBtn.click();
    return;
  }
  if (event.code === "Digit1" || event.code === "KeyC") {
    tool = "circle";
    paintTools();
  } else if (event.code === "Digit2" || event.code === "KeyB") {
    tool = "box";
    paintTools();
  } else if (event.code === "Digit3" || event.code === "KeyP") {
    tool = "polygon";
    paintTools();
  } else if (event.code === "KeyS" && selected && !(target instanceof HTMLButtonElement)) {
    setStatic(selected, !selected.static);
    paintSelection();
  }
});

window.addEventListener("resize", fit);
window.visualViewport?.addEventListener("resize", fit);
window.visualViewport?.addEventListener("scroll", fit);
fit();
requestAnimationFrame(frame);
