import assert from "node:assert/strict";
import test from "node:test";
import { createGrid, decode, EMPTY, encode, fill, get, mirrorX, paint } from "../src/grid.js";

test("a new grid is empty", () => {
  const g = createGrid(4);
  assert.equal(g.cells.length, 16);
  assert.ok(g.cells.every((c) => c === EMPTY));
});

test("paint sets one cell and leaves the original untouched", () => {
  const g = createGrid(4);
  const h = paint(g, 1, 2, 3);
  assert.equal(get(h, 1, 2), 3);
  assert.equal(get(g, 1, 2), EMPTY);
  assert.equal(paint(g, 9, 9, 3), g);
});

test("fill stops at a wall of another color", () => {
  let g = createGrid(4);
  for (let y = 0; y < 4; y++) g = paint(g, 2, y, 1);
  g = fill(g, 0, 0, 5);
  assert.equal(get(g, 1, 3), 5);
  assert.equal(get(g, 2, 0), 1);
  assert.equal(get(g, 3, 0), EMPTY);
});

test("mirror flips across the middle", () => {
  assert.equal(mirrorX(0, 16), 15);
  assert.equal(mirrorX(15, 16), 0);
});

test("encode and decode round-trip, and bad text is rejected", () => {
  const g = paint(paint(createGrid(3), 0, 0, 15), 2, 2, 0);
  assert.deepEqual(decode(encode(g)), g);
  assert.equal(decode("3:..."), null);
  assert.equal(decode("nonsense"), null);
});
