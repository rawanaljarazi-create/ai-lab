import * as THREE from "three";
import {
  GAP,
  GROUND_Y,
  LIP_HEIGHT,
  LIP_RADIUS,
  PIPE_RADIUS,
} from "./game.js";

export function createCourse(scene, renderer) {
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  scene.background = new THREE.Color(0xb7e4ff);
  scene.fog = new THREE.Fog(0xd7eefc, 26, 78);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 20), skyMaterial());
  sky.frustumCulled = false;
  scene.add(sky);

  const sun = sunSprite();
  scene.add(sun);

  scene.add(new THREE.HemisphereLight(0xd7ecff, 0x6ea84a, 0.95));
  const sunLight = new THREE.DirectionalLight(0xfff4d8, 1.5);
  sunLight.position.set(18, 26, 10);
  scene.add(sunLight);
  const fill = new THREE.DirectionalLight(0x9ecbff, 0.38);
  fill.position.set(-10, 8, 16);
  scene.add(fill);

  const grassTex = grassTexture(anisotropy);
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 80),
    new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.92 }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = GROUND_Y;
  scene.add(grass);

  const skirt = new THREE.Mesh(
    new THREE.BoxGeometry(150, 4, 80),
    new THREE.MeshStandardMaterial({ color: 0x8d5a38, roughness: 0.95 }),
  );
  skirt.position.y = GROUND_Y - 2.02;
  scene.add(skirt);

  const mats = {
    pipe: new THREE.MeshStandardMaterial({ color: 0x3cb44e, roughness: 0.52 }),
    lip: new THREE.MeshStandardMaterial({ color: 0x2c943c, roughness: 0.42 }),
    ring: new THREE.MeshStandardMaterial({ color: 0xe7ffc4, roughness: 0.35 }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x7a4b2e, roughness: 0.8 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x2f8f45, roughness: 0.72 }),
    leafDeep: new THREE.MeshStandardMaterial({ color: 0x22723a, roughness: 0.78 }),
    hill: new THREE.MeshStandardMaterial({ color: 0x67a84a, roughness: 0.9 }),
    hillFar: new THREE.MeshStandardMaterial({ color: 0x8fbe6a, roughness: 0.95 }),
    cloud: new THREE.MeshBasicMaterial({ color: 0xf4f7fb }),
    post: new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.6 }),
  };

  const movers = [];
  const span = 84;
  for (let i = 0; i < 14; i += 1) {
    const tree = addTree(scene, mats, -span / 2 + i * (span / 14), -4.2 - (i % 3) * 1.35, 0.85 + (i % 4) * 0.22);
    movers.push({ mesh: tree, span, drift: 0 });
  }
  for (let i = 0; i < 8; i += 1) {
    const hill = addHill(
      scene,
      i % 2 ? mats.hillFar : mats.hill,
      -span / 2 + i * (span / 8),
      -10 - (i % 3) * 2.2,
      4.2 + (i % 3),
      1.5 + (i % 2) * 0.45,
    );
    movers.push({ mesh: hill, span, drift: 0 });
  }
  for (let i = 0; i < 7; i += 1) {
    const cloud = addCloud(
      scene,
      mats.cloud,
      -50 + i * 16,
      6.2 + (i % 3) * 1.1,
      -6 - (i % 4) * 2,
      0.85 + (i % 3) * 0.28,
    );
    movers.push({ mesh: cloud, span: 112, drift: 0.25 + (i % 3) * 0.08 });
  }
  for (let i = 0; i < 22; i += 1) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.42, 6), mats.post);
    post.position.set(-span / 2 + i * (span / 22), GROUND_Y + 0.21, -2.45);
    scene.add(post);
    movers.push({ mesh: post, span, drift: 0 });
  }

  const pool = [];

  return {
    sync(game, dt) {
      sky.position.x = game.x;
      sun.position.set(game.x + 18, 12.5, -22);
      grass.position.x = game.x;
      skirt.position.x = game.x;
      grassTex.offset.x = (game.x / 150) * grassTex.repeat.x;

      for (const item of movers) {
        if (item.drift) item.mesh.position.x += item.drift * dt;
        const half = item.span / 2;
        const delta = item.mesh.position.x - game.x;
        if (delta > half) item.mesh.position.x -= item.span;
        else if (delta < -half) item.mesh.position.x += item.span;
      }

      while (pool.length < game.pipes.length) pool.push(createPipe(scene, mats));
      for (let i = 0; i < pool.length; i += 1) {
        const pipe = game.pipes[i];
        pool[i].group.visible = Boolean(pipe);
        if (pipe) layoutPipe(pool[i], pipe);
      }
    },
  };
}

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color("#5aa6f2") },
      mid: { value: new THREE.Color("#c5ebff") },
      horizon: { value: new THREE.Color("#ffe3b8") },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPos;
      uniform vec3 top;
      uniform vec3 mid;
      uniform vec3 horizon;
      void main() {
        float h = normalize(vPos).y;
        vec3 col = mix(horizon, mid, smoothstep(-0.04, 0.28, h));
        col = mix(col, top, smoothstep(0.18, 0.82, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function sunSprite() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const glow = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
  glow.addColorStop(0, "rgba(255, 250, 230, 1)");
  glow.addColorStop(0.28, "rgba(255, 214, 120, 0.9)");
  glow.addColorStop(1, "rgba(255, 180, 60, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
      fog: false,
    }),
  );
  sprite.scale.set(22, 22, 1);
  return sprite;
}

function grassTexture(anisotropy) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#74b84f";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 220; i += 1) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.strokeStyle = Math.random() > 0.45 ? "#5ea241" : "#97dc6c";
    ctx.globalAlpha = 0.45 + Math.random() * 0.4;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.45) * 5, y - 7 - Math.random() * 12);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 12);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

function createPipe(scene, mats) {
  const group = new THREE.Group();
  const shaft = new THREE.CylinderGeometry(PIPE_RADIUS, PIPE_RADIUS, 1, 24);
  const lip = new THREE.CylinderGeometry(LIP_RADIUS, LIP_RADIUS, LIP_HEIGHT, 24);
  const ring = new THREE.TorusGeometry(LIP_RADIUS * 0.92, 0.045, 8, 24);
  const bottom = new THREE.Mesh(shaft, mats.pipe);
  const top = new THREE.Mesh(shaft, mats.pipe);
  const bottomLip = new THREE.Mesh(lip, mats.lip);
  const topLip = new THREE.Mesh(lip, mats.lip);
  const bottomRing = new THREE.Mesh(ring, mats.ring);
  const topRing = new THREE.Mesh(ring, mats.ring);
  bottomRing.rotation.x = Math.PI / 2;
  topRing.rotation.x = Math.PI / 2;
  group.add(bottom, top, bottomLip, topLip, bottomRing, topRing);
  scene.add(group);
  return { group, bottom, top, bottomLip, topLip, bottomRing, topRing };
}

function layoutPipe(view, pipe) {
  const bottomEdge = pipe.gapY - GAP / 2;
  const topEdge = pipe.gapY + GAP / 2;
  const bottomRoot = -12;
  const topRoot = 14;
  const bottomReach = bottomEdge - LIP_HEIGHT + 0.08;
  const topReach = topEdge + LIP_HEIGHT - 0.08;
  const bottomLen = Math.max(0.2, bottomReach - bottomRoot);
  const topLen = Math.max(0.2, topRoot - topReach);
  view.bottom.scale.y = bottomLen;
  view.bottom.position.set(pipe.x, bottomRoot + bottomLen / 2, 0);
  view.top.scale.y = topLen;
  view.top.position.set(pipe.x, topReach + topLen / 2, 0);
  view.bottomLip.position.set(pipe.x, bottomEdge - LIP_HEIGHT / 2, 0);
  view.topLip.position.set(pipe.x, topEdge + LIP_HEIGHT / 2, 0);
  view.bottomRing.position.set(pipe.x, bottomEdge - 0.02, 0);
  view.topRing.position.set(pipe.x, topEdge + 0.02, 0);
}

function addTree(scene, mats, x, z, scale) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * scale, 0.13 * scale, 0.6 * scale, 6), mats.trunk);
  trunk.position.y = GROUND_Y + 0.3 * scale;
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.58 * scale, 1.4 * scale, 7), mats.leaf);
  crown.position.y = GROUND_Y + 1.15 * scale;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.36 * scale, 0.7 * scale, 7), mats.leafDeep);
  cap.position.y = GROUND_Y + 1.55 * scale;
  group.add(trunk, crown, cap);
  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

function addHill(scene, mat, x, z, sx, sy) {
  const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), mat);
  hill.scale.set(sx, sy, sx * 0.7);
  hill.position.set(x, GROUND_Y - sy * 0.45, z);
  scene.add(hill);
  return hill;
}

function addCloud(scene, mat, x, y, z, scale) {
  const group = new THREE.Group();
  const puff = new THREE.SphereGeometry(1, 14, 10);
  for (const [px, py, pz, s] of [
    [0, 0, 0, 1],
    [1.15, -0.18, 0.1, 0.72],
    [-1.05, -0.12, -0.05, 0.66],
    [0.4, 0.38, -0.08, 0.52],
  ]) {
    const mesh = new THREE.Mesh(puff, mat);
    mesh.scale.setScalar(s);
    mesh.position.set(px, py, pz);
    group.add(mesh);
  }
  group.scale.setScalar(scale);
  group.position.set(x, y, z);
  scene.add(group);
  return group;
}
