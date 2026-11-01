import assert from "node:assert/strict";
import test from "node:test";
import { WORDS, createRng, generateWords } from "../src/words.js";

test("the word bank is a list of plain lowercase words", () => {
  assert.ok(WORDS.length >= 180);
  assert.equal(new Set(WORDS).size, WORDS.length);
  for (const word of WORDS) {
    assert.match(word, /^[a-z]{2,12}$/);
  }
});

test("a seeded generator is stable and stays inside the bank", () => {
  const first = generateWords({ count: 8, rng: createRng(42) });
  const second = generateWords({ count: 8, rng: createRng(42) });
  assert.deepEqual(first, second);
  for (const word of first) assert.ok(WORDS.includes(word));
});

test("different seeds can disagree, and a custom bank is honored", () => {
  const alpha = generateWords({ count: 6, rng: createRng(1) }).join(" ");
  const beta = generateWords({ count: 6, rng: createRng(2) }).join(" ");
  assert.notEqual(alpha, beta);
  const picked = generateWords({ count: 4, rng: () => 0, bank: ["ink", "lamp"] });
  assert.deepEqual(picked, ["ink", "ink", "ink", "ink"]);
});

test("the generator rejects a bad count, rng, or bank", () => {
  assert.throws(() => generateWords({ count: 0, rng: () => 0 }), /positive integer/);
  assert.throws(() => generateWords({ count: 3 }), /rng is required/);
  assert.throws(() => generateWords({ count: 3, rng: () => 0, bank: [] }), /empty/);
});

test("createRng stays inside the unit interval", () => {
  const rng = createRng(99);
  for (let i = 0; i < 1000; i += 1) {
    const value = rng();
    assert.ok(value >= 0);
    assert.ok(value < 1);
  }
});
