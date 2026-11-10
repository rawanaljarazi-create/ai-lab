export const GRAVITY = 27;
export const FLAP_VELOCITY = 8.75;
export const MAX_FALL = 13.5;
export const SPEED = 5.65;
export const BIRD_RADIUS = 0.4;
export const PIPE_RADIUS = 0.68;
export const LIP_RADIUS = 0.88;
export const LIP_HEIGHT = 0.44;
export const GAP = 3.4;
export const PIPE_SPACING = 7.4;
export const FIRST_PIPE_X = 8.8;
export const GAP_LOW = -0.2;
export const GAP_HIGH = 1.2;
export const GROUND_Y = -3.05;
export const CEILING_Y = 4.7;
export const START_Y = 0.55;
export const LOOKAHEAD = 36;
export const BEHIND = 16;
export const DEATH_LOCK = 0.5;
export const FRAME_CAP = 0.05;

const STEP = 0.016;

export function createGame(options = {}) {
  return {
    phase: "ready",
    x: 0,
    y: START_Y,
    vy: 0,
    score: 0,
    best: options.best ?? 0,
    pipes: [],
    spawnX: FIRST_PIPE_X,
    rng: options.rng ?? Math.random,
    time: 0,
    flapPulse: 0,
    deadAt: -10,
  };
}

export function reset(game) {
  game.phase = "ready";
  game.x = 0;
  game.y = START_Y;
  game.vy = 0;
  game.score = 0;
  game.pipes = [];
  game.spawnX = FIRST_PIPE_X;
  game.flapPulse = 0;
}

export function flap(game) {
  if (game.phase === "dying") return "ignored";
  if (game.phase === "dead") {
    if (game.time - game.deadAt < DEATH_LOCK) return "locked";
    reset(game);
    begin(game);
    game.vy = FLAP_VELOCITY;
    game.flapPulse = 1;
    return "restart";
  }
  if (game.phase === "ready") begin(game);
  game.vy = FLAP_VELOCITY;
  game.flapPulse = 1;
  return "flap";
}

export function tick(game, dt) {
  const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), FRAME_CAP) : 0;
  if (step === 0) return { scored: false, died: false };

  game.time += step;
  game.flapPulse = Math.max(0, game.flapPulse - step * 4.8);

  if (game.phase === "ready" || game.phase === "dead") {
    return { scored: false, died: false };
  }

  const steps = Math.max(1, Math.ceil(step / STEP));
  const h = step / steps;

  if (game.phase === "dying") {
    for (let i = 0; i < steps; i += 1) {
      game.vy = Math.max(-MAX_FALL, game.vy - GRAVITY * h);
      game.y += game.vy * h;
      if (game.y <= GROUND_Y + BIRD_RADIUS) {
        settle(game);
        break;
      }
    }
    if (game.phase === "dying" && game.time - game.deadAt > 1.15) settle(game);
    return { scored: false, died: false };
  }

  let gained = 0;
  for (let i = 0; i < steps; i += 1) {
    game.vy = Math.max(-MAX_FALL, game.vy - GRAVITY * h);
    game.y += game.vy * h;
    game.x += SPEED * h;

    const bounds = outOfBounds(game.y);
    if (bounds) {
      fail(game, bounds);
      return { scored: false, died: true };
    }

    for (const pipe of game.pipes) {
      if (hitsPipe(game.x, game.y, pipe)) {
        fail(game, "pipe");
        return { scored: false, died: true };
      }
    }

    for (const pipe of game.pipes) {
      if (!pipe.scored && game.x > pipe.x) {
        pipe.scored = true;
        game.score += 1;
        gained += 1;
      }
    }
  }

  ensurePipes(game);
  return { scored: gained > 0, died: false };
}

export function outOfBounds(y) {
  if (y - BIRD_RADIUS <= GROUND_Y) return "ground";
  if (y + BIRD_RADIUS >= CEILING_Y) return "ceiling";
  return null;
}

export function hitsPipe(x, y, pipe) {
  const gapBottom = pipe.gapY - GAP / 2;
  const gapTop = pipe.gapY + GAP / 2;
  const boxes = [
    box(pipe.x, PIPE_RADIUS, -80, gapBottom - LIP_HEIGHT, PIPE_RADIUS),
    box(pipe.x, LIP_RADIUS, gapBottom - LIP_HEIGHT, gapBottom, LIP_RADIUS),
    box(pipe.x, PIPE_RADIUS, gapTop + LIP_HEIGHT, 80, PIPE_RADIUS),
    box(pipe.x, LIP_RADIUS, gapTop, gapTop + LIP_HEIGHT, LIP_RADIUS),
  ];
  return boxes.some((solid) => sphereHitsAabb(x, y, 0, BIRD_RADIUS, solid));
}

function begin(game) {
  game.phase = "playing";
  game.pipes = [];
  game.spawnX = game.x + FIRST_PIPE_X;
  ensurePipes(game);
}

function fail(game, how) {
  game.best = Math.max(game.best, game.score);
  game.deadAt = game.time;
  if (how === "ground") {
    settle(game);
    return;
  }
  game.phase = "dying";
  game.vy = Math.min(game.vy, 2);
}

function settle(game) {
  game.phase = "dead";
  game.vy = 0;
  game.y = GROUND_Y + BIRD_RADIUS * 0.45;
}

function ensurePipes(game) {
  let guard = 0;
  while (game.spawnX < game.x + LOOKAHEAD && guard < 30) {
    game.pipes.push({
      x: game.spawnX,
      gapY: GAP_LOW + game.rng() * (GAP_HIGH - GAP_LOW),
      scored: false,
    });
    game.spawnX += PIPE_SPACING;
    guard += 1;
  }
  const keep = game.x - BEHIND;
  if (game.pipes.some((pipe) => pipe.x < keep)) {
    game.pipes = game.pipes.filter((pipe) => pipe.x >= keep);
  }
}

function box(x, halfX, minY, maxY, halfZ) {
  return {
    minX: x - halfX,
    maxX: x + halfX,
    minY,
    maxY,
    minZ: -halfZ,
    maxZ: halfZ,
  };
}

function sphereHitsAabb(x, y, z, radius, solid) {
  const cx = Math.max(solid.minX, Math.min(x, solid.maxX));
  const cy = Math.max(solid.minY, Math.min(y, solid.maxY));
  const cz = Math.max(solid.minZ, Math.min(z, solid.maxZ));
  const dx = x - cx;
  const dy = y - cy;
  const dz = z - cz;
  return dx * dx + dy * dy + dz * dz < radius * radius;
}
