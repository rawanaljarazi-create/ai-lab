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

const PITCH_LIMIT = 1.15;

export function createPlayer(camera, canvas, colliders, { phone, input }) {
  const controls = phone ? null : new PointerLockControls(camera, canvas);
  const velocity = new THREE.Vector3();
  const direction = new THREE.Vector3();
  let jumpBuffer = 0;
  let coyote = 0;
  let grounded = false;
  let pitch = 0;

  camera.rotation.order = "YXZ";
  camera.position.set(0, PLAYER_HEIGHT + 0.6, 16);
  if (!phone) canvas.addEventListener("click", () => controls.lock());

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
    const sample = input.read();
    if (phone) {
      camera.rotation.y += sample.yaw;
      pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch + sample.pitch));
      camera.rotation.x = pitch;
    }
    if (sample.jump) jumpBuffer = JUMP_BUFFER;

    const speed = sample.sprint ? 11 : 6.4;
    direction.set(sample.moveX, 0, sample.moveZ);
    if (direction.lengthSq() > 1) direction.normalize();

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
    if (nearShard && sample.interact) {
      nearShard.taken = true;
      nearShard.mesh.visible = false;
      nearShard.glow.visible = false;
    }

    return { nearShard, nearWell, interact: sample.interact };
  }

  return { controls, update, phone };
}
