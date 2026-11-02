import assert from "node:assert/strict";
import test from "node:test";
import {
  controlInput,
  padAmount,
  createRace,
  formatTime,
  LAPS,
  lightState,
  placeLabel,
  positionOf,
  racingLineInput,
  standings,
  startRace,
  tickRace,
} from "../src/game.js";
import { hintFor, isPhone, qualityFor } from "../src/quality.js";
import { buildHarbor } from "../src/track.js";

test("the tree stays dark, fills, then goes out for the start", () => {
  assert.deepEqual(lightState(0), { red: 0, green: false, go: false });
  assert.equal(lightState(0.5).red, 1);
  assert.equal(lightState(2).go, false);
  const go = lightState(5 * 0.48 + 0.01);
  assert.equal(go.go, true);
  assert.equal(go.red, 0);
  assert.equal(go.green, true);
});

test("cars hold still on the lights and launch when they go out", () => {
  const track = buildHarbor();
  const race = createRace(track);
  assert.equal(startRace(race, track), true);
  assert.equal(startRace(race, track), false);
  const x = race.cars[0].car.x;
  tickRace(race, track, { throttle: 1, brake: 0, steer: 0 }, 0.2);
  assert.equal(race.phase, "lights");
  assert.equal(race.cars[0].car.x, x);
  race.time = 5 * 0.48 - 0.01;
  tickRace(race, track, { throttle: 1, brake: 0, steer: 0 }, 0.02);
  assert.equal(race.phase, "racing");
  for (let i = 0; i < 20; i += 1) tickRace(race, track, { throttle: 1, brake: 0, steer: 0 }, 1 / 60);
  assert.ok(race.cars[0].car.speed > 1);
});

test("a clean driver finishes the race and keeps a best", () => {
  const track = buildHarbor();
  const race = createRace(track, { laps: 1, grid: soloGrid() });
  startRace(race, track);
  race.phase = "racing";
  let guard = 0;
  while (race.phase !== "finished" && guard < 12000) {
    const input = racingLineInput(race.cars[0].car, track, race.cars[0]);
    tickRace(race, track, input, 1 / 60);
    guard += 1;
  }
  assert.equal(race.phase, "finished", `lap ${race.cars[0].lap} travel ${race.cars[0].travel.toFixed(2)} speed ${race.cars[0].car.speed.toFixed(1)} frames ${guard}`);
  assert.equal(race.cars[0].lap, 1);
  assert.ok(race.raceTime > 8);
  assert.equal(race.best, race.raceTime);
  assert.ok(race.bestLap > 8);
});

test("the full field moves down the straight without leaving the world", () => {
  const track = buildHarbor();
  const race = createRace(track);
  startRace(race, track);
  race.phase = "racing";
  for (let i = 0; i < 60 * 12; i += 1) {
    const input = racingLineInput(race.cars[0].car, track, race.cars[0]);
    tickRace(race, track, input, 1 / 60);
  }
  assert.ok(race.cars[0].travel > 0.25, `travel ${race.cars[0].travel}`);
  for (const entry of race.cars) {
    assert.ok(Number.isFinite(entry.car.x) && Number.isFinite(entry.car.speed));
    assert.ok(Math.abs(entry.car.x) < 500 && Math.abs(entry.car.z) < 500);
  }
  const order = standings(race);
  assert.equal(order.length, 4);
  assert.equal(positionOf(race, order[0].index), 1);
});

test("reversing along the circuit does not award a lap", () => {
  const track = buildHarbor();
  const race = createRace(track, { grid: soloGrid() });
  startRace(race, track);
  race.phase = "racing";
  race.cars[0].car.heading += Math.PI;
  for (let i = 0; i < 180; i += 1) tickRace(race, track, { throttle: 1, brake: 0, steer: 0 }, 1 / 60);
  assert.equal(race.cars[0].lap, 0);
  assert.ok(race.cars[0].travel < 0.02);
  assert.equal(race.cars[0].wrong, true);
});

test("times and places format for the board", () => {
  assert.equal(formatTime(0), "0:00.00");
  assert.equal(formatTime(65.432), "1:05.43");
  assert.equal(placeLabel(1), "1st");
  assert.equal(placeLabel(2), "2nd");
  assert.equal(placeLabel(4), "4th");
  assert.equal(LAPS, 3);
});

test("left and right match the chase view, and a finger on the pad wins", () => {
  assert.deepEqual(controlInput({ left: true, up: true }), { throttle: 1, brake: 0, steer: -1 });
  assert.deepEqual(controlInput({ right: true }), { throttle: 0, brake: 0, steer: 1 });
  assert.deepEqual(controlInput({ left: true, right: true, steerTouch: 0.4, gas: true, brake: true }), {
    throttle: 1,
    brake: 1,
    steer: 0.4,
  });
  assert.equal(padAmount(0, 0, 100), -1);
  assert.equal(padAmount(100, 0, 100), 1);
  assert.equal(controlInput({ steerTouch: padAmount(0, 0, 100) }).steer, -1);
  assert.equal(controlInput({ steerTouch: padAmount(100, 0, 100) }).steer, 1);
});

test("holding left turns the car toward the left of the chase view", () => {
  const track = buildHarbor();
  const race = createRace(track, { grid: soloGrid() });
  startRace(race, track);
  race.phase = "racing";
  const start = race.cars[0].car.heading;
  const input = controlInput({ left: true, up: true });
  for (let i = 0; i < 50; i += 1) tickRace(race, track, input, 1 / 60);
  assert.ok(race.cars[0].car.heading < start - 0.05, `heading ${race.cars[0].car.heading} from ${start}`);
});

test("phones get a lower pixel cap and the touch hint", () => {
  const desk = qualityFor({ phone: false, cores: 8, width: 1440, height: 900 });
  const phone = qualityFor({ phone: true, cores: 8, width: 390, height: 844 });
  assert.equal(desk.touch, false);
  assert.equal(phone.touch, true);
  assert.ok(phone.pixelCap < desk.pixelCap);
  assert.equal(phone.bloom, true);
  assert.equal(phone.shadowSize, 1024);
  assert.match(hintFor(true), /Tap/);
  assert.match(hintFor(false), /WASD/);
  assert.equal(isPhone({ maxTouchPoints: 2 }, { innerWidth: 400, matchMedia: () => ({ matches: true }) }), true);
  assert.equal(isPhone({ maxTouchPoints: 0 }, { innerWidth: 1400, matchMedia: () => ({ matches: false }) }), false);
});

function soloGrid() {
  return [{ t: 0.016, lateral: 0, skill: 1, line: 0, color: "#fff", name: "You" }];
}
