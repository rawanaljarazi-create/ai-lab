import assert from "node:assert/strict";
import test from "node:test";
import { createRun } from "../src/run.js";

function clock() {
  let now = 0;
  const queue = [];
  let nextId = 1;

  function setTimer(fn, ms) {
    const id = nextId;
    nextId += 1;
    queue.push({ id, fn, at: now + ms, cleared: false, done: false });
    return id;
  }

  function clearTimer(id) {
    const item = queue.find((entry) => entry.id === id);
    if (item) item.cleared = true;
  }

  function flush(ms) {
    now += ms;
    for (;;) {
      const due = queue
        .filter((entry) => !entry.cleared && !entry.done && entry.at <= now)
        .sort((a, b) => a.at - b.at || a.id - b.id);
      if (!due.length) break;
      due[0].done = true;
      due[0].fn();
    }
  }

  return { setTimer, clearTimer, flush };
}

function runOf(schedule, timers, blackMs = 800, bootMs = 4200) {
  const stages = [];
  const lines = [];
  const run = createRun({
    schedule,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    blackMs,
    bootMs,
    onStage: (stage) => stages.push(stage),
    onLine: (line) => lines.push(line.text),
  });
  return { run, stages, lines };
}

test("a run shows the log, goes black, boots, then reveals", () => {
  const timers = clock();
  const { run, stages, lines } = runOf(
    [
      { kind: "info", text: "a", ms: 1000 },
      { kind: "good", text: "b", ms: 500 },
    ],
    timers,
    200,
    300
  );
  run.start();
  assert.deepEqual(stages, ["log"]);
  timers.flush(0);
  assert.deepEqual(lines, ["a"]);
  timers.flush(999);
  assert.deepEqual(lines, ["a"]);
  timers.flush(1);
  assert.deepEqual(lines, ["a", "b"]);
  timers.flush(499);
  assert.deepEqual(stages, ["log"]);
  timers.flush(1);
  assert.equal(stages.at(-1), "black");
  timers.flush(200);
  assert.equal(stages.at(-1), "boot");
  timers.flush(299);
  assert.equal(stages.at(-1), "boot");
  timers.flush(1);
  assert.equal(stages.at(-1), "reveal");
});

test("cancel stops the reboot", () => {
  const timers = clock();
  const { run, stages } = runOf([{ kind: "info", text: "a", ms: 1000 }], timers, 100, 100);
  run.start();
  timers.flush(0);
  run.cancel();
  timers.flush(100000);
  assert.deepEqual(stages, ["log"]);
});
