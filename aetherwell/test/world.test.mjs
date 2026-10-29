import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { buildWorld } from "../src/world.js";

test("awakening the well changes the night into a lit mesa", () => {
  const scene = new THREE.Scene();
  const world = buildWorld(scene);
  assert.equal(world.isAwake(), false);
  const before = world.wellLight.intensity;
  world.awaken();
  world.awaken();
  assert.equal(world.isAwake(), true);
  assert.ok(world.wellLight.intensity > before);
  assert.ok(world.wellLight.intensity > 10);
});
