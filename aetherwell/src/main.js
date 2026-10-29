import "./style.css";
import * as THREE from "three";
import { buildWorld } from "./world.js";
import { createPlayer } from "./player.js";
import { canWake, promptFor } from "./move.js";
import { detectClient } from "./device.js";
import { createDesktopInput, createPhoneInput } from "./input.js";

const canvas = document.querySelector("#game");
const shardsEl = document.querySelector("#shards");
const promptEl = document.querySelector("#prompt");
const titleCard = document.querySelector("#title-card");
const winCard = document.querySelector("#win-card");
const hintEl = document.querySelector("#play-hint");
const winHint = document.querySelector("#win-hint");
const enterBtn = document.querySelector("#enter");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
const world = buildWorld(scene);

function fit() {
  const width = window.visualViewport?.width || window.innerWidth;
  const height = window.visualViewport?.height || window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

async function boot() {
  const client = await detectClient();
  const phone = client.phone;
  document.body.dataset.client = phone ? "phone" : "pc";
  hintEl.textContent = phone
    ? "Drag the right side to look. Use the stick to move."
    : "Click to enter · WASD move · Shift sprint · Space jump · E collect / wake";
  winHint.textContent = phone ? "Walk the lit mesa." : "Esc frees the mouse";

  const input = phone ? createPhoneInput(document) : createDesktopInput();
  const player = createPlayer(camera, canvas, world.colliders, { phone, input });

  if (player.controls) {
    player.controls.addEventListener("lock", () => titleCard.classList.add("hidden"));
    player.controls.addEventListener("unlock", () => {
      if (!world.isAwake()) titleCard.classList.remove("hidden");
    });
  } else {
    enterBtn.addEventListener("click", () => titleCard.classList.add("hidden"));
  }

  let last = performance.now();

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const { nearShard, nearWell, interact } = player.update(dt, world.shards);
    world.animate(now / 1000);

    const collected = world.shards.filter((s) => s.taken).length;
    shardsEl.textContent = `Wellshards ${collected} / 5`;

    if (canWake({ collected, nearWell, interact, awake: world.isAwake() })) {
      world.awaken();
      titleCard.classList.add("hidden");
      winCard.classList.remove("hidden");
      renderer.toneMappingExposure = 1.55;
    }

    promptEl.textContent = promptFor({
      collected,
      nearShard: Boolean(nearShard),
      nearWell,
      awake: world.isAwake(),
      phone,
    });

    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  fit();
  window.addEventListener("resize", fit);
  window.visualViewport?.addEventListener("resize", fit);
  requestAnimationFrame(loop);
}

boot();
