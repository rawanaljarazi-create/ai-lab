import assert from "node:assert/strict";
import test from "node:test";
import { againFor, hintFor, inFrame, isPhone, project, viewFor } from "../src/view.js";

const bird = { x: 0, y: 0.55, z: 0 };
const tail = { x: -0.9, y: 0.4, z: 0 };
const pipe = { x: 8.8, y: 0.4, z: 0 };
const ground = { x: 1, y: -3.05, z: 0 };

test("a tall phone keeps the bird, its tail, the next pipe, and the ground on screen", () => {
  const aspect = 390 / 844;
  const view = viewFor(aspect);
  assert.equal(view.narrow, true);
  for (const point of [bird, tail, pipe, ground]) {
    assert.equal(inFrame(project(view, aspect, point)), true);
  }
  const placed = project(view, aspect, bird);
  assert.ok(placed.x < -0.2);
  const settled = project(view, aspect, { x: 0.15, y: -2.83, z: 0 });
  const beak = project(view, aspect, { x: 0.45, y: -3.15, z: 0.1 });
  assert.equal(inFrame(settled), true);
  assert.equal(inFrame(beak), true);
  assert.ok(settled.y > -0.8);
});

test("a wide screen keeps the side view, with the bird left of center", () => {
  const aspect = 16 / 9;
  const view = viewFor(aspect);
  assert.equal(view.narrow, false);
  const placed = project(view, aspect, bird);
  assert.equal(inFrame(placed), true);
  assert.ok(placed.x < -0.1);
  assert.equal(inFrame(project(view, aspect, pipe)), true);
  assert.equal(inFrame(project(view, aspect, ground)), true);
});

test("a phone turned sideways still shows the bird and the ground", () => {
  const aspect = 844 / 390;
  const view = viewFor(aspect);
  assert.equal(view.narrow, false);
  assert.equal(inFrame(project(view, aspect, bird)), true);
  assert.equal(inFrame(project(view, aspect, ground)), true);
});

test("hints name a tap on a phone and a click on a desk", () => {
  assert.equal(hintFor(true), "Tap anywhere");
  assert.equal(hintFor(false), "Click, tap, or space");
  assert.equal(againFor(true), "Tap to fly again");
  assert.equal(againFor(false), "Tap or space to fly again");
});

test("a coarse touch screen counts as a phone", () => {
  const phone = isPhone({ maxTouchPoints: 5 }, (query) => ({ matches: query === "(pointer: coarse)" }));
  const desk = isPhone({ maxTouchPoints: 0 }, () => ({ matches: false }));
  assert.equal(phone, true);
  assert.equal(desk, false);
});
