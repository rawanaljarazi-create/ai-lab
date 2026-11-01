import assert from "node:assert/strict";
import test from "node:test";
import { activeTracks, clampBpm, createPattern, decode, demoPattern, encode, nextStep, STEPS, stepSeconds, toggle, TRACKS } from "../src/sequencer.js";

test("a new pattern is silent", () => {
  const p = createPattern();
  assert.equal(p.length, TRACKS.length);
  assert.ok(p.every((row) => row.length === STEPS && row.every((on) => !on)));
});

test("toggle flips one cell without mutating the original", () => {
  const p = createPattern();
  const q = toggle(p, 2, 5);
  assert.equal(q[2][5], true);
  assert.equal(p[2][5], false);
  assert.equal(toggle(q, 2, 5)[2][5], false);
});

test("tempo is clamped and converted to sixteenth notes", () => {
  assert.equal(clampBpm(10), 60);
  assert.equal(clampBpm(999), 180);
  assert.equal(clampBpm("abc"), 110);
  assert.equal(stepSeconds(120), 0.125);
});

test("the playhead wraps after sixteen steps", () => {
  assert.equal(nextStep(0), 1);
  assert.equal(nextStep(STEPS - 1), 0);
});

test("active tracks lists every hit on a step", () => {
  const p = demoPattern();
  assert.deepEqual(activeTracks(p, 0), [0, 4]);
  assert.deepEqual(activeTracks(p, 1), []);
});

test("patterns survive a round trip through the link", () => {
  const p = demoPattern();
  const text = encode(p);
  assert.equal(text.length, TRACKS.length * 4);
  assert.deepEqual(decode(text), p);
});

test("a broken link falls back to a blank pattern", () => {
  assert.deepEqual(decode("nope"), createPattern());
  assert.deepEqual(decode(""), createPattern());
});
