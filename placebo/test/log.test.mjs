import assert from "node:assert/strict";
import test from "node:test";
import { LOG_LINES, scheduleLog, scriptLines, totalMs } from "../src/log.js";

const REQUIRED = [
  "[*] Spraying kernel objects...",
  "[+] Got kernel r/w",
  "[*] Bypassing PPL",
  "[*] Extracting bootstrap",
  "[*] Installing Sileo",
  "[+] Done, userspace rebooting...",
];

function sequence(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

test("the scripted lines stay fictional", () => {
  const text = LOG_LINES.map((line) => line.text).join("\n");
  for (const line of REQUIRED) assert.ok(text.includes(line), line);
  assert.equal(LOG_LINES.length, 29);
  for (const line of LOG_LINES) {
    assert.match(line.kind, /^(info|good)$/);
    assert.doesNotMatch(line.text, /CVE-/);
    assert.doesNotMatch(line.text, /0x/i);
    assert.doesNotMatch(line.text, /https?:/i);
    assert.equal(line.text.startsWith("[+]") ? "good" : "info", line.kind);
  }
});

test("rootless off skips the bootstrap and the prefix", () => {
  const off = scriptLines({ rootless: false }).map((line) => line.text);
  const on = scriptLines({ rootless: true }).map((line) => line.text);
  assert.ok(on.includes("[*] Extracting bootstrap"));
  assert.ok(on.includes("[*] Preparing a rootless prefix"));
  for (const line of [
    "[*] Extracting bootstrap",
    "[*] Archive opened",
    "[*] Preparing a rootless prefix",
    "[*] Prefix reserved",
  ]) {
    assert.equal(off.includes(line), false, line);
  }
  assert.ok(off.includes("[*] Installing Sileo"));
  assert.ok(off.length < on.length);
});

test("every schedule lasts between 20 and 30 seconds", () => {
  const samples = [() => 0, () => 1, () => 0.5, () => Number.NaN, () => 4, () => -2];
  for (let seed = 1; seed <= 40; seed += 1) samples.push(sequence(seed));
  for (const random of samples) {
    const schedule = scheduleLog(random);
    assert.deepEqual(
      schedule.map((line) => line.text),
      LOG_LINES.map((line) => line.text)
    );
    const total = totalMs(schedule);
    assert.ok(total >= 20000 && total <= 30000, String(total));
    for (const line of schedule) assert.ok(line.ms >= 200, String(line.ms));
    const rootedOff = totalMs(scheduleLog(random, { rootless: false }));
    assert.ok(rootedOff >= 20000 && rootedOff <= 30000, String(rootedOff));
  }
});
