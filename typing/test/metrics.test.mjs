import assert from "node:assert/strict";
import test from "node:test";
import {
  accuracyRatio,
  bestLabel,
  countCorrect,
  formatClock,
  hintFor,
  parseBests,
  percent,
  quipFor,
  recordBest,
  roundStat,
  wordsPerMinute,
} from "../src/metrics.js";

test("five correct characters across one minute is one word per minute", () => {
  assert.equal(wordsPerMinute(5, 60000), 1);
});

test("fifty correct characters in ten seconds is sixty words per minute", () => {
  assert.equal(wordsPerMinute(50, 10000), 60);
});

test("wpm stays at zero before time has moved or before a correct character", () => {
  assert.equal(wordsPerMinute(20, 0), 0);
  assert.equal(wordsPerMinute(0, 1000), 0);
  assert.equal(wordsPerMinute(10, Number.NaN), 0);
});

test("accuracy ignores an empty start and keeps corrected mistakes in the ratio", () => {
  assert.equal(accuracyRatio(0, 0), 1);
  assert.equal(accuracyRatio(8, 2), 0.8);
  assert.equal(percent(0.8), 80);
  assert.equal(percent(1), 100);
  assert.equal(percent(0), 0);
  assert.equal(percent(274 / 275), 99);
  assert.equal(percent(1 / 250), 1);
});

test("correct characters compare the typed prefix in place", () => {
  assert.equal(countCorrect("hello", "hallo"), 4);
  assert.equal(countCorrect("cat dog", "cot"), 2);
  assert.equal(countCorrect("cat dog", "x"), 0);
  assert.equal(countCorrect("cat", ""), 0);
});

test("the clock rounds up the remaining second and lands on zero", () => {
  assert.equal(formatClock(30000), 30);
  assert.equal(formatClock(29001), 30);
  assert.equal(formatClock(29000), 29);
  assert.equal(formatClock(0), 0);
});

test("bests are kept per duration and only move upward", () => {
  const first = recordBest({}, 30, 61.4);
  assert.equal(first.best, 61);
  assert.equal(first.improved, true);
  assert.equal(bestLabel(first), "First best");

  const same = recordBest(first.records, 30, 61.2);
  assert.equal(same.improved, false);
  assert.equal(same.best, 61);
  assert.equal(bestLabel(same), "");

  const other = recordBest(first.records, 15, 70.2);
  assert.equal(other.records["30"], 61);
  assert.equal(other.records["15"], 70);
  assert.equal(bestLabel(other), "First best");

  const beaten = recordBest(other.records, 15, 80);
  assert.equal(beaten.previous, 70);
  assert.equal(beaten.best, 80);
  assert.equal(bestLabel(beaten), "New best");
});

test("stored bests drop junk and keep the three clocks", () => {
  assert.deepEqual(parseBests(""), {});
  assert.deepEqual(parseBests("nope"), {});
  assert.deepEqual(parseBests(JSON.stringify({ 15: 40.2, 30: 0, 60: 88, 90: 10 })), {
    15: 40,
    60: 88,
  });
});

test("quips and hints follow the pace and the saved mark", () => {
  assert.match(quipFor(120), /keyboard/i);
  assert.match(quipFor(90), /lamp/i);
  assert.match(quipFor(70), /Quick hands/);
  assert.match(quipFor(50), /steady/i);
  assert.match(quipFor(30), /Warming up/);
  assert.match(quipFor(12), /patient/i);
  assert.match(hintFor("ready", 0), /first letter/i);
  assert.match(hintFor("ready", 72), /72 wpm/);
  assert.match(hintFor("running", 72), /Backspace/);
  assert.equal(roundStat(61.5), 62);
});
