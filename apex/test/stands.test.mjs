import assert from "node:assert/strict";
import test from "node:test";
import {
  localToWorld,
  pieceCorners,
  standPieces,
  standPose,
  standSites,
  STAND_LENGTH,
} from "../src/stands.js";
import { buildHarbor, project } from "../src/track.js";

test("grandstand seats stay outside the wall and run along the track", () => {
  const track = buildHarbor();
  const pieces = standPieces();
  const decks = pieces.filter((piece) => piece.name === "deck");
  assert.equal(decks.length, 6);

  for (const site of standSites()) {
    const pose = standPose(track, site);
    let closest = Infinity;
    for (const piece of pieces) {
      for (const corner of pieceCorners(piece)) {
        const world = localToWorld(pose, corner.x, corner.y, corner.z);
        const proj = project(track, world.x, world.z);
        closest = Math.min(closest, Math.abs(proj.lateral));
        assert.ok(corner.y >= -0.01, `${piece.name} dips underground`);
      }
    }
    assert.ok(closest > track.limit + 0.8, `stand reaches ${closest.toFixed(2)}, wall is ${track.limit}`);

    const deck = decks[0];
    const nose = localToWorld(pose, deck.x, deck.y, STAND_LENGTH / 2);
    const tail = localToWorld(pose, deck.x, deck.y, -STAND_LENGTH / 2);
    const along = project(track, nose.x, nose.z);
    const dx = nose.x - tail.x;
    const dz = nose.z - tail.z;
    const parallel = Math.abs(dx * along.tx + dz * along.tz);
    const across = Math.abs(dx * along.nx + dz * along.nz);
    assert.ok(parallel > across * 4, `seats cut across the road (${parallel.toFixed(1)} vs ${across.toFixed(1)})`);
  }
});

test("seat rows do not intersect each other", () => {
  const solid = standPieces().filter((piece) => piece.name !== "roof");
  for (let i = 0; i < solid.length; i += 1) {
    for (let j = i + 1; j < solid.length; j += 1) {
      const overlap = overlapAmount(solid[i], solid[j]);
      assert.ok(overlap < 0.02, `${solid[i].name} row ${solid[i].row} hits ${solid[j].name} row ${solid[j].row} by ${overlap.toFixed(3)}`);
    }
  }
});

function overlapAmount(a, b) {
  const axes = ["x", "y", "z"];
  const size = { x: "sx", y: "sy", z: "sz" };
  let deepest = Infinity;
  for (const axis of axes) {
    const gap = Math.abs(a[axis] - b[axis]) - (a[size[axis]] + b[size[axis]]) / 2;
    deepest = Math.min(deepest, -gap);
  }
  return deepest;
}
