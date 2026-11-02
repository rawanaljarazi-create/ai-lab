import { project } from "./track.js";

export const WHEELBASE = 2.62;
export const MAX_SPEED = 72;
export const MAX_REVERSE = 8;
export const ENGINE_FORCE = 12.5;
export const BRAKE_FORCE = 32;
export const DRAG = 0.00082;
export const ROLL = 3.2;
export const MAX_STEER = 0.56;
export const FRAME_CAP = 0.05;
export const CAR_RADIUS = 1.08;

const STEP = 0.016;

export function createCar(pose) {
  return {
    x: pose.x,
    z: pose.z,
    heading: pose.heading,
    speed: 0,
    steer: 0,
    radius: CAR_RADIUS,
  };
}

export function resetCar(car, pose) {
  car.x = pose.x;
  car.z = pose.z;
  car.heading = pose.heading;
  car.speed = 0;
  car.steer = 0;
}

export function stepCar(car, input, track, dt) {
  const total = clampFrame(dt);
  if (total === 0) return { surface: "asphalt", speed: car.speed, steer: car.steer, slip: 0 };
  const slices = Math.max(1, Math.ceil(total / STEP));
  const step = total / slices;
  let surface = "asphalt";
  for (let i = 0; i < slices; i += 1) surface = integrate(car, input, track, step);
  return { surface, speed: car.speed, steer: car.steer, slip: Math.abs(car.steer) * Math.abs(car.speed) };
}

export function containCar(car, track) {
  return pushInside(car, track, 0);
}

export function separateCars(cars) {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      let dist = Math.hypot(dx, dz);
      const min = a.radius + b.radius;
      if (dist >= min) continue;
      if (dist < 1e-4) {
        dx = 1;
        dz = 0;
        dist = 1;
      }
      const overlap = min - dist;
      const nx = dx / dist;
      const nz = dz / dist;
      a.x -= nx * overlap * 0.5;
      a.z -= nz * overlap * 0.5;
      b.x += nx * overlap * 0.5;
      b.z += nz * overlap * 0.5;
      const aForward = Math.sin(a.heading) * nx + Math.cos(a.heading) * nz;
      if (a.speed > b.speed && aForward > 0) a.speed = Math.max(0, a.speed - overlap * 6);
      const bForward = -(Math.sin(b.heading) * nx + Math.cos(b.heading) * nz);
      if (b.speed > a.speed && bForward > 0) b.speed = Math.max(0, b.speed - overlap * 6);
    }
  }
}

export function wrapAngle(rad) {
  const turned = rad + Math.PI;
  const wrapped = ((turned % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return wrapped - Math.PI;
}

export function clampFrame(dt) {
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  return Math.min(dt, FRAME_CAP);
}

function integrate(car, input, track, step) {
  const throttle = clamp(input?.throttle ?? 0, 0, 1);
  const brake = clamp(input?.brake ?? 0, 0, 1);
  const steerInput = clamp(input?.steer ?? 0, -1, 1);
  const speedScale = 1 / (1 + Math.abs(car.speed) * 0.02);
  const steerTarget = steerInput * MAX_STEER * speedScale;
  car.steer += (steerTarget - car.steer) * (1 - Math.exp(-9 * step));

  let speed = car.speed;
  const drive = throttle * ENGINE_FORCE * (1 - Math.max(0, speed) / (MAX_SPEED * 1.04));
  speed += drive * step;
  if (brake > 0 && Math.abs(speed) > 0.05) {
    const cut = Math.min(Math.abs(speed), brake * BRAKE_FORCE * step);
    speed -= Math.sign(speed) * cut;
  } else if (brake > 0 && throttle === 0) {
    speed -= brake * 6 * step;
  }
  if (throttle === 0 && brake === 0) {
    const roll = Math.min(Math.abs(speed), ROLL * step);
    speed -= Math.sign(speed) * roll;
  }
  speed -= speed * Math.abs(speed) * DRAG * step;
  speed = Math.min(MAX_SPEED, Math.max(-MAX_REVERSE, speed));
  if (Math.abs(speed) < 0.08 && throttle === 0) speed = 0;

  car.heading = wrapAngle(car.heading + (speed / WHEELBASE) * Math.tan(car.steer) * step);
  const slip = Math.abs(Math.tan(car.steer)) * Math.abs(speed);
  let slide = 0;
  if (slip > 7 && Math.abs(speed) > 10) {
    slide = Math.sign(car.steer || steerInput) * Math.min(4.5, (slip - 7) * 0.045) * step;
    speed *= 1 - Math.min(0.22, (slip - 7) * 0.004) * step * 8;
  }
  car.speed = speed;
  car.x += Math.sin(car.heading) * speed * step + Math.cos(car.heading) * slide * Math.abs(speed) * 0.35;
  car.z += Math.cos(car.heading) * speed * step - Math.sin(car.heading) * slide * Math.abs(speed) * 0.35;
  return pushInside(car, track, step);
}

function pushInside(car, track, step) {
  const proj = project(track, car.x, car.z);
  const wall = track.limit - car.radius;
  const absLat = Math.abs(proj.lateral);
  if (absLat > wall) {
    const sign = Math.sign(proj.lateral) || 1;
    car.x = proj.x + proj.nx * sign * wall;
    car.z = proj.z + proj.nz * sign * wall;
    const into = (Math.sin(car.heading) * proj.nx * sign + Math.cos(car.heading) * proj.nz * sign) * car.speed;
    if (into > 0) car.speed = Math.max(0, car.speed - into * 0.72);
    const along = Math.atan2(proj.tx, proj.tz);
    const diff = wrapAngle(along - car.heading);
    if (Math.abs(diff) < Math.PI * 0.55) car.heading = wrapAngle(car.heading + diff * 0.42);
    return "barrier";
  }
  if (absLat > track.half - 0.2 && step > 0) {
    const depth = absLat - (track.half - 0.2);
    const drag = Math.min(Math.abs(car.speed), (10 + depth * 14) * step);
    car.speed -= Math.sign(car.speed || 0) * drag;
    return "runoff";
  }
  return "asphalt";
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}
