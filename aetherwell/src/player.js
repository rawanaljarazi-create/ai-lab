import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import {
  PLAYER_HEIGHT,
  RADIUS,
  applyGravityAndJump,
  canStandOn,
  JUMP_BUFFER,
  resolveFloor,
} from "./move.js";

export function createPlayer(camera, canvas, colliders) {
  const controls = new PointerLockControls(camera, canvas);
  const velocity = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const keys = new Set();
  let jumpBuffer = 0;
  let coyote = 0;
  let grounded = false;

  camera.position.set(0, PLAYER_HEIGHT + 0.6, 16);

  document.addEventListener("keydown", (event) => {
    if (event.code === "Space") event.preventDefault();
    keys.add(event.code);
    if (event.repeat) return;
    if (event.code === "Space") jumpBuffer = JUMP_BUFFER;
  });
  document.addEventListener("keyup", (event) => keys.delete(event.code));

  canvas.addEventListener("click", () => controls.lock());

  function collides(origin) {
    const box = new THREE.Box3(
      new THREE.Vector3(origin.x - RADIUS, origin.y - PLAYER_HEIGHT, origin.z - RADIUS),
      new THREE.Vector3(origin.x + RADIUS, origin.y + 0.2, origin.z + RADIUS)
    );
    return colliders.some((c) => c.solid && c.box.intersectsBox(box));
  }

  function groundHeight(origin) {
    const feet = origin.y - PLAYER_HEIGHT;
    let best = -40;
    for (const c of colliders) {
      if (!c.walk) continue;
      const { min, max } = c.box;
      if (origin.x < min.x - RADIUS || origin.x > max.x + RADIUS) continue;
      if (origin.z < min.z - RADIUS || origin.z > max.z + RADIUS) continue;
      if (!canStandOn(feet, origin.y, max.y)) continue;
      if (max.y > best) best = max.y;
    }
    return best;
  }

  function update(dt, shards) {
    const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const speed = sprint ? 11 : 6.4;
    direction.set(0, 0, 0);
    if (keys.has("KeyW")) direction.z += 1;
    if (keys.has("KeyS")) direction.z -= 1;
    if (keys.has("KeyA")) direction.x -= 1;
    if (keys.has("KeyD")) direction.x += 1;
    if (direction.lengthSq() > 0) direction.normalize();

    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    velocity.x = (forward.x * direction.z + right.x * direction.x) * speed;
    velocity.z = (forward.z * direction.z + right.z * direction.x) * speed;

    const jump = applyGravityAndJump({
      velY: velocity.y,
      grounded,
      coyote,
      jumpBuffer,
      dt,
    });
    velocity.y = jump.velY;
    coyote = jump.coyote;
    jumpBuffer = jump.jumpBuffer;
    grounded = jump.grounded;

    const pos = camera.position;
    const nextX = pos.clone();
    nextX.x += velocity.x * dt;
    if (!collides(nextX)) pos.x = nextX.x;

    const nextZ = pos.clone();
    nextZ.z += velocity.z * dt;
    if (!collides(nextZ)) pos.z = nextZ.z;

    pos.y += velocity.y * dt;
    const floor = groundHeight(pos);
    const landed = resolveFloor(pos.y - PLAYER_HEIGHT, floor, velocity.y);
    pos.y = landed.feetY + PLAYER_HEIGHT;
    velocity.y = landed.velY;
    grounded = landed.grounded;

    let nearShard = null;
    for (const shard of shards) {
      if (shard.taken) continue;
      if (shard.mesh.position.distanceTo(pos) < 2.7) {
        nearShard = shard;
        break;
      }
    }

    const nearWell = Math.hypot(pos.x, pos.z) < 5.8 && pos.y < 6;
    const interact = keys.has("KeyE");
    if (interact) keys.delete("KeyE");

    if (nearShard && interact) {
      nearShard.taken = true;
      nearShard.mesh.visible = false;
      nearShard.glow.visible = false;
    }

    return { nearShard, nearWell, interact };
  }

  return { controls, update };
}
