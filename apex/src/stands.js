import { pointAt } from "./track.js";

export const STAND_ROWS = 6;
export const STAND_LENGTH = 32;
export const STAND_DEPTH = 0.92;
export const STAND_STEP = 1.12;
export const STAND_RISE = 0.46;

// Two stands on the front straight, one each side of the wall, staggered so the roofs do not meet.
export function standSites() {
  return [
    { t: 0.03, side: 1 },
    { t: 0.078, side: -1 },
  ];
}

// Local -X runs away from the asphalt. side > 0 keeps local +Z pointing down the track;
// the opposite stand is turned around so -X is still the outside.
export function standPose(track, site) {
  const p = pointAt(track, site.t);
  const gap = 2.5;
  const lat = site.side * (track.limit + gap);
  const rotation = site.side > 0 ? p.heading : p.heading + Math.PI;
  return {
    x: p.x + p.nx * lat,
    y: 0,
    z: p.z + p.nz * lat,
    rotation,
    side: site.side,
  };
}

export function localToWorld(pose, x, y, z) {
  const c = Math.cos(pose.rotation);
  const s = Math.sin(pose.rotation);
  return {
    x: pose.x + x * c + z * s,
    y: pose.y + y,
    z: pose.z - x * s + z * c,
  };
}

export function standPieces() {
  const pieces = [];
  const length = STAND_LENGTH;
  for (let row = 0; row < STAND_ROWS; row += 1) {
    const x = -(STAND_DEPTH / 2 + row * STAND_STEP);
    const y = 0.34 + row * STAND_RISE;
    pieces.push({ name: "deck", row, x, y, z: 0, sx: STAND_DEPTH, sy: 0.22, sz: length });
    pieces.push({
      name: "cushion",
      row,
      x: x + 0.14,
      y: y + 0.2,
      z: 0,
      sx: 0.42,
      sy: 0.1,
      sz: length - 1.2,
    });
    pieces.push({
      name: "back",
      row,
      x: x - STAND_DEPTH / 2 - 0.07,
      y: y + 0.3,
      z: 0,
      sx: 0.08,
      sy: 0.42,
      sz: length - 1.2,
    });
  }
  const span = STAND_DEPTH + (STAND_ROWS - 1) * STAND_STEP + 1.15;
  const roofY = 0.34 + (STAND_ROWS - 1) * STAND_RISE + 1.55;
  pieces.push({
    name: "roof",
    row: -1,
    x: -span / 2 + 0.2,
    y: roofY,
    z: 0,
    sx: span,
    sy: 0.14,
    sz: length + 1.6,
  });
  pieces.push({
    name: "plinth",
    row: -1,
    x: -(span * 0.45),
    y: 0.1,
    z: 0,
    sx: span * 0.9,
    sy: 0.18,
    sz: length + 0.6,
  });
  return pieces;
}

export function pieceCorners(piece) {
  const corners = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        corners.push({
          x: piece.x + (sx * piece.sx) / 2,
          y: piece.y + (sy * piece.sy) / 2,
          z: piece.z + (sz * piece.sz) / 2,
        });
      }
    }
  }
  return corners;
}
