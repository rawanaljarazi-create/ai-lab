import assert from "node:assert/strict";
import test from "node:test";
import { roundStat } from "../src/metrics.js";
import {
  createSession,
  expire,
  glyph,
  isTypeable,
  paint,
  press,
  restart,
  summary,
  topUp,
} from "../src/session.js";
import { createRng } from "../src/words.js";

function typeCorrect(session, count, now) {
  let time = now;
  for (let i = 0; i < count; i += 1) {
    const expected = session.target[session.typed.length];
    press(session, expected, time);
    time += 1;
  }
  return time;
}

test("a session waits until the first letter, then the clock belongs to that moment", () => {
  const session = createSession({ duration: 15, words: ["cat", "dog"], refill: false });
  assert.equal(session.phase, "ready");
  assert.equal(session.target, "cat dog");
  assert.equal(press(session, "Backspace", 500).accepted, false);
  assert.equal(press(session, "Enter", 500).accepted, false);
  assert.equal(session.phase, "ready");

  const started = press(session, "c", 1000);
  assert.equal(started.accepted, true);
  assert.equal(session.phase, "running");
  assert.equal(session.startedAt, 1000);
  assert.equal(summary(session, 1000).remainingMs, 15000);
});

test("misses stay in the accuracy even after backspace repairs the word", () => {
  const session = createSession({ duration: 30, words: ["cat", "dog"], refill: false });
  press(session, "c", 0);
  press(session, "x", 100);
  press(session, "Backspace", 200);
  press(session, "a", 300);
  press(session, "t", 400);
  assert.equal(session.typed, "cat");
  assert.equal(session.correctPresses, 3);
  assert.equal(session.incorrectPresses, 1);
  const stats = summary(session, 400);
  assert.equal(stats.correctChars, 3);
  assert.equal(stats.accuracy, 0.75);
});

test("letters are marked in place and a missed space stays visible", () => {
  const session = createSession({ duration: 30, words: ["go", "on"], refill: false });
  let cells = paint(session);
  assert.equal(cells[0].state, "caret");
  assert.equal(cells[0].word, "current");
  assert.equal(cells[2].word, "future");

  press(session, "g", 0);
  press(session, "x", 10);
  cells = paint(session);
  assert.equal(cells[0].state, "correct");
  assert.equal(cells[1].state, "incorrect");
  assert.equal(cells[1].char, "o");
  assert.equal(glyph(" ", "incorrect"), "·");
  assert.equal(glyph("o", "incorrect"), "o");

  press(session, "Backspace", 20);
  press(session, "o", 30);
  press(session, "n", 40);
  cells = paint(session);
  assert.equal(cells[2].state, "incorrect");
  assert.equal(cells[2].char, " ");
});

test("uppercase and other printable keys count as misses, control keys do not", () => {
  const session = createSession({ duration: 30, words: ["go"], refill: false });
  assert.equal(isTypeable("G"), true);
  assert.equal(isTypeable("Enter"), false);
  assert.equal(press(session, "G", 0).accepted, true);
  assert.equal(session.incorrectPresses, 1);
  assert.equal(press(session, "Shift", 10).accepted, false);
  assert.equal(session.typed, "G");
});

test("the round ends on the deadline and later time does not change the score", () => {
  const words = Array.from({ length: 20 }, () => "typed");
  const session = createSession({ duration: 15, words, refill: false });
  typeCorrect(session, 50, 0);
  assert.equal(session.phase, "running");
  const late = press(session, " ", 15000);
  assert.equal(late.accepted, false);
  assert.equal(late.finished, true);
  assert.equal(session.phase, "done");
  assert.equal(session.endedAt, 15000);
  assert.equal(session.typed.length, 50);

  const again = press(session, "a", 20000);
  assert.equal(again.accepted, false);
  assert.equal(session.typed.length, 50);
  expire(session, 40000);
  assert.equal(session.endedAt, 15000);

  const stats = summary(session, 99999);
  assert.equal(stats.elapsedMs, 15000);
  assert.equal(stats.correctChars, 50);
  assert.equal(roundStat(stats.wpm), 40);
  assert.equal(stats.remainingMs, 0);
});

test("a key just inside the window still counts, then the clock closes", () => {
  const session = createSession({ duration: 15, words: ["abcde"], refill: false });
  press(session, "a", 0);
  const accepted = press(session, "b", 14999);
  assert.equal(accepted.accepted, true);
  assert.equal(session.phase, "running");
  assert.equal(expire(session, 15000), true);
  assert.equal(session.typed, "ab");
});

test("finishing a fixed passage early scores the time actually used", () => {
  const session = createSession({ duration: 60, words: ["hi"], refill: false });
  press(session, "h", 1000);
  const done = press(session, "i", 3000);
  assert.equal(done.finished, true);
  assert.equal(session.phase, "done");
  assert.equal(session.endedAt, 3000);
  const stats = summary(session, 3000);
  assert.equal(stats.correctChars, 2);
  assert.equal(stats.elapsedMs, 2000);
  assert.equal(stats.wpm, 12);
});

test("a short list grows without eating the letters already typed", () => {
  const session = createSession({
    duration: 30,
    words: ["one"],
    rng: createRng(7),
    refill: true,
  });
  press(session, "o", 0);
  assert.ok(session.target.startsWith("one "));
  assert.equal(session.typed, "o");
  assert.ok(session.words.length > 1);
});

test("topUp leaves a long passage alone and refuses a finished round", () => {
  const session = createSession({ duration: 30, rng: createRng(3) });
  const target = session.target;
  assert.equal(topUp(session), false);
  assert.equal(session.target, target);

  session.phase = "done";
  session.typed = session.target;
  assert.equal(topUp(session, 1), false);
});

test("restart keeps a chosen clock and paints no caret once the round is over", () => {
  const session = createSession({ duration: 15, words: ["go"], refill: false });
  press(session, "g", 0);
  expire(session, 15000);
  const cells = paint(session);
  assert.equal(cells.some((cell) => cell.state === "caret"), false);
  assert.equal(cells[0].state, "correct");
  assert.equal(cells[1].state, "pending");

  const next = restart(session, { duration: 60 });
  assert.equal(next.phase, "ready");
  assert.equal(next.duration, 60);
  assert.equal(next.typed, "");
  assert.equal(summary(next, 0).wpm, 0);
  assert.equal(summary(next, 0).accuracy, 1);
});

test("durations outside the three clocks are refused", () => {
  assert.throws(() => createSession({ duration: 45 }), /15, 30, or 60/);
  assert.throws(() => createSession({ words: [] }), /non-empty/);
});
