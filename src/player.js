import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

const PLAYER_HEIGHT = 1.7;
const RADIUS = 0.42;

export function createPlayer(camera, canvas, colliders) {
  const controls = new PointerLockControls(camera, canvas);
  const velocity = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const keys = new Set();
  let grounded = false;
  let nearCollect = null;

  camera.position.set(0, PLAYER_HEIGHT + 2.4, 18);

  document.addEventListener("keydown", (event) => {
    keys.add(event.code);
    if (event.code === "Space") event.preventDefault();
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
    let best = -40;
    for (const c of colliders) {
      if (!c.walk) continue;
      const { min, max } = c.box;
      if (origin.x < min.x - RADIUS || origin.x > max.x + RADIUS) continue;
      if (origin.z < min.z - RADIUS || origin.z > max.z + RADIUS) continue;
      if (max.y <= origin.y + 0.35 && max.y > best) best = max.y;
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
    velocity.y -= 22 * dt;
    if (grounded && keys.has("Space")) {
      velocity.y = 8.2;
      grounded = false;
    }

    const pos = camera.position;
    const nextX = pos.clone();
    nextX.x += velocity.x * dt;
    if (!collides(nextX)) pos.x = nextX.x;

    const nextZ = pos.clone();
    nextZ.z += velocity.z * dt;
    if (!collides(nextZ)) pos.z = nextZ.z;

    pos.y += velocity.y * dt;
    const floor = groundHeight(pos);
    if (pos.y - PLAYER_HEIGHT <= floor + 0.02) {
      pos.y = floor + PLAYER_HEIGHT;
      velocity.y = 0;
      grounded = true;
    } else {
      grounded = false;
    }

    nearCollect = null;
    for (const shard of shards) {
      if (shard.taken) continue;
      if (shard.mesh.position.distanceTo(pos) < 2.2) {
        nearCollect = shard;
        break;
      }
    }

    if (nearCollect && keys.has("KeyE")) {
      nearCollect.taken = true;
      nearCollect.mesh.visible = false;
      nearCollect.glow.visible = false;
    }

    return nearCollect;
  }

  return { controls, update };
}
