import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { pointAt } from "./track.js";

export function createWorld(renderer, track, quality) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070910);
  scene.fog = new THREE.FogExp2(0x0c121c, 0.0028);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.045).texture;
  pmrem.dispose();

  scene.add(skyDome());
  scene.add(stars());
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(9, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff6e4, fog: false }),
  );
  moon.position.set(-220, 150, -40);
  scene.add(moon);

  const hemi = new THREE.HemisphereLight(0x8ea4d6, 0x1a120c, 0.72);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xd5e2ff, 3.4);
  sun.position.set(40, 54, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
  sun.shadow.camera.near = 8;
  sun.shadow.camera.far = 130;
  sun.shadow.camera.left = -42;
  sun.shadow.camera.right = 42;
  sun.shadow.camera.top = 42;
  sun.shadow.camera.bottom = -42;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xffa56a, 0.55);
  fill.position.set(-30, 10, -24);
  scene.add(fill);

  const groundMat = new THREE.MeshStandardMaterial({ color: 0x101612, roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(720, 40), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.4;
  ground.receiveShadow = true;
  scene.add(ground);

  const asphalt = trackTexture(renderer);
  const asphaltMat = new THREE.MeshStandardMaterial({
    map: asphalt,
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  scene.add(ribbon(track, { lateral: 0, width: track.width, y: 0.02, meters: 10, material: asphaltMat, shadow: true }));

  const runoffMat = new THREE.MeshStandardMaterial({ color: 0x2a3328, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  const curbMat = curbMaterial(renderer);
  const curbWidth = 0.85;
  [-1, 1].forEach((side) => {
    const edge = side * (track.half + curbWidth / 2);
    scene.add(ribbon(track, {
      lateral: edge,
      width: curbWidth,
      y: 0.045,
      meters: 4,
      material: curbMat,
    }));
    const runoffInner = side * (track.half + curbWidth);
    const runoffOuter = side * track.limit;
    const runoffWidth = Math.abs(runoffOuter - runoffInner);
    scene.add(ribbon(track, {
      lateral: (runoffInner + runoffOuter) / 2,
      width: runoffWidth,
      y: 0.012,
      meters: 20,
      material: runoffMat,
      shadow: true,
    }));
    scene.add(wall(track, side));
  });

  scene.add(startLine(track, renderer));
  const lamps = gantry(scene, track);
  addLamps(scene, track, quality);
  addReflectors(scene, track);
  addTrees(scene, track, quality.trees);
  addCity(scene, track, quality.city);
  addCranes(scene, track);

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x08283c,
    map: waveTexture(renderer),
    roughness: 0.18,
    metalness: 0.82,
    transparent: true,
    opacity: 0.94,
    envMapIntensity: 1.1,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(920, 360), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(30, -0.15, track.minZ - 230);
  scene.add(water);

  return {
    scene,
    lamps,
    update(target, time) {
      sun.position.set(target.x + 30, 52, target.z + 16);
      sun.target.position.set(target.x, 0, target.z);
      waterMat.map.offset.x = time * 0.012;
      waterMat.map.offset.y = time * 0.007;
    },
  };
}

export function paintStart(lamps, state) {
  lamps.forEach((mat, index) => {
    const on = state.green || index < state.red;
    mat.emissive.set(state.green ? 0x37f28a : 0xff2d2d);
    mat.emissiveIntensity = on ? (state.green ? 8 : 6) : 0.12;
  });
}

function skyDome() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x07101f) },
      horizon: { value: new THREE.Color(0x1a120c) },
      glow: { value: new THREE.Color(0xff8a3c) },
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
      uniform vec3 horizon;
      uniform vec3 glow;
      void main() {
        float h = normalize(vPos).y;
        vec3 col = mix(horizon, top, smoothstep(-0.04, 0.28, h));
        float band = exp(-pow(h * 22.0, 2.0));
        col = mix(col, glow, band * 0.72);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(560, 28, 16), material);
  mesh.frustumCulled = false;
  return mesh;
}

function stars() {
  const count = 280;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const theta = Math.random() * Math.PI * 2;
    const y = 0.15 + Math.random() * 0.85;
    const ring = Math.sqrt(1 - y * y);
    const radius = 420;
    positions[i * 3] = Math.cos(theta) * ring * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(theta) * ring * radius;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xe7eeff, size: 1.5, sizeAttenuation: true, fog: false });
  return new THREE.Points(geo, mat);
}

function ribbon(track, spec) {
  const samples = track.samples;
  const n = samples.length;
  const positions = new Float32Array((n + 1) * 6);
  const normals = new Float32Array((n + 1) * 6);
  const uvs = new Float32Array((n + 1) * 4);
  const indices = new Uint32Array(n * 6);
  const half = spec.width / 2;
  const repeat = track.length / spec.meters;
  for (let i = 0; i <= n; i += 1) {
    const s = samples[i % n];
    const left = spec.lateral + half;
    const right = spec.lateral - half;
    const v = (i / n) * repeat;
    const o = i * 2;
    positions.set([s.x + s.nx * left, spec.y, s.z + s.nz * left], o * 3);
    positions.set([s.x + s.nx * right, spec.y, s.z + s.nz * right], (o + 1) * 3);
    normals.set([0, 1, 0, 0, 1, 0], o * 3);
    uvs.set([0, v, 1, v], o * 2);
  }
  for (let i = 0; i < n; i += 1) {
    const a = i * 2;
    indices.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], i * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  const mesh = new THREE.Mesh(geo, spec.material);
  mesh.receiveShadow = Boolean(spec.shadow);
  return mesh;
}

function wall(track, side) {
  const samples = track.samples;
  const n = samples.length;
  const positions = new Float32Array((n + 1) * 6);
  const normals = new Float32Array((n + 1) * 6);
  const uvs = new Float32Array((n + 1) * 4);
  const indices = new Uint32Array(n * 6);
  const lat = side * (track.limit + 0.15);
  const repeat = track.length / 6;
  for (let i = 0; i <= n; i += 1) {
    const s = samples[i % n];
    const x = s.x + s.nx * lat;
    const z = s.z + s.nz * lat;
    const nx = -side * s.nx;
    const nz = -side * s.nz;
    const o = i * 2;
    positions.set([x, 0.02, z, x, 0.96, z], o * 3);
    normals.set([nx, 0, nz, nx, 0, nz], o * 3);
    const along = (i / n) * repeat;
    uvs.set([along, 0, along, 1], o * 2);
  }
  for (let i = 0; i < n; i += 1) {
    const a = i * 2;
    indices.set([a, a + 1, a + 2, a + 2, a + 1, a + 3], i * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  const mesh = new THREE.Mesh(geo, barrierMaterial());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function startLine(track, renderer) {
  const a = pointAt(track, 0);
  const b = pointAt(track, 0.006);
  const positions = [];
  const uvs = [];
  const left = track.half - 0.4;
  for (const [p, v] of [[a, 0], [b, 1]]) {
    positions.push(p.x + p.nx * left, 0.055, p.z + p.nz * left, p.x - p.nx * left, 0.055, p.z - p.nz * left);
    const across = (left * 2) / 1.35;
    uvs.push(0, v * 4, across, v * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex([0, 2, 1, 1, 2, 3]);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    map: checkerTexture(renderer),
    roughness: 0.7,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function gantry(scene, track) {
  const p = pointAt(track, 0.002);
  const group = new THREE.Group();
  group.position.set(p.x, 0, p.z);
  group.rotation.y = p.heading;
  const steel = new THREE.MeshStandardMaterial({ color: 0x23262c, metalness: 0.7, roughness: 0.38 });
  const span = track.width + 4;
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.45, 5.2, 0.45), steel);
  left.position.set(-span / 2, 2.6, 0);
  const right = left.clone();
  right.position.x = span / 2;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span, 0.38, 0.55), steel);
  beam.position.y = 5.15;
  group.add(left, right, beam);
  const lamps = [];
  for (let i = 0; i < 5; i += 1) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1a0505,
      emissive: 0xff2d2d,
      emissiveIntensity: 0.12,
    });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.28), mat);
    lamp.position.set(-1.6 + i * 0.8, 4.7, 0.15);
    group.add(lamp);
    lamps.push(mat);
  }
  scene.add(group);
  return lamps;
}

function addLamps(scene, track, quality) {
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 5.2, 6);
  const headGeo = new THREE.SphereGeometry(0.28, 10, 8);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2e34, metalness: 0.6, roughness: 0.4 });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xffd7a2,
    emissive: 0xffb15a,
    emissiveIntensity: 4.5,
  });
  const spacing = quality.phone ? 42 : 30;
  const spots = [];
  let last = -999;
  for (const sample of track.samples) {
    const delta = sample.s - last;
    if (delta < spacing && last >= 0) continue;
    if (sample.z < track.minZ + 12) continue;
    last = sample.s;
    spots.push(sample);
  }
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length * 2);
  const heads = new THREE.InstancedMesh(headGeo, headMat, spots.length * 2);
  const dummy = new THREE.Object3D();
  let n = 0;
  for (const sample of spots) {
    for (const side of [-1, 1]) {
      const x = sample.x + sample.nx * side * (track.limit + 1.4);
      const z = sample.z + sample.nz * side * (track.limit + 1.4);
      dummy.position.set(x, 2.6, z);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      poles.setMatrixAt(n, dummy.matrix);
      dummy.position.y = 5.35;
      dummy.updateMatrix();
      heads.setMatrixAt(n, dummy.matrix);
      n += 1;
    }
  }
  poles.castShadow = !quality.phone;
  poles.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  scene.add(poles, heads);
}

function addReflectors(scene, track) {
  const geo = new THREE.BoxGeometry(0.18, 0.06, 0.28);
  const mat = new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffe7a8, emissiveIntensity: 2.4 });
  const count = Math.floor(track.length / 16);
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i += 1) {
    const p = pointAt(track, (i * 16) / track.length);
    dummy.position.set(p.x, 0.06, p.z);
    dummy.rotation.y = p.heading;
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}

function addTrees(scene, track, count) {
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1.4, 5);
  const crownGeo = new THREE.ConeGeometry(1.15, 4.2, 7);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 1 });
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x173024, roughness: 0.95 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, count);
  const dummy = new THREE.Object3D();
  let placed = 0;
  for (let n = 0; placed < count && n < count * 12; n += 1) {
    const t = (n * 0.381) % 1;
    const side = n % 4 === 0 ? -1 : 1;
    const dist = track.half + 9 + (n % 6) * 2.4;
    const p = pointAt(track, t);
    const x = p.x + p.nx * side * dist;
    const z = p.z + p.nz * side * dist;
    if (z < track.minZ + 18) continue;
    const scale = 0.85 + (n % 5) * 0.18;
    dummy.position.set(x, 0.7, z);
    dummy.scale.set(1, scale, 1);
    dummy.rotation.set(0, n, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    dummy.position.y = 2.4 * scale;
    dummy.updateMatrix();
    crowns.setMatrixAt(placed, dummy.matrix);
    placed += 1;
  }
  trunks.count = placed;
  crowns.count = placed;
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  scene.add(trunks, crowns);
}

function addCity(scene, track, count) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x10141c,
    roughness: 0.84,
    metalness: 0.18,
    emissive: 0xffffff,
    emissiveMap: windowTexture(),
    emissiveIntensity: 1.7,
  });
  const group = new THREE.Group();
  for (let i = 0; i < count; i += 1) {
    const w = 10 + (i % 4) * 4;
    const d = 10 + (i % 3) * 3;
    const h = 16 + ((i * 53) % 78);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    const col = i % 7;
    const row = Math.floor(i / 7);
    mesh.position.set(track.minX + 30 + col * 32, h / 2, track.maxZ + 48 + row * 28);
    group.add(mesh);
  }
  scene.add(group);
}

function addCranes(scene, track) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xd1612c, roughness: 0.55, metalness: 0.35 });
  [40, 130, -30].forEach((x, index) => {
    const group = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.1, 26, 1.1), mat);
    tower.position.y = 13;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(24, 0.55, 1), mat);
    arm.position.set(index === 2 ? -8 : 9, 25.4, 0);
    group.add(tower, arm);
    group.position.set(x, 0, track.minZ - 28);
    scene.add(group);
  });
}

function trackTexture(renderer) {
  return paintTexture(renderer, 512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#23262c";
    ctx.fillRect(0, 0, w, h);
    const image = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < image.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 18;
      image.data[i] = clampByte(image.data[i] + n);
      image.data[i + 1] = clampByte(image.data[i + 1] + n);
      image.data[i + 2] = clampByte(image.data[i + 2] + n + 2);
    }
    ctx.putImageData(image, 0, 0);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(34, 0);
    ctx.lineTo(34, h);
    ctx.moveTo(w - 34, 0);
    ctx.lineTo(w - 34, h);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    for (let y = 0; y < h; y += 56) ctx.fillRect(w / 2 - 4, y, 8, 28);
  });
}

function curbMaterial(renderer) {
  const map = paintTexture(renderer, 64, 128, (ctx, w, h) => {
    for (let y = 0; y < h; y += 16) {
      ctx.fillStyle = (y / 16) % 2 === 0 ? "#e8e4dc" : "#d21f2a";
      ctx.fillRect(0, y, w, 16);
    }
  });
  return new THREE.MeshStandardMaterial({ map, roughness: 0.62, metalness: 0.05, side: THREE.DoubleSide });
}

function barrierMaterial() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#3a3e46";
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = "#d9dde4";
  ctx.fillRect(0, 14, 64, 8);
  ctx.fillRect(0, 40, 64, 8);
  ctx.fillStyle = "#8d939c";
  ctx.fillRect(0, 24, 64, 3);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  return new THREE.MeshStandardMaterial({ map, roughness: 0.48, metalness: 0.62, side: THREE.DoubleSide });
}

function checkerTexture(renderer) {
  return paintTexture(renderer, 128, 32, (ctx, w, h) => {
    const size = 16;
    for (let y = 0; y < h; y += size) {
      for (let x = 0; x < w; x += size) {
        ctx.fillStyle = ((x + y) / size) % 2 === 0 ? "#f5f5f5" : "#111111";
        ctx.fillRect(x, y, size, size);
      }
    }
  });
}

function waveTexture(renderer) {
  return paintTexture(renderer, 256, 256, (ctx, w, h) => {
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const wave = Math.sin(x * 0.09) * Math.sin(y * 0.07);
        const i = (y * w + x) * 4;
        image.data[i] = 8 + wave * 10;
        image.data[i + 1] = 28 + wave * 16;
        image.data[i + 2] = 48 + wave * 18;
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }, 4, 4);
}

function windowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#07080c";
  ctx.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 128; y += 8) {
    for (let x = 4; x < 64; x += 8) {
      if (Math.random() > 0.42) continue;
      ctx.fillStyle = Math.random() > 0.2 ? "#ffe1b0" : "#9fd0ff";
      ctx.fillRect(x, y, 3, 4);
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1.5, 3);
  return map;
}

function paintTexture(renderer, w, h, draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d"), w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, value));
}
