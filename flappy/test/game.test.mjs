import assert from "node:assert/strict";
import test from "node:test";
import {
  BIRD_RADIUS,
  CEILING_Y,
  createGame,
  DEATH_LOCK,
  FIRST_PIPE_X,
  FLAP_VELOCITY,
  FRAME_CAP,
  GAP,
  GAP_HIGH,
  GAP_LOW,
  GRAVITY,
  GROUND_Y,
  hitsPipe,
  LIP_HEIGHT,
  LIP_RADIUS,
  outOfBounds,
  PIPE_RADIUS,
  SPEED,
  START_Y,
  flap,
  tick,
} from "../src/game.js";

test("the bird waits on the title until the first flap", () => {
  const game = createGame();
  const y = game.y;
  tick(game, 1);
  assert.equal(game.phase, "ready");
  assert.equal(game.y, y);
  assert.equal(game.x, 0);
  assert.equal(game.pipes.length, 0);
});

test("a flap starts the run and a later frame falls", () => {
  const game = createGame({ rng: () => 0.5 });
  assert.equal(flap(game), "flap");
  assert.equal(game.phase, "playing");
  assert.equal(game.vy, FLAP_VELOCITY);
  assert.equal(game.pipes[0].x, FIRST_PIPE_X);
  tick(game, 1 / 60);
  assert.ok(Math.abs(game.vy - (FLAP_VELOCITY - GRAVITY / 60)) < 1e-6);
  assert.ok(Math.abs(game.x - SPEED / 60) < 1e-6);
});

test("a long frame cannot skip a pipe", () => {
  const game = createGame({ rng: () => 0.5 });
  flap(game);
  game.vy = 0;
  game.y = game.pipes[0].gapY;
  const x = game.x;
  tick(game, 1);
  assert.ok(game.x - x <= SPEED * FRAME_CAP + 1e-6);
  assert.equal(game.phase, "playing");
});

test("pipe gaps stay inside the meadow band", () => {
  let n = 0;
  const game = createGame({
    rng: () => {
      n += 1;
      return (n % 7) / 6;
    },
  });
  flap(game);
  assert.ok(game.pipes.length >= 3);
  for (const pipe of game.pipes) {
    assert.ok(pipe.gapY >= GAP_LOW - 1e-9);
    assert.ok(pipe.gapY <= GAP_HIGH + 1e-9);
  }
});

test("the gap is safe and the shaft, lip, ground, and ceiling are not", () => {
  const pipe = { x: 5, gapY: 0.4, scored: false };
  assert.equal(hitsPipe(pipe.x, pipe.gapY, pipe), false);
  const shaftY = pipe.gapY - GAP / 2 - LIP_HEIGHT - 0.35;
  assert.equal(hitsPipe(pipe.x, shaftY, pipe), true);
  const lipY = pipe.gapY - GAP / 2 - LIP_HEIGHT / 2;
  const lipX = pipe.x + (PIPE_RADIUS + LIP_RADIUS) / 2;
  assert.equal(hitsPipe(lipX, lipY, pipe), true);
  assert.equal(hitsPipe(pipe.x + LIP_RADIUS + BIRD_RADIUS + 0.05, lipY, pipe), false);
  assert.equal(outOfBounds(START_Y), null);
  assert.equal(outOfBounds(GROUND_Y + BIRD_RADIUS - 0.01), "ground");
  assert.equal(outOfBounds(CEILING_Y - BIRD_RADIUS + 0.01), "ceiling");
});

test("clearing a pipe scores once", () => {
  const game = createGame({ rng: () => 0.5 });
  flap(game);
  const pipe = game.pipes[0];
  game.x = pipe.x - 0.2;
  let guard = 0;
  while (game.score < 1 && guard < 40) {
    game.y = pipe.gapY;
    game.vy = 0;
    tick(game, 1 / 60);
    guard += 1;
  }
  assert.equal(game.score, 1);
  assert.equal(pipe.scored, true);
  game.y = pipe.gapY;
  game.vy = 0;
  tick(game, 1 / 60);
  assert.equal(game.score, 1);
});

test("hitting a pipe ends the run without a point and freezes the distance", () => {
  const game = createGame({ rng: () => 0.5 });
  flap(game);
  const pipe = game.pipes[0];
  game.x = pipe.x;
  game.y = pipe.gapY - GAP / 2 - LIP_HEIGHT - 0.6;
  game.vy = 0;
  const result = tick(game, 1 / 60);
  assert.equal(result.died, true);
  assert.equal(game.score, 0);
  assert.equal(game.phase, "dying");
  const x = game.x;
  tick(game, 0.4);
  assert.equal(game.x, x);
  assert.equal(game.score, 0);
});

test("the ground ends the run immediately", () => {
  const game = createGame({ rng: () => 0.5 });
  flap(game);
  game.y = GROUND_Y + BIRD_RADIUS - 0.2;
  game.vy = -4;
  const result = tick(game, 1 / 60);
  assert.equal(result.died, true);
  assert.equal(game.phase, "dead");
  assert.ok(game.y >= GROUND_Y);
});

test("a fresh crash ignores the next flap, then a later flap starts a new run", () => {
  const game = createGame({ rng: () => 0.5, best: 2 });
  flap(game);
  game.score = 4;
  game.y = GROUND_Y;
  game.vy = -1;
  tick(game, 1 / 60);
  assert.equal(game.phase, "dead");
  assert.equal(game.best, 4);
  assert.equal(flap(game), "locked");
  assert.equal(game.score, 4);
  game.deadAt = game.time - DEATH_LOCK - 0.01;
  assert.equal(flap(game), "restart");
  assert.equal(game.phase, "playing");
  assert.equal(game.score, 0);
  assert.equal(game.best, 4);
  assert.equal(game.x, 0);
});

test("a steady flap through one gap height survives ten pipes", () => {
  const game = createGame({ rng: () => 0.5 });
  flap(game);
  const target = GAP_LOW + 0.5 * (GAP_HIGH - GAP_LOW);
  game.y = target;
  game.vy = 0;
  let guard = 0;
  while (game.score < 10 && game.phase === "playing" && guard < 20000) {
    if (game.y < target - 0.5 && game.vy < 0.8) flap(game);
    tick(game, 1 / 60);
    guard += 1;
  }
  assert.equal(game.phase, "playing");
  assert.ok(game.score >= 10);
});
