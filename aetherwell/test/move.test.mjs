import assert from "node:assert/strict";
import test from "node:test";
import {
  applyGravityAndJump,
  canWake,
  JUMP_BUFFER,
  JUMP_SPEED,
  PLAYER_HEIGHT,
  promptFor,
  resolveFloor,
} from "../src/move.js";

test("a short frame does not cancel an upward jump against the floor", () => {
  const jumped = applyGravityAndJump({
    velY: 0,
    grounded: true,
    coyote: 0,
    jumpBuffer: JUMP_BUFFER,
    dt: 1 / 240,
  });
  assert.equal(jumped.jumped, true);
  assert.equal(jumped.velY, JUMP_SPEED);

  const feet = PLAYER_HEIGHT;
  const after = feet + jumped.velY * (1 / 240);
  const snapped = resolveFloor(after - PLAYER_HEIGHT, 0, jumped.velY);
  assert.equal(snapped.grounded, false);
  assert.ok(snapped.velY > 0);
  assert.ok(snapped.feetY > 0);
});

test("falling onto a floor still lands and can jump again", () => {
  const land = resolveFloor(-0.02, 0, -2);
  assert.equal(land.grounded, true);
  assert.equal(land.feetY, 0);
  assert.equal(land.velY, 0);
});

test("prompts walk the player through waking the well", () => {
  assert.equal(promptFor({ collected: 2, nearShard: true, nearWell: false, awake: false }), "Press E to gather the wellshard");
  assert.equal(promptFor({ collected: 5, nearShard: false, nearWell: false, awake: false }), "Return to the well");
  assert.equal(promptFor({ collected: 5, nearShard: false, nearWell: true, awake: false }), "Press E to wake the well");
  assert.equal(promptFor({ collected: 5, nearShard: false, nearWell: true, awake: true }), "The well is awake.");
});

test("the well only wakes with five shards, proximity, and E", () => {
  assert.equal(canWake({ collected: 5, nearWell: true, interact: true, awake: false }), true);
  assert.equal(canWake({ collected: 4, nearWell: true, interact: true, awake: false }), false);
  assert.equal(canWake({ collected: 5, nearWell: false, interact: true, awake: false }), false);
  assert.equal(canWake({ collected: 5, nearWell: true, interact: false, awake: false }), false);
  assert.equal(canWake({ collected: 5, nearWell: true, interact: true, awake: true }), false);
});
