import "./style.css";
import * as THREE from "three";
import { buildWorld } from "./world.js";
import { createPlayer } from "./player.js";

const canvas = document.querySelector("#game");
const shardsEl = document.querySelector("#shards");
const promptEl = document.querySelector("#prompt");
const titleCard = document.querySelector("#title-card");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
const world = buildWorld(scene);
const player = createPlayer(camera, canvas, world.colliders);

player.controls.addEventListener("lock", () => titleCard.classList.add("hidden"));
player.controls.addEventListener("unlock", () => titleCard.classList.remove("hidden"));

let last = performance.now();
let restored = false;

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const near = player.update(dt, world.shards);
  world.animate(now / 1000);

  const collected = world.shards.filter((s) => s.taken).length;
  shardsEl.textContent = `Wellshards ${collected} / 5`;
  promptEl.textContent = near && !near.taken ? "Press E to gather the wellshard" : "";

  if (collected === 5 && !restored) {
    restored = true;
    world.wellLight.intensity = 10;
    world.wellLight.distance = 70;
    promptEl.textContent = "The well is awake.";
  }

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

requestAnimationFrame(loop);
