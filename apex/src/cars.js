import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const CARBON = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.58, metalness: 0.42 });
const RUBBER = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.92, metalness: 0.05 });
const METAL = new THREE.MeshStandardMaterial({ color: 0xc5ccd4, roughness: 0.28, metalness: 0.86 });
const GLASS_FLAT = new THREE.MeshStandardMaterial({
  color: 0xb7c9d8,
  transparent: true,
  opacity: 0.45,
  roughness: 0.06,
  metalness: 0.12,
});

export function createCarView(color, number, { transmission = true, headlights = false } = {}) {
  const root = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    metalness: 0.78,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.35,
  });
  const glass = transmission
    ? new THREE.MeshPhysicalMaterial({
      color: 0xd5e4ef,
      metalness: 0.05,
      roughness: 0.08,
      transparent: true,
      opacity: 0.55,
      envMapIntensity: 1.4,
    })
    : GLASS_FLAT;
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff6df,
    emissive: 0xfff1c9,
    emissiveIntensity: 3.2,
    roughness: 0.25,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x2a0000,
    emissive: 0xff2218,
    emissiveIntensity: 1.6,
    roughness: 0.35,
  });

  const body = rounded(1.92, 0.42, 4.05, paint, 0.14);
  body.position.set(0, 0.46, 0.05);
  const hood = rounded(1.52, 0.16, 1.45, paint, 0.08);
  hood.position.set(0, 0.66, 1.15);
  hood.rotation.x = -0.2;
  const tail = rounded(1.72, 0.16, 1.15, paint, 0.08);
  tail.position.set(0, 0.66, -1.28);
  const cabin = rounded(1.42, 0.4, 1.55, glass, 0.16);
  cabin.position.set(0, 0.86, -0.18);
  cabin.castShadow = false;
  const wing = box(1.7, 0.045, 0.42, CARBON);
  wing.position.set(0, 1.08, -1.95);
  const wingL = box(0.04, 0.28, 0.32, CARBON);
  wingL.position.set(-0.7, 0.9, -1.92);
  const wingR = wingL.clone();
  wingR.position.x = 0.7;
  const flareGeo = new RoundedBoxGeometry(0.46, 0.18, 0.7, 2, 0.08);
  const flares = [[-0.78, 1.32], [0.78, 1.32], [-0.78, -1.32], [0.78, -1.32]].map(([x, z]) => {
    const flare = new THREE.Mesh(flareGeo, CARBON);
    flare.position.set(x, 0.58, z);
    return flare;
  });
  const splitter = box(1.72, 0.035, 0.32, CARBON);
  splitter.position.set(0, 0.24, 2.12);
  const skirtL = box(0.06, 0.08, 2.4, CARBON);
  skirtL.position.set(-0.96, 0.28, 0.1);
  const skirtR = skirtL.clone();
  skirtR.position.x = 0.96;
  const diffuser = box(1.2, 0.1, 0.28, CARBON);
  diffuser.position.set(0, 0.28, -2.05);

  const headL = box(0.32, 0.1, 0.08, headMat);
  headL.position.set(-0.52, 0.48, 2.02);
  const headR = headL.clone();
  headR.position.x = 0.52;
  const tailBar = box(1.55, 0.08, 0.06, tailMat);
  tailBar.position.set(0, 0.58, -1.96);
  const tailL = box(0.22, 0.1, 0.06, tailMat);
  tailL.position.set(-0.72, 0.62, -1.96);
  const tailR = tailL.clone();
  tailR.position.x = 0.72;

  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.28), new THREE.MeshBasicMaterial({ map: plateTexture(number) }));
  plate.position.set(0, 0.46, -2.08);
  plate.rotation.y = Math.PI;

  const exhaustGeo = new THREE.CylinderGeometry(0.055, 0.07, 0.14, 10);
  exhaustGeo.rotateX(Math.PI / 2);
  const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, metalness: 0.8, roughness: 0.35 });
  const exhaustL = new THREE.Mesh(exhaustGeo, exhaustMat);
  exhaustL.position.set(-0.38, 0.3, -2.12);
  const exhaustR = exhaustL.clone();
  exhaustR.position.x = 0.38;

  root.add(body, hood, tail, cabin, wing, wingL, wingR, splitter, skirtL, skirtR, diffuser, ...flares);
  root.add(headL, headR, tailBar, tailL, tailR, plate, exhaustL, exhaustR);

  const wheels = [];
  const front = [];
  [[-0.86, 1.38], [0.86, 1.38], [-0.86, -1.38], [0.86, -1.38]].forEach(([x, z], index) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.34, z);
    const wheel = makeWheel();
    pivot.add(wheel);
    root.add(pivot);
    wheels.push(wheel);
    if (index < 2) front.push(pivot);
  });

  const target = new THREE.Object3D();
  target.position.set(0, 0.35, 16);
  const spotL = new THREE.SpotLight(0xfff4d2, 220, 70, 0.52, 0.55, 1.35);
  spotL.position.set(-0.42, 0.55, 2.05);
  spotL.target = target;
  spotL.castShadow = false;
  const spotR = spotL.clone();
  spotR.position.x = 0.42;
  spotR.target = target;
  if (headlights) root.add(target, spotL, spotR);

  root.traverse((node) => {
    if (node.isMesh && node.material !== glass) node.castShadow = true;
  });
  cabin.castShadow = false;
  plate.castShadow = false;

  return {
    root,
    wheels,
    front,
    tails: [tailBar, tailL, tailR],
    tailMat,
    spots: [spotL, spotR],
    setLights(on) {
      if (headlights) {
        const intensity = on ? 220 : 12;
        spotL.intensity = intensity;
        spotR.intensity = intensity;
      }
      headMat.emissiveIntensity = on ? 4.2 : 0.45;
    },
  };
}

export function syncCarView(view, car, dt, braking) {
  view.root.position.set(car.x, 0, car.z);
  view.root.rotation.y = car.heading;
  const spin = (car.speed / 0.34) * dt;
  for (const wheel of view.wheels) wheel.rotation.x -= spin;
  for (const pivot of view.front) pivot.rotation.y = car.steer;
  view.tailMat.emissiveIntensity = braking ? 7 : 1.7;
}

function makeWheel() {
  const tireGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 18);
  tireGeo.rotateZ(Math.PI / 2);
  const tire = new THREE.Mesh(tireGeo, RUBBER);
  const rimGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.28, 12);
  rimGeo.rotateZ(Math.PI / 2);
  tire.add(new THREE.Mesh(rimGeo, METAL));
  tire.castShadow = true;
  return tire;
}

function box(width, height, depth, material) {
  return new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
}

function rounded(width, height, depth, material, radius) {
  return new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 3, radius), material);
}

function plateTexture(number) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 80;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f4f1ea";
  ctx.fillRect(0, 0, 128, 80);
  ctx.fillStyle = "#161616";
  ctx.font = "700 54px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(number), 64, 44);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
