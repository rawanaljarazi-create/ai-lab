import * as THREE from "three";

function boxCollider(mesh, { solid = true, walk = true } = {}) {
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  return { box, solid, walk };
}

function makeMat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: extra.roughness ?? 0.82,
    metalness: extra.metalness ?? 0.08,
    emissive: extra.emissive ?? 0x000000,
    emissiveIntensity: extra.emissiveIntensity ?? 0,
    transparent: extra.transparent ?? false,
    opacity: extra.opacity ?? 1,
  });
}

export function buildWorld(scene) {
  const colliders = [];
  const shards = [];
  const lanterns = [];

  scene.fog = new THREE.FogExp2(0x0b0a14, 0.018);
  scene.background = new THREE.Color(0x0b0a14);

  const hemi = new THREE.HemisphereLight(0x8ea0d4, 0x3a2418, 0.95);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xc9d4ff, 0.85);
  moon.position.set(-18, 28, 8);
  scene.add(moon);
  const wellLight = new THREE.PointLight(0x6ad7c4, 4.2, 42, 1.4);
  wellLight.position.set(0, 4.2, 0);
  scene.add(wellLight);

  const stone = makeMat(0x4a4453);
  const sand = makeMat(0x6d5a45, { roughness: 0.95 });
  const wood = makeMat(0x3d2a1d);
  const copper = makeMat(0x8a5a38, { metalness: 0.45, roughness: 0.4 });
  const crystal = makeMat(0x7ee0d0, {
    roughness: 0.18,
    metalness: 0.2,
    emissive: 0x1aa88f,
    emissiveIntensity: 0.55,
    transparent: true,
    opacity: 0.86,
  });
  const leaf = makeMat(0x355c48, { emissive: 0x123322, emissiveIntensity: 0.2 });

  const mesa = new THREE.Mesh(new THREE.CylinderGeometry(28, 31, 6, 40), stone);
  mesa.position.y = -3;
  scene.add(mesa);
  colliders.push(boxCollider(mesa, { solid: false, walk: true }));

  const ring = new THREE.Mesh(new THREE.TorusGeometry(21, 1.1, 10, 48), sand);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.15;
  scene.add(ring);

  const well = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 2.4, 24), copper);
  well.position.y = 1.2;
  scene.add(well);
  colliders.push(boxCollider(well));

  const wellInner = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 2.2, 20), crystal);
  wellInner.position.y = 1.35;
  scene.add(wellInner);

  const wellGlow = new THREE.PointLight(0x8ef0dc, 1.6, 16);
  wellGlow.position.set(0, 2.8, 0);
  scene.add(wellGlow);

  function terrace(x, z, w, d, h = 0.7) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stone);
    mesh.position.set(x, h / 2, z);
    scene.add(mesh);
    colliders.push(boxCollider(mesh, { solid: false, walk: true }));
    return mesh;
  }

  terrace(0, -12, 10, 8, 0.5);
  terrace(14, 2, 9, 9, 0.8);
  terrace(-14, 4, 8, 10, 0.7);
  terrace(8, 14, 11, 7, 0.55);
  terrace(-9, -16, 8, 6, 0.9);

  function building(x, z, w, h, d, rot = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stone);
    mesh.position.set(x, h / 2, z);
    mesh.rotation.y = rot;
    scene.add(mesh);
    colliders.push(boxCollider(mesh));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, 1.4, 4), copper);
    roof.position.set(x, h + 0.7, z);
    roof.rotation.y = rot + Math.PI / 4;
    scene.add(roof);
  }

  building(-16, -6, 5.5, 4.2, 6.2, 0.2);
  building(16, -8, 6, 3.6, 5, -0.3);
  building(12, 16, 4.5, 5.1, 4.5, 0.5);
  building(-18, 12, 7, 3.2, 5.4, -0.15);

  function arch(x, z, rot) {
    const group = new THREE.Group();
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.7, 4.4, 0.7), stone);
    left.position.set(-2.1, 2.2, 0);
    const right = left.clone();
    right.position.x = 2.1;
    const top = new THREE.Mesh(new THREE.BoxGeometry(5, 0.7, 0.7), copper);
    top.position.y = 4.5;
    group.add(left, right, top);
    group.position.set(x, 0, z);
    group.rotation.y = rot;
    scene.add(group);
    group.updateMatrixWorld(true);
    colliders.push(boxCollider(left));
    colliders.push(boxCollider(right));
  }

  arch(0, 10, 0);
  arch(-8, -8, 0.7);
  arch(9, -4, -0.5);

  const hello = helloGate();

  function tree(x, z, scale = 1) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.3 * scale, 2.4 * scale, 6), wood);
    trunk.position.set(x, 1.2 * scale, z);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35 * scale, 0), leaf);
    crown.position.set(x, 2.8 * scale, z);
    scene.add(trunk, crown);
    colliders.push(boxCollider(trunk));
  }

  [
    [10, -14, 1.1],
    [-12, -12, 0.9],
    [20, 4, 1.3],
    [-21, 1, 1],
    [4, 20, 0.8],
    [-4, 18, 1.15],
    [22, -12, 0.85],
    [-20, -16, 1.05],
  ].forEach(([x, z, s]) => tree(x, z, s));

  function crystalSpire(x, z, h) {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.55, h, 5), crystal);
    mesh.position.set(x, h / 2, z);
    mesh.rotation.y = Math.random() * Math.PI;
    scene.add(mesh);
  }

  [
    [3.8, 2.2, 3.2],
    [-3.4, -1.8, 2.6],
    [2.1, -3.6, 2.1],
    [-1.6, 3.8, 3.8],
    [18, 9, 2.4],
    [-15, 18, 3],
  ].forEach(([x, z, h]) => crystalSpire(x, z, h));

  function lantern(x, y, z) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, y, 6), copper);
    pole.position.set(x, y / 2, z);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), crystal);
    lamp.position.set(x, y, z);
    const light = new THREE.PointLight(0xffc07a, 1.15, 11, 2);
    light.position.set(x, y, z);
    scene.add(pole, lamp, light);
    lanterns.push({ lamp, light, phase: Math.random() * Math.PI * 2 });
  }

  [
    [6, 2.8, -10],
    [-7, 2.8, -9],
    [12, 3.1, 6],
    [-12, 3.1, 8],
    [6, 2.9, 16],
    [-6, 2.9, 15],
    [0, 3.4, -18],
  ].forEach(([x, y, z]) => lantern(x, y, z));

  const shardGeo = new THREE.OctahedronGeometry(0.38, 0);
  const shardMat = makeMat(0xe7f7c8, {
    emissive: 0x8fd46a,
    emissiveIntensity: 0.9,
    roughness: 0.25,
  });
  const shardSpots = [
    [0, 1.9, -12],
    [14, 2.3, 2],
    [-14, 2.2, 4],
    [8, 2.1, 14],
    [-9, 2.5, -16],
  ];
  for (const [x, y, z] of shardSpots) {
    const mesh = new THREE.Mesh(shardGeo, shardMat);
    mesh.position.set(x, y, z);
    const glow = new THREE.PointLight(0xb8ff8a, 0.9, 6);
    glow.position.copy(mesh.position);
    scene.add(mesh, glow);
    shards.push({ mesh, glow, taken: false, baseY: y });
  }

  const starGeo = new THREE.BufferGeometry();
  const starCount = 900;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 80 + Math.random() * 40;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * 0.9;
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = 18 + r * Math.cos(phi);
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xf2e6c9, size: 0.18 })));

  const dustGeo = new THREE.BufferGeometry();
  const dustCount = 220;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 50;
    dustPos[i * 3 + 1] = 0.6 + Math.random() * 8;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 50;
  }
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: 0x9fd6c8, size: 0.08, transparent: true, opacity: 0.45 })
  );
  scene.add(dust);

  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(3.4, 16, 16),
    makeMat(0xdfe6ff, { emissive: 0x8899cc, emissiveIntensity: 0.4, roughness: 1 })
  );
  moonMesh.position.set(-26, 32, -18);
  scene.add(moonMesh);
  const moon2 = moonMesh.clone();
  moon2.scale.setScalar(0.45);
  moon2.position.set(22, 28, -30);
  scene.add(moon2);

  function helloGate() {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 320;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#120e18";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#c9b27a";
    ctx.lineWidth = 16;
    ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);
    ctx.fillStyle = "#9fd6c8";
    ctx.font = "600 42px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("WELCOME", 512, 108);
    ctx.fillStyle = "#f4ead8";
    ctx.font = "500 118px serif";
    ctx.fillText("Hello World", 512, 210);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const group = new THREE.Group();
    const boardMat = new THREE.MeshBasicMaterial({ map: texture });
    const boards = new THREE.Group();
    const board = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.5), boardMat);
    const back = board.clone();
    back.rotation.y = Math.PI;
    back.position.z = -0.02;
    boards.add(board, back);
    boards.position.y = 4.35;
    group.add(boards);

    const beam = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.16, 0.22), copper);
    beam.position.y = 5.22;
    group.add(beam);

    const posts = [];
    for (const x of [-2.55, 2.55]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 5.3, 6), copper);
      post.position.set(x, 2.65, 0);
      group.add(post);
      posts.push(post);
    }

    const light = new THREE.PointLight(0x9fd6c8, 0.85, 10, 2);
    light.position.set(0, 4.2, 0.6);
    group.add(light);

    group.position.set(0, 0, 13.2);
    scene.add(group);
    group.updateMatrixWorld(true);
    for (const post of posts) colliders.push(boxCollider(post));

    return { group, light, baseY: 4.35, boards };
  }

  function animate(t) {
    wellInner.rotation.y = t * 0.35;
    wellGlow.intensity = 1.4 + Math.sin(t * 1.6) * 0.5;
    hello.boards.position.y = hello.baseY + Math.sin(t * 1.3) * 0.06;
    hello.light.intensity = 0.7 + Math.sin(t * 1.8) * 0.2;
    for (const shard of shards) {
      if (shard.taken) continue;
      shard.mesh.rotation.y = t * 1.4;
      shard.mesh.position.y = shard.baseY + Math.sin(t * 2 + shard.mesh.position.x) * 0.18;
    }
    for (const l of lanterns) {
      l.light.intensity = 1.0 + Math.sin(t * 2.2 + l.phase) * 0.25;
    }
    dust.rotation.y = t * 0.02;
  }

  return { colliders, shards, animate, wellLight };
}
