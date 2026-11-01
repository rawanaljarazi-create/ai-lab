const WIDE_HALF_H = (36 * Math.PI) / 180;

export function viewFor(aspect) {
  const safe = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  if (safe < 0.9) {
    return {
      narrow: true,
      fov: 74,
      cam: { x: -6.2, y: 0.95, z: 1.55 },
      look: { x: 5.8, y: -0.85, z: 0 },
    };
  }
  const halfV = Math.atan(Math.tan(WIDE_HALF_H) / safe);
  return {
    narrow: false,
    fov: clamp((halfV * 360) / Math.PI, 40, 78),
    cam: { x: -1.15, y: 0.55, z: 11.15 },
    look: { x: 1.9, y: 0.2, z: 0 },
  };
}

export function project(view, aspect, point) {
  const forward = normalize(sub(view.look, view.cam));
  const right = normalize(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = cross(right, forward);
  const rel = sub(point, view.cam);
  const x = dot(rel, right);
  const y = dot(rel, up);
  const depth = dot(rel, forward);
  const halfV = (view.fov * Math.PI) / 360;
  const halfH = Math.atan(Math.tan(halfV) * aspect);
  return {
    x: x / (depth * Math.tan(halfH)),
    y: y / (depth * Math.tan(halfV)),
    ahead: depth > 0.2,
  };
}

export function inFrame(projected) {
  return projected.ahead && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1;
}

export function isPhone(nav = globalThis.navigator, match = globalThis.matchMedia) {
  const coarse = typeof match === "function" ? match("(pointer: coarse)")?.matches === true : false;
  return coarse && (nav?.maxTouchPoints || 0) > 0;
}

export function hintFor(phone) {
  return phone ? "Tap anywhere" : "Click, tap, or space";
}

export function againFor(phone) {
  return phone ? "Tap to fly again" : "Tap or space to fly again";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(v) {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}
