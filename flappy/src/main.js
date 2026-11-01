import "./style.css";
import * as THREE from "three";
import { createAudio } from "./audio.js";
import { createBird } from "./bird.js";
import { createCourse } from "./course.js";
import { createGame, flap, tick } from "./game.js";

const BEST_KEY = "flappy-best";
const MUTE_KEY = "flappy-muted";

const canvas = document.querySelector("#game");
const scoreEl = document.querySelector("#score");
const recordEl = document.querySelector("#record");
const readyEl = document.querySelector("#ready");
const readyBestEl = document.querySelector("#ready-best");
const doneEl = document.querySelector("#done");
const doneTitleEl = document.querySelector("#done-title");
const resultEl = document.querySelector("#result");
const muteBtn = document.querySelector("#mute");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 240);
const course = createCourse(scene, renderer);
const bird = createBird(scene);
const audio = createAudio();
const game = createGame({ best: loadBest() });
let shownScore = game.score;
let shownPhase = game.phase;

audio.muted = loadMute();
paintMute();
syncHud();

const look = new THREE.Vector3();
let shake = 0;
let last = performance.now();

function fit() {
  const width = window.visualViewport?.width || window.innerWidth;
  const height = window.visualViewport?.height || window.innerHeight;
  const aspect = Math.max(width, 1) / Math.max(height, 1);
  const halfH = THREE.MathUtils.degToRad(36);
  const halfV = Math.atan(Math.tan(halfH) / Math.max(aspect, 0.35));
  camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(halfV * 2), 42, 96);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const result = tick(game, dt);
  if (result.scored) {
    audio.score();
    popScore();
  }
  if (result.died) {
    audio.hit();
    shake = 1;
    saveBest(game.best);
  }

  shake = Math.max(0, shake - dt * 1.7);
  const jx = (Math.random() - 0.5) * shake * 0.16;
  const jy = (Math.random() - 0.5) * shake * 0.12;
  camera.position.set(game.x - 1.15 + jx, 0.55 + jy, 11.15);
  look.set(game.x + 1.9, 0.2, 0);
  camera.lookAt(look);

  bird.update(game, dt);
  course.sync(game, dt);
  if (game.score !== shownScore || game.phase !== shownPhase) syncHud();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function onFlap() {
  const action = flap(game);
  if (action === "flap" || action === "restart") {
    audio.flap();
    bird.burst();
    if (action === "restart") syncHud();
  }
}

function syncHud() {
  shownScore = game.score;
  shownPhase = game.phase;
  scoreEl.textContent = String(game.score);
  scoreEl.hidden = game.phase !== "playing" && game.phase !== "dying";
  recordEl.hidden = game.phase !== "playing" || game.best <= 0;
  recordEl.textContent = `Best ${game.best}`;
  readyEl.hidden = game.phase !== "ready";
  readyBestEl.hidden = game.best <= 0;
  readyBestEl.textContent = `Best ${game.best}`;
  doneEl.hidden = game.phase !== "dead";
  if (game.phase === "dead") {
    const noun = game.score === 1 ? "pipe" : "pipes";
    doneTitleEl.textContent = game.score > 0 && game.score === game.best ? "Best run" : "Down";
    resultEl.textContent = `${game.score} ${noun} · best ${game.best}`;
  }
}

function popScore() {
  scoreEl.classList.remove("pop");
  void scoreEl.offsetWidth;
  scoreEl.classList.add("pop");
}

function loadBest() {
  try {
    const value = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Private mode can reject storage. The run still keeps its best in memory.
  }
}

function loadMute() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function paintMute() {
  muteBtn.textContent = audio.muted ? "Sound off" : "Sound on";
  muteBtn.setAttribute("aria-pressed", String(audio.muted));
}

window.addEventListener("pointerdown", (event) => {
  if (event.target instanceof Element && event.target.closest("a, button")) return;
  onFlap();
});

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.code !== "Space" && event.code !== "ArrowUp" && event.code !== "KeyW") return;
  event.preventDefault();
  onFlap();
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

window.addEventListener("resize", fit);
window.visualViewport?.addEventListener("resize", fit);
fit();
requestAnimationFrame(frame);
