import * as THREE from "three";
import { FLAP_VELOCITY, GROUND_Y } from "./game.js";

export function createBird(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf5c431, roughness: 0.46 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: 0xfff3d1, roughness: 0.55 });
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xe39a22, roughness: 0.52 });
  const beakMat = new THREE.MeshStandardMaterial({ color: 0xef6a2a, roughness: 0.4 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xfffdf8, roughness: 0.28 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x24180f, roughness: 0.35 });
  const shineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
  const cheekMat = new THREE.MeshStandardMaterial({ color: 0xf3a07a, roughness: 0.5 });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xd99028,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 28, 20), bodyMat);
  body.scale.set(1.08, 0.94, 0.9);
  group.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 14), bellyMat);
  belly.scale.set(0.95, 0.78, 0.62);
  belly.position.set(0.06, -0.1, 0.08);
  group.add(belly);

  const upper = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.34, 12), beakMat);
  upper.rotation.z = -Math.PI / 2;
  upper.position.set(0.5, 0.03, 0);
  group.add(upper);

  const lower = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.24, 10), beakMat);
  lower.rotation.z = -Math.PI / 2;
  lower.position.set(0.44, -0.045, 0);
  group.add(lower);

  const eyeL = eye(-0.18, whiteMat, pupilMat, shineMat, cheekMat);
  const eyeR = eye(0.34, whiteMat, pupilMat, shineMat, cheekMat);
  eyeR.scale.setScalar(1.25);
  group.add(eyeL, eyeR);

  const wingGeo = new THREE.SphereGeometry(0.22, 16, 12);
  const rightPivot = wingPivot(wingGeo, wingMat, 0.14);
  const leftPivot = wingPivot(wingGeo, wingMat, -0.1);
  group.add(rightPivot, leftPivot);

  const tail = new THREE.Group();
  tail.position.set(-0.38, 0.04, 0);
  for (const rot of [-0.42, 0, 0.42]) {
    const feather = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.12), tailMat);
    feather.position.set(-0.12, 0, 0);
    feather.rotation.z = rot;
    tail.add(feather);
  }
  group.add(tail);

  const feet = new THREE.Group();
  feet.add(foot(-0.08, beakMat), foot(0.08, beakMat));
  group.add(feet);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.46, 24),
    new THREE.MeshBasicMaterial({
      color: 0x1c3a18,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = GROUND_Y + 0.025;
  scene.add(shadow);

  const feathers = createFeathers(scene);
  const blink = { wait: 1.6, hold: 0 };

  return {
    group,
    burst() {
      feathers.emit(group.position.x - 0.05, group.position.y + 0.02, 0.42);
      feathers.emit(group.position.x - 0.05, group.position.y + 0.02, -0.42);
    },
    update(game, dt) {
      const bob = game.phase === "ready" ? Math.sin(game.time * 2.4) * 0.16 : 0;
      group.position.x = game.x;
      group.position.z = 0;
      if (game.phase === "dead") {
        group.scale.y = 0.58;
        group.position.y = GROUND_Y + 0.22;
      } else {
        group.scale.y = 1 - game.flapPulse * 0.06;
        group.scale.x = 1 + game.flapPulse * 0.04;
        group.position.y = game.y + bob;
      }

      let tilt = Math.sin(game.time * 2.2) * 0.12;
      if (game.phase === "playing") {
        tilt = THREE.MathUtils.clamp(game.vy / FLAP_VELOCITY, -1.05, 1) * 0.9;
      } else if (game.phase === "dying" || game.phase === "dead") {
        tilt = -1.2;
      }
      group.rotation.z = THREE.MathUtils.damp(group.rotation.z, tilt, 8, dt);

      const wing = 0.22 - game.flapPulse * 1.15;
      const idle = game.phase === "dying" || game.phase === "dead" ? 0 : Math.sin(game.time * 14) * 0.1;
      rightPivot.rotation.z = wing + idle;
      leftPivot.rotation.z = wing + idle;
      lower.rotation.z = -Math.PI / 2 - game.flapPulse * 0.4;
      feet.rotation.x = game.phase === "dead" ? 0 : 0.7;

      blink.wait -= dt;
      if (blink.wait <= 0) {
        blink.wait = 2.2 + Math.random() * 2.4;
        blink.hold = 0.12;
      }
      if (blink.hold > 0) blink.hold -= dt;
      const eyeScale = blink.hold > 0.05 ? 0.12 : 1;
      eyeL.scale.y = eyeScale;
      eyeR.scale.y = 1.25 * eyeScale;

      const height = Math.max(0, group.position.y - GROUND_Y);
      shadow.position.x = game.x;
      shadow.position.z = 0.05;
      const spreadShadow = 1 + height * 0.09;
      shadow.scale.set(spreadShadow, spreadShadow, spreadShadow);
      shadow.material.opacity = Math.max(0.05, 0.28 - height * 0.035);

      feathers.update(dt);
    },
  };
}

function wingPivot(geo, mat, z) {
  const pivot = new THREE.Group();
  const side = Math.sign(z) || 1;
  pivot.position.set(-0.04, 0.04, side * 0.08);
  const vane = new THREE.Mesh(geo, mat);
  vane.scale.set(1.35, 0.22, 1.25);
  vane.position.set(-0.22, 0, side * 0.32);
  const tip = new THREE.Mesh(geo, mat);
  tip.scale.set(0.72, 0.16, 0.82);
  tip.position.set(-0.5, 0.02, side * 0.48);
  pivot.add(vane, tip);
  return pivot;
}

function eye(z, whiteMat, pupilMat, shineMat, cheekMat) {
  const group = new THREE.Group();
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), whiteMat);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), pupilMat);
  pupil.position.set(0.07, 0.01, z > 0 ? 0.03 : -0.03);
  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), shineMat);
  shine.position.set(0.055, 0.05, z > 0 ? 0.055 : -0.055);
  const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), cheekMat);
  cheek.position.set(0.02, -0.1, z > 0 ? 0.02 : -0.02);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.022, 0.028), pupilMat);
  brow.position.set(0.04, 0.1, 0);
  brow.rotation.z = z > 0 ? -0.45 : 0.45;
  group.add(white, pupil, shine, cheek, brow);
  group.position.set(0.2, 0.12, z);
  return group;
}

function foot(z, mat) {
  const group = new THREE.Group();
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.12, 6), mat);
  leg.position.y = -0.05;
  const toe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.022, 0.036), mat);
  toe.position.set(0.04, -0.11, 0);
  group.add(leg, toe);
  group.position.set(0.04, -0.3, z);
  return group;
}

function createFeathers(scene) {
  const geo = new THREE.PlaneGeometry(0.12, 0.07);
  const items = Array.from({ length: 14 }, () => {
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: 0xf2c14e,
        side: THREE.DoubleSide,
        transparent: true,
        roughness: 0.6,
      }),
    );
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, life: 0, vel: new THREE.Vector3() };
  });

  return {
    emit(x, y, z) {
      const item = items.find((feather) => feather.life <= 0);
      if (!item) return;
      item.life = 0.55;
      item.mesh.visible = true;
      item.mesh.position.set(x, y, z);
      item.mesh.material.opacity = 1;
      item.vel.set(-1.1 - Math.random() * 0.8, 0.3 + Math.random() * 0.9, z * 1.4);
    },
    update(dt) {
      for (const item of items) {
        if (item.life <= 0) continue;
        item.life -= dt;
        item.vel.y -= dt * 2.2;
        item.mesh.position.addScaledVector(item.vel, dt);
        item.mesh.rotation.z += dt * 5;
        item.mesh.material.opacity = Math.max(0, item.life / 0.55);
        if (item.life <= 0) item.mesh.visible = false;
      }
    },
  };
}
