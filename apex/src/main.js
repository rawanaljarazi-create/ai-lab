import "./style.css";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { createAudio } from "./audio.js";
import { createCarView, syncCarView } from "./cars.js";
import {
  controlInput,
  createRace,
  formatTime,
  placeLabel,
  positionOf,
  startRace,
  tickRace,
} from "./game.js";
import { againFor, hintFor, isPhone, qualityFor } from "./quality.js";
import { createWorld, paintStart } from "./scene.js";
import { buildHarbor } from "./track.js";

const BEST_KEY = "apex-best";
const LAP_KEY = "apex-best-lap";
const MUTE_KEY = "apex-muted";
const CAM_KEY = "apex-camera";

const canvas = document.querySelector("#game");
const mapCanvas = document.querySelector("#map");
const mapCtx = mapCanvas.getContext("2d");
const speedEl = document.querySelector("#speed");
const lapEl = document.querySelector("#lap");
const posEl = document.querySelector("#pos");
const timeEl = document.querySelector("#time");
const bestEl = document.querySelector("#best");
const needleEl = document.querySelector("#needle");
const readyEl = document.querySelector("#ready");
const readyBestEl = document.querySelector("#ready-best");
const doneEl = document.querySelector("#done");
const doneTitleEl = document.querySelector("#done-title");
const resultEl = document.querySelector("#result");
const playHint = document.querySelector("#play-hint");
const againHint = document.querySelector("#again-hint");
const lightsEl = document.querySelector("#lights");
const lightNodes = [...lightsEl.children];
const goEl = document.querySelector("#go");
const wrongEl = document.querySelector("#wrong");
const muteBtn = document.querySelector("#mute");
const camBtn = document.querySelector("#cam");
const gasBtn = document.querySelector("#gas");
const brakeBtn = document.querySelector("#brake");
const steerPad = document.querySelector("#steer-pad");

const track = buildHarbor();
const race = createRace(track, { best: loadNumber(BEST_KEY), bestLap: loadNumber(LAP_KEY) });
const audio = createAudio();
const map = bakeMap(track);
const controls = {
  up: false,
  down: false,
  left: false,
  right: false,
  gas: false,
  brake: false,
  steerTouch: null,
};

let quality = measure();
let cameraMode = loadCamera();
let showcase = 0;
let lit = 0;
let skidClock = 0;
let slowFrames = 0;
let useBloom = true;
let snapped = false;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: quality.antialias,
  powerPreference: "high-performance",
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 760);
const world = createWorld(renderer, track, quality);
const views = race.cars.map((entry, index) => {
  const view = createCarView(entry.color, index + 1, {
    transmission: !quality.phone,
    headlights: index === 0,
  });
  view.setLights(index === 0);
  world.scene.add(view.root);
  syncCarView(view, entry.car, 0, false);
  return view;
});
const skids = createSkids(world.scene);

const composer = buildComposer();
const smooth = new THREE.Vector3();
const desired = new THREE.Vector3();
const look = new THREE.Vector3();

audio.muted = loadMute();
paintMute();
paintCamera();
applyClient();
playHint.textContent = hintFor(quality.touch);
againHint.textContent = againFor(quality.touch);
syncHud();

let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const input = controlInput(controls);
  const was = race.phase;
  const result = tickRace(race, track, input, dt);
  if (race.phase === "ready" || race.phase === "finished") showcase += dt;

  if (race.phase === "lights" && race.light.red > lit) {
    lit = race.light.red;
    audio.blip(lit);
  }
  if (result.go) {
    lit = 0;
    audio.go();
  }
  if (was !== "lights" && race.phase === "lights") lit = 0;

  const player = race.cars[0];
  views.forEach((view, index) => {
    const entry = race.cars[index];
    const braking = index === 0 ? input.brake > 0.2 : entry.car.speed > 20 && Math.abs(entry.car.steer) > 0.25;
    syncCarView(view, entry.car, dt, braking);
    if (index === 0) view.setLights(race.phase !== "ready");
  });
  paintStart(world.lamps, race.phase === "lights" ? race.light : { red: 0, green: false });
  laySkids(player.car, dt);
  world.update(player.car, showcase + race.raceTime);
  placeCamera(dt);
  audio.update(player.car.speed, input.throttle, race.phase);
  if (race.phase === "racing" && result.surface === "barrier") audio.hit(now / 1000);

  if (dt > 0.034) slowFrames += 1;
  else slowFrames = Math.max(0, slowFrames - 1);
  if (slowFrames > 45) useBloom = false;

  steerPad.style.setProperty("--steer", String(-input.steer));
  if (race.phase !== was || result.lap || result.finished || race.phase === "racing" || race.phase === "lights") {
    syncHud();
  }
  drawMap();

  if (composer && useBloom) composer.render();
  else renderer.render(world.scene, camera);
  requestAnimationFrame(frame);
}

function placeCamera(dt) {
  const car = race.cars[0].car;
  const aspect = camera.aspect || 1;
  const narrow = aspect < 0.95;
  const phone = document.body.dataset.client === "phone";
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  if (race.phase === "ready" || race.phase === "finished") {
    const orbit = narrow ? 13 : 16;
    const ang = showcase * 0.22;
    desired.set(
      car.x + Math.sin(ang) * orbit,
      narrow ? 5.4 : 4.4,
      car.z + Math.cos(ang) * orbit * 0.78,
    );
    look.set(car.x, 0.8, car.z);
  } else if (cameraMode === "hood") {
    desired.set(car.x + fx * 0.25 + Math.cos(car.heading) * 0.35, 1.15, car.z + fz * 0.25 - Math.sin(car.heading) * 0.35);
    look.set(car.x + fx * 20, 0.7, car.z + fz * 20);
  } else {
    const back = narrow ? 9.6 : phone ? 8.5 : 7.6;
    const height = narrow ? 4.2 : phone ? 3.25 : 2.7;
    desired.set(car.x - fx * back, height, car.z - fz * back);
    look.set(car.x + fx * (narrow ? 6.5 : 9), 0.85, car.z + fz * (narrow ? 6.5 : 9));
  }
  if (!snapped) {
    smooth.copy(desired);
    snapped = true;
  } else {
    smooth.lerp(desired, 1 - Math.exp(-(race.phase === "lights" ? 3.4 : 4.8) * dt));
  }
  camera.position.copy(smooth);
  const roll = cameraMode === "chase" && race.phase === "racing" ? car.steer * 0.55 : 0;
  camera.up.set(Math.cos(car.heading) * Math.sin(roll), Math.cos(roll), -Math.sin(car.heading) * Math.sin(roll));
  camera.lookAt(look);
  const base = cameraMode === "hood" ? (narrow ? 78 : 70) : narrow ? 68 : phone ? 60 : 56;
  const extra = race.phase === "racing" ? Math.min(12, Math.abs(car.speed) * 0.16) : 0;
  camera.fov += (base + extra - camera.fov) * Math.min(1, dt * 2.4);
  camera.updateProjectionMatrix();
}

function syncHud() {
  const player = race.cars[0];
  document.body.dataset.phase = race.phase;
  const kmh = Math.round(Math.abs(player.car.speed) * 3.6);
  speedEl.textContent = String(kmh);
  needleEl.style.width = `${Math.min(100, (Math.abs(player.car.speed) / 72) * 100)}%`;
  const showing = Math.min(race.laps, player.lap + 1);
  lapEl.textContent = `Lap ${showing}/${race.laps}`;
  posEl.textContent = placeLabel(positionOf(race, 0));
  timeEl.textContent = formatTime(race.phase === "racing" || race.phase === "finished" ? race.raceTime : 0);
  bestEl.hidden = !(player.bestLap || race.bestLap);
  bestEl.textContent = `Best lap ${formatTime(player.bestLap ?? race.bestLap)}`;
  readyEl.hidden = race.phase !== "ready";
  doneEl.hidden = race.phase !== "finished";
  const showTree = race.phase === "lights" && !race.light.green;
  lightsEl.hidden = !showTree;
  lightsEl.classList.toggle("green", Boolean(race.light.green));
  lightNodes.forEach((node, index) => node.classList.toggle("on", race.light.green || index < race.light.red));
  goEl.hidden = !(race.phase === "racing" && race.raceTime < 0.85);
  wrongEl.hidden = !(race.phase === "racing" && player.wrong);
  const best = race.best;
  readyBestEl.hidden = !best;
  readyBestEl.textContent = best ? `Best race ${formatTime(best)}` : "";
  if (race.phase === "finished") {
    const place = positionOf(race, 0);
    doneTitleEl.textContent = place === 1 && best === race.raceTime ? "Best race" : placeLabel(place);
    const lap = player.bestLap ?? player.lastLap;
    resultEl.textContent = `${formatTime(race.raceTime)} · best lap ${formatTime(lap)} · ${placeLabel(place)} of ${race.cars.length}`;
    saveNumber(BEST_KEY, race.best);
    saveNumber(LAP_KEY, race.bestLap);
  }
}

function laySkids(car, dt) {
  skidClock -= dt;
  if (skidClock > 0 || Math.abs(car.steer) * car.speed < 7 || car.speed < 16) return;
  skidClock = 0.07;
  for (const side of [-0.86, 0.86]) {
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    skids.drop(
      car.x + Math.cos(car.heading) * side - fx * 1.38,
      car.z - Math.sin(car.heading) * side - fz * 1.38,
      car.heading,
    );
  }
}

function begin() {
  if (!startRace(race, track)) return;
  audio.unlock();
  lit = 0;
  syncHud();
}

function fit() {
  quality = measure();
  applyClient();
  const viewport = window.visualViewport;
  const width = viewport?.width || window.innerWidth;
  const height = viewport?.height || window.innerHeight;
  camera.aspect = Math.max(width, 1) / Math.max(height, 1);
  camera.updateProjectionMatrix();
  const ratio = Math.min(window.devicePixelRatio || 1, quality.pixelCap);
  renderer.setPixelRatio(ratio);
  renderer.setSize(width, height, false);
  composer?.setPixelRatio(ratio);
  composer?.setSize(width, height);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  playHint.textContent = hintFor(quality.touch);
  againHint.textContent = againFor(quality.touch);
}

function measure() {
  const viewport = window.visualViewport;
  return qualityFor({
    phone: isPhone(),
    cores: navigator.hardwareConcurrency || 8,
    width: viewport?.width || window.innerWidth,
    height: viewport?.height || window.innerHeight,
  });
}

function applyClient() {
  document.body.dataset.client = quality.touch ? "phone" : "desk";
  document.body.dataset.narrow = quality.narrow ? "true" : "false";
}

function buildComposer() {
  try {
    const effect = new EffectComposer(renderer);
    effect.addPass(new RenderPass(world.scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.4, 0.68);
    bloom.resolution.multiplyScalar(quality.bloomScale);
    effect.addPass(bloom);
    effect.addPass(new OutputPass());
    return effect;
  } catch {
    return null;
  }
}

function createSkids(scene) {
  const count = 70;
  const geo = new THREE.PlaneGeometry(0.28, 0.85);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x0a0a0a,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const dummy = new THREE.Object3D();
  let cursor = 0;
  return {
    drop(x, z, heading) {
      dummy.position.set(x, 0.06, z);
      dummy.rotation.set(0, heading, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(cursor, dummy.matrix);
      mesh.instanceMatrix.needsUpdate = true;
      cursor = (cursor + 1) % count;
    },
  };
}

function bakeMap(circuit) {
  const size = 168;
  const baked = document.createElement("canvas");
  baked.width = size;
  baked.height = size;
  const ctx = baked.getContext("2d");
  const pad = 16;
  const spanX = Math.max(1, circuit.maxX - circuit.minX);
  const spanZ = Math.max(1, circuit.maxZ - circuit.minZ);
  const scale = Math.min((size - pad * 2) / spanX, (size - pad * 2) / spanZ);
  const ox = (size - spanX * scale) / 2;
  const oy = (size - spanZ * scale) / 2;
  const projectPoint = (x, z) => [ox + (x - circuit.minX) * scale, oy + (circuit.maxZ - z) * scale];
  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 14;
  trace(ctx, circuit, projectPoint);
  ctx.stroke();
  ctx.strokeStyle = "rgba(244,241,234,0.88)";
  ctx.lineWidth = 4;
  trace(ctx, circuit, projectPoint);
  ctx.stroke();
  return { image: baked, projectPoint };
}

function trace(ctx, circuit, projectPoint) {
  ctx.beginPath();
  circuit.samples.forEach((sample, index) => {
    const [x, y] = projectPoint(sample.x, sample.z);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function drawMap() {
  if (mapCanvas.offsetParent === null) return;
  mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
  mapCtx.drawImage(map.image, 0, 0);
  race.cars.forEach((entry, index) => {
    const [x, y] = map.projectPoint(entry.car.x, entry.car.z);
    mapCtx.beginPath();
    mapCtx.fillStyle = index === 0 ? "#f4f7fb" : entry.color;
    mapCtx.arc(x, y, index === 0 ? 4.5 : 3.4, 0, Math.PI * 2);
    mapCtx.fill();
  });
}

function paintMute() {
  muteBtn.textContent = audio.muted ? "Sound off" : "Sound on";
  muteBtn.setAttribute("aria-pressed", String(audio.muted));
}

function paintCamera() {
  camBtn.textContent = cameraMode === "hood" ? "Hood" : "Chase";
}

function loadMute() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function loadCamera() {
  try {
    return localStorage.getItem(CAM_KEY) === "hood" ? "hood" : "chase";
  } catch {
    return "chase";
  }
}

function loadNumber(key) {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function saveNumber(key, value) {
  if (!Number.isFinite(value)) return;
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Private mode can reject storage. The race still keeps its best in memory.
  }
}

function hold(button, setDown) {
  const ids = new Set();
  const down = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    ids.add(event.pointerId);
    setDown(true);
    button.classList.add("is-down");
  };
  const up = (event) => {
    ids.delete(event.pointerId);
    if (ids.size === 0) {
      setDown(false);
      button.classList.remove("is-down");
    }
  };
  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointercancel", up);
  button.addEventListener("lostpointercapture", up);
}

hold(gasBtn, (down) => {
  controls.gas = down;
});
hold(brakeBtn, (down) => {
  controls.brake = down;
});

let steerId = null;
function steerFrom(event) {
  const rect = steerPad.getBoundingClientRect();
  const amount = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
  controls.steerTouch = Math.max(-1, Math.min(1, amount));
}
steerPad.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  steerId = event.pointerId;
  steerPad.setPointerCapture(event.pointerId);
  steerFrom(event);
});
steerPad.addEventListener("pointermove", (event) => {
  if (event.pointerId !== steerId) return;
  steerFrom(event);
});
function releaseSteer(event) {
  if (event.pointerId !== steerId) return;
  steerId = null;
  controls.steerTouch = null;
}
steerPad.addEventListener("pointerup", releaseSteer);
steerPad.addEventListener("pointercancel", releaseSteer);

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
  if ((event.code === "Enter" || event.code === "Space") && (race.phase === "ready" || race.phase === "finished")) {
    begin();
    return;
  }
  if (event.code === "KeyC") {
    cameraMode = cameraMode === "chase" ? "hood" : "chase";
    paintCamera();
    try {
      localStorage.setItem(CAM_KEY, cameraMode);
    } catch {
      // The button still switches for this visit.
    }
    return;
  }
  if (event.code === "ArrowUp" || event.code === "KeyW") controls.up = true;
  if (event.code === "ArrowDown" || event.code === "KeyS" || event.code === "Space") controls.down = true;
  if (event.code === "ArrowLeft" || event.code === "KeyA") controls.left = true;
  if (event.code === "ArrowRight" || event.code === "KeyD") controls.right = true;
});

window.addEventListener("keyup", (event) => {
  if (event.code === "ArrowUp" || event.code === "KeyW") controls.up = false;
  if (event.code === "ArrowDown" || event.code === "KeyS" || event.code === "Space") controls.down = false;
  if (event.code === "ArrowLeft" || event.code === "KeyA") controls.left = false;
  if (event.code === "ArrowRight" || event.code === "KeyD") controls.right = false;
});

readyEl.addEventListener("pointerdown", (event) => {
  if (event.target.closest("a, button")) return;
  begin();
});
doneEl.addEventListener("pointerdown", (event) => {
  if (event.target.closest("a, button")) return;
  begin();
});

muteBtn.addEventListener("click", () => {
  audio.muted = !audio.muted;
  paintMute();
  try {
    localStorage.setItem(MUTE_KEY, audio.muted ? "1" : "0");
  } catch {
    // The button still toggles for this visit.
  }
});

camBtn.addEventListener("click", () => {
  cameraMode = cameraMode === "chase" ? "hood" : "chase";
  paintCamera();
  try {
    localStorage.setItem(CAM_KEY, cameraMode);
  } catch {
    // The button still switches for this visit.
  }
});

window.addEventListener("resize", fit);
window.visualViewport?.addEventListener("resize", fit);
window.visualViewport?.addEventListener("scroll", fit);
window.addEventListener("contextmenu", (event) => event.preventDefault());
fit();
requestAnimationFrame(frame);
