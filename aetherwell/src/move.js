export const PLAYER_HEIGHT = 1.7;
export const RADIUS = 0.42;
export const GRAVITY = 26;
export const JUMP_SPEED = 10.8;
export const STEP_UP = 0.4;
export const FLOOR_SNAP = 0.05;
export const COYOTE = 0.14;
export const JUMP_BUFFER = 0.14;

export function applyGravityAndJump({ velY, grounded, coyote, jumpBuffer, dt }) {
  const nextCoyote = grounded ? COYOTE : Math.max(0, coyote - dt);
  const buffered = Math.max(0, jumpBuffer - dt);
  let nextVel = velY - GRAVITY * dt;
  let jumped = false;
  if ((grounded || nextCoyote > 0) && buffered > 0) {
    nextVel = JUMP_SPEED;
    jumped = true;
  }
  return {
    velY: nextVel,
    coyote: jumped ? 0 : nextCoyote,
    jumpBuffer: jumped ? 0 : buffered,
    grounded: jumped ? false : grounded,
    jumped,
  };
}

export function resolveFloor(feetY, floorY, velY) {
  if (velY > 0.05) {
    return { feetY, velY, grounded: false };
  }
  if (feetY <= floorY + FLOOR_SNAP) {
    return { feetY: floorY, velY: 0, grounded: true };
  }
  return { feetY, velY, grounded: false };
}

export function canStandOn(feetY, headY, surfaceY) {
  if (surfaceY > headY + 0.25) return false;
  const fromAbove = feetY + 0.08 >= surfaceY;
  const stepUp = surfaceY <= feetY + STEP_UP;
  return fromAbove || stepUp;
}

export function promptFor({ collected, nearShard, nearWell, awake, phone = false, total = 5 }) {
  const gather = phone ? "Tap Gather" : "Press E";
  if (awake) return "The well is awake.";
  if (collected >= total && nearWell) return `${gather} to wake the well`;
  if (collected >= total) return "Return to the well";
  if (nearShard) return `${gather} to gather the wellshard`;
  return "";
}

export function canWake({ collected, nearWell, interact, awake, total = 5 }) {
  return !awake && interact && nearWell && collected >= total;
}
