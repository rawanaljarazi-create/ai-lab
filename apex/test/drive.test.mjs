import assert from "node:assert/strict";
import test from "node:test";
import { createCar, FRAME_CAP, resetCar, separateCars, stepCar } from "../src/drive.js";
import { buildHarbor, placeOnTrack, project } from "../src/track.js";

test("throttle builds speed and lifting off lets it fall", () => {
  const track = buildHarbor();
  const car = createCar(placeOnTrack(track, 0.02, 0));
  for (let i = 0; i < 90; i += 1) stepCar(car, { throttle: 1, brake: 0, steer: 0 }, track, 1 / 60);
  assert.ok(car.speed > 14, `speed ${car.speed}`);
  const peaked = car.speed;
  for (let i = 0; i < 90; i += 1) stepCar(car, { throttle: 0, brake: 0, steer: 0 }, track, 1 / 60);
  assert.ok(car.speed < peaked - 4, `coasting ${car.speed}`);
});

test("brakes scrub speed and a huge frame cannot teleport the car", () => {
  const track = buildHarbor();
  const car = createCar(placeOnTrack(track, 0.02, 0));
  for (let i = 0; i < 60; i += 1) stepCar(car, { throttle: 1, brake: 0, steer: 0 }, track, 1 / 60);
  const moving = car.speed;
  for (let i = 0; i < 20; i += 1) stepCar(car, { throttle: 0, brake: 1, steer: 0 }, track, 1 / 60);
  assert.ok(car.speed < moving - 8, `braked ${car.speed} from ${moving}`);
  const before = { x: car.x, z: car.z };
  stepCar(car, { throttle: 1, brake: 0, steer: 0 }, track, 2);
  const moved = Math.hypot(car.x - before.x, car.z - before.z);
  assert.ok(moved < car.speed * FRAME_CAP + 8);
});

test("positive steer turns the car toward +x while driving forward", () => {
  const track = buildHarbor();
  const pose = placeOnTrack(track, 0.03, 0);
  const car = createCar(pose);
  const start = car.heading;
  for (let i = 0; i < 50; i += 1) stepCar(car, { throttle: 1, brake: 0, steer: 1 }, track, 1 / 60);
  assert.ok(car.heading > start + 0.05, `heading ${car.heading} from ${start}`);
});

test("a car aimed at the wall stays inside the barrier", () => {
  const track = buildHarbor();
  const pose = placeOnTrack(track, 0.2, 0);
  const car = createCar({ ...pose, heading: pose.heading + Math.PI / 2 });
  for (let i = 0; i < 180; i += 1) stepCar(car, { throttle: 1, brake: 0, steer: 0 }, track, 1 / 60);
  const seen = project(track, car.x, car.z);
  assert.ok(Math.abs(seen.lateral) <= track.limit - car.radius + 0.2, `lateral ${seen.lateral}`);
  assert.ok(Number.isFinite(car.speed));
});

test("overlapping cars are pushed apart", () => {
  const track = buildHarbor();
  const pose = placeOnTrack(track, 0.2, 0);
  const a = createCar(pose);
  const b = createCar({ ...pose, x: pose.x + 0.4 });
  separateCars([a, b]);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= a.radius + b.radius - 0.01);
});

test("reset parks the car on its grid slot", () => {
  const track = buildHarbor();
  const pose = placeOnTrack(track, 0.04, -1);
  const car = createCar(pose);
  stepCar(car, { throttle: 1, brake: 0, steer: 0.4 }, track, 1);
  resetCar(car, pose);
  assert.equal(car.x, pose.x);
  assert.equal(car.speed, 0);
  assert.equal(car.steer, 0);
});
