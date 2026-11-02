import { containCar, createCar, resetCar, separateCars, stepCar, wrapAngle } from "./drive.js";
import { placeOnTrack, pointAt, project } from "./track.js";

export const LAPS = 3;
export const TREE_LIGHTS = 5;
export const LIGHT_STEP = 0.48;

export const GRID = [
  { t: 0.984, lateral: -1.55, skill: 1, line: 0, color: "#f4f7fb", name: "You" },
  { t: 0.984, lateral: 1.55, skill: 0.95, line: 1.25, color: "#ff3b30", name: "Red" },
  { t: 0.973, lateral: -1.55, skill: 0.9, line: -1.15, color: "#ffb703", name: "Gold" },
  { t: 0.973, lateral: 1.55, skill: 0.86, line: 0.35, color: "#7c5cff", name: "Violet" },
];

export function lightState(time) {
  const t = Number.isFinite(time) ? Math.max(0, time) : 0;
  const go = t >= TREE_LIGHTS * LIGHT_STEP;
  const red = go ? 0 : Math.min(TREE_LIGHTS, Math.floor(t / LIGHT_STEP));
  return { red, green: go, go };
}

export function createRace(track, options = {}) {
  const laps = options.laps ?? LAPS;
  const grid = options.grid ?? GRID;
  return {
    phase: "ready",
    time: 0,
    raceTime: 0,
    light: lightState(0),
    laps,
    best: options.best ?? null,
    bestLap: options.bestLap ?? null,
    cars: grid.map((slot, index) => makeEntry(track, slot, index)),
  };
}

export function startRace(race, track) {
  if (race.phase === "lights" || race.phase === "racing") return false;
  race.cars.forEach((entry) => {
    resetCar(entry.car, entry.spawn);
    entry.lap = 0;
    entry.travel = 0;
    entry.prevT = entry.spawn.t;
    entry.lapClock = 0;
    entry.lastLap = null;
    entry.wrong = false;
  });
  race.phase = "lights";
  race.time = 0;
  race.raceTime = 0;
  race.light = lightState(0);
  void track;
  return true;
}

export function tickRace(race, track, playerInput, dt) {
  const step = finiteStep(dt);
  if (step === 0 || race.phase === "ready" || race.phase === "finished") {
    return { go: false, lap: false, finished: false, light: race.light, surface: "asphalt" };
  }

  if (race.phase === "lights") {
    race.time += step;
    race.light = lightState(race.time);
    if (!race.light.go) return { go: false, lap: false, finished: false, light: race.light, surface: "asphalt" };
    race.phase = "racing";
    race.raceTime = 0;
    race.cars.forEach((entry) => {
      entry.lapClock = 0;
    });
  }

  race.raceTime += step;
  let playerLap = false;
  let surface = "asphalt";
  const inputs = race.cars.map((entry, index) => (
    index === 0 ? sanitize(playerInput) : racingLineInput(entry.car, track, entry)
  ));

  race.cars.forEach((entry, index) => {
    const stepped = stepCar(entry.car, inputs[index], track, step);
    if (index === 0) surface = stepped.surface;
  });
  separateCars(race.cars.map((entry) => entry.car));
  race.cars.forEach((entry) => containCar(entry.car, track));

  for (let index = 0; index < race.cars.length; index += 1) {
    const entry = race.cars[index];
    entry.lapClock += step;
    const proj = project(track, entry.car.x, entry.car.z);
    const prev = entry.prevT;
    let delta = proj.t - prev;
    if (delta > 0.5) delta -= 1;
    if (delta < -0.5) delta += 1;
    if (Math.abs(delta) > 0.08) delta = 0;
    const crossed = delta > 0 && prev > 0.6 && proj.t < 0.4;
    entry.prevT = proj.t;
    entry.travel += delta;
    if (index === 0) {
      if (delta < -0.0004 && entry.car.speed > 8) entry.wrong = true;
      else if (delta > 0.0002) entry.wrong = false;
    }
    const before = entry.lap;
    if (crossed && entry.travel > 0.45 && entry.lap < 20) {
      entry.lap += 1;
      entry.lastLap = entry.lapClock;
      if (entry.bestLap == null || entry.lapClock < entry.bestLap) entry.bestLap = entry.lapClock;
      if (index === 0 && (race.bestLap == null || entry.lapClock < race.bestLap)) race.bestLap = entry.lapClock;
      entry.lapClock = 0;
    }
    if (index === 0 && entry.lap > before && entry.lap < race.laps) playerLap = true;
  }

  const player = race.cars[0];
  const finished = player.lap >= race.laps;
  if (finished) {
    race.phase = "finished";
    if (race.best == null || race.raceTime < race.best) race.best = race.raceTime;
  }
  return { go: race.raceTime <= step, lap: playerLap, finished, light: race.light, surface };
}

export function racingLineInput(car, track, tune = {}) {
  const skill = tune.skill ?? 1;
  const line = tune.line ?? 0;
  const proj = project(track, car.x, car.z);
  const look = (7 + Math.min(24, Math.abs(car.speed) * 0.32)) / track.length;
  const ahead = pointAt(track, proj.t + look);
  const further = pointAt(track, proj.t + 0.018);
  const curve = wrapAngle(further.heading - proj.heading);
  const targetLat = line - Math.sign(curve || 0) * Math.min(track.half * 0.28, Math.abs(curve) * 36);
  const latErr = targetLat - proj.lateral;
  const headingErr = wrapAngle(ahead.heading - car.heading);
  const steer = clamp(headingErr / 0.62 - latErr / 7.5, -1, 1);
  const abs = Math.abs(headingErr);
  let throttle = abs > 0.42 ? 0.28 : abs > 0.18 ? 0.62 : 1;
  let brake = 0;
  if (abs > 0.55 && car.speed > 24) brake = 0.9;
  else if (abs > 0.28 && car.speed > 36) brake = 0.45;
  if (Math.abs(proj.lateral) > track.half * 0.82 && car.speed > 28) brake = Math.max(brake, 0.35);
  if (brake > 0.5) throttle = Math.min(throttle, 0.2);
  throttle *= 0.72 + 0.28 * skill;
  return { throttle, brake, steer };
}

export function standings(race) {
  return race.cars
    .map((entry, index) => ({
      index,
      name: entry.name,
      lap: entry.lap,
      travel: entry.travel,
    }))
    .sort((a, b) => b.travel - a.travel || a.index - b.index);
}

export function positionOf(race, index = 0) {
  return standings(race).findIndex((row) => row.index === index) + 1;
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00.00";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  const whole = Math.floor(rest);
  const frac = Math.floor((rest - whole) * 100);
  return `${minutes}:${String(whole).padStart(2, "0")}.${String(frac).padStart(2, "0")}`;
}

export function placeLabel(place) {
  const n = Math.floor(place);
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

export function padAmount(clientX, left, width) {
  const raw = ((clientX - left) / Math.max(width, 1)) * 2 - 1;
  return clamp(raw, -1, 1);
}

export function controlInput(state) {
  let steer = 0;
  if (state?.left) steer -= 1;
  if (state?.right) steer += 1;
  if (typeof state?.steerTouch === "number") steer = state.steerTouch;
  // Negative steer is left on the chase view: the arrow keys and the pad share that sign.
  return {
    throttle: state?.up || state?.gas ? 1 : 0,
    brake: state?.down || state?.brake ? 1 : 0,
    steer: clamp(steer, -1, 1),
  };
}

function makeEntry(track, slot, index) {
  const spawn = placeOnTrack(track, slot.t, slot.lateral);
  return {
    index,
    ai: index !== 0,
    skill: slot.skill ?? 1,
    line: slot.line ?? 0,
    color: slot.color,
    name: slot.name ?? `Car ${index + 1}`,
    spawn,
    car: createCar(spawn),
    lap: 0,
    travel: 0,
    prevT: spawn.t,
    lapClock: 0,
    bestLap: null,
    lastLap: null,
    wrong: false,
  };
}

function sanitize(input) {
  return {
    throttle: clamp(input?.throttle ?? 0, 0, 1),
    brake: clamp(input?.brake ?? 0, 0, 1),
    steer: clamp(input?.steer ?? 0, -1, 1),
  };
}

function finiteStep(dt) {
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  return Math.min(dt, 0.05);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}
