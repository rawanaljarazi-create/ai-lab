import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_GRAVITY,
  MAX_FRAME,
  addBox,
  addCircle,
  addRegularPolygon,
  bodyAt,
  createWorld,
  grabBody,
  moveGrab,
  releaseBody,
  seedTable,
  setGravity,
  setPaused,
  setStatic,
  step,
} from "../src/world.js";

const OPEN = { minX: -2000, minY: -2000, maxX: 2000, maxY: 2000 };

function arena(extra = {}) {
  return createWorld({
    gravity: 0,
    bounds: OPEN,
    wallFriction: 0,
    wallRestitution: 1,
    ...extra,
  });
}

function run(world, seconds, dt = 1 / 60) {
  const frames = Math.round(seconds / dt);
  for (let i = 0; i < frames; i += 1) step(world, dt);
}

test("a free circle falls and a paused world holds still", () => {
  const world = createWorld({ gravity: DEFAULT_GRAVITY, bounds: OPEN });
  const ball = addCircle(world, { x: 0, y: 0, radius: 20, restitution: 0, friction: 0 });
  step(world, 1 / 60);
  assert.ok(Math.abs(ball.vy - DEFAULT_GRAVITY / 60) < 1e-6);
  assert.ok(ball.y > 0);

  const parked = ball.y;
  ball.vy = 80;
  setPaused(world, true);
  step(world, 1);
  assert.equal(ball.y, parked);
  assert.equal(ball.vy, 80);

  setPaused(world, false);
  step(world, NaN);
  step(world, -1);
  assert.equal(ball.y, parked);
});

test("a long frame cannot fast-forward the fall", () => {
  const world = createWorld({ gravity: 1000, bounds: OPEN });
  const ball = addCircle(world, { x: 0, y: 0, radius: 12, restitution: 0, friction: 0 });
  step(world, 10);
  assert.ok(ball.y > 0);
  assert.ok(ball.y < 1000 * MAX_FRAME * MAX_FRAME + 5);
  assert.ok(ball.vy < 1000 * MAX_FRAME + 1);
});

test("negative gravity lifts a circle and a bad slider value is ignored", () => {
  const world = createWorld({ gravity: 0, bounds: OPEN });
  const ball = addCircle(world, { x: 0, y: 0, radius: 10, friction: 0, restitution: 0 });
  assert.equal(setGravity(world, Number.NaN), 0);
  setGravity(world, -900);
  step(world, 1 / 60);
  assert.ok(ball.vy < 0);
  assert.ok(ball.y < 0);
});

test("a dropped ball hits the floor, bounces, and stays inside the table", () => {
  const world = createWorld({
    gravity: 1600,
    bounds: { minX: -400, minY: -1200, maxX: 400, maxY: 0 },
    wallRestitution: 1,
    wallFriction: 0,
  });
  const ball = addCircle(world, {
    x: 0,
    y: -500,
    radius: 20,
    restitution: 0.85,
    friction: 0,
  });
  let bounced = false;
  let lowest = ball.y;
  for (let i = 0; i < 240; i += 1) {
    const before = ball.vy;
    step(world, 1 / 60);
    lowest = Math.max(lowest, ball.y);
    if (before > 200 && ball.vy < -150) bounced = true;
    assert.ok(ball.y + ball.radius < 8, `fell through the floor at y=${ball.y}`);
  }
  assert.equal(bounced, true);
  assert.ok(lowest > -500);
});

test("equal circles exchange horizontal speed", () => {
  const world = arena();
  const left = addCircle(world, {
    x: 0,
    y: 0,
    vx: 180,
    radius: 20,
    restitution: 1,
    friction: 0,
  });
  const right = addCircle(world, {
    x: 80,
    y: 0,
    radius: 20,
    restitution: 1,
    friction: 0,
  });
  run(world, 0.6);
  assert.ok(Math.abs(left.vx) < 12, `left vx ${left.vx}`);
  assert.ok(Math.abs(right.vx - 180) < 12, `right vx ${right.vx}`);
  assert.ok(Math.abs(left.av) < 0.2);
  assert.ok(Math.abs(right.av) < 0.2);
  assert.ok(right.x > left.x);
});

test("a static body stays put and knocks the moving body back", () => {
  const world = arena();
  const peg = addCircle(world, {
    x: 0,
    y: 0,
    radius: 30,
    static: true,
    restitution: 1,
    friction: 0,
  });
  const ball = addCircle(world, {
    x: -90,
    y: 0,
    vx: 220,
    radius: 20,
    restitution: 1,
    friction: 0,
  });
  run(world, 0.8);
  assert.equal(peg.x, 0);
  assert.equal(peg.y, 0);
  assert.equal(peg.vx, 0);
  assert.ok(ball.vx < -150, `ball vx ${ball.vx}`);
  assert.ok(ball.x < peg.x - peg.radius);
});

test("pinning a falling body freezes it, and unpinning lets it fall again", () => {
  const world = createWorld({ gravity: 1200, bounds: OPEN });
  const box = addBox(world, {
    x: 0,
    y: 0,
    width: 40,
    height: 24,
    restitution: 0,
    friction: 0,
  });
  const analytic = box.mass * (40 * 40 + 24 * 24) / 12;
  assert.ok(Math.abs(box.inertia - analytic) / analytic < 0.02);
  step(world, 1 / 30);
  assert.ok(box.y > 0);
  const pinnedAt = box.y;
  setStatic(box, true);
  run(world, 0.4);
  assert.equal(box.y, pinnedAt);
  assert.equal(box.vy, 0);
  assert.equal(box.static, true);
  setStatic(box, false);
  step(world, 1 / 30);
  assert.ok(box.y > pinnedAt);
  assert.ok(box.vy > 0);
});

test("floor friction slows a slide and ice does not", () => {
  function slide(friction) {
    const world = createWorld({
      gravity: 1400,
      bounds: { minX: -2000, minY: -400, maxX: 4000, maxY: 0 },
      wallFriction: 1,
      wallRestitution: 0,
    });
    const puck = addCircle(world, {
      x: 0,
      y: -18,
      vx: 700,
      radius: 20,
      restitution: 0,
      friction,
    });
    run(world, 0.45);
    assert.ok(puck.y + puck.radius < 6);
    return puck.vx;
  }
  const ice = slide(0);
  const rubber = slide(0.9);
  assert.ok(ice > 620, `ice vx ${ice}`);
  assert.ok(rubber < ice - 200, `rubber vx ${rubber}`);
});

test("an off-center hit spins the box", () => {
  const world = arena();
  const box = addBox(world, {
    x: 0,
    y: 0,
    width: 70,
    height: 70,
    restitution: 1,
    friction: 0,
  });
  addCircle(world, {
    x: -90,
    y: -22,
    vx: 280,
    radius: 12,
    restitution: 1,
    friction: 0,
  });
  run(world, 0.5);
  assert.ok(box.vx > 10, `box vx ${box.vx}`);
  assert.ok(box.av > 0.4, `box av ${box.av}`);
});

test("a circle comes to rest on a static box", () => {
  const world = createWorld({
    gravity: 1400,
    bounds: { minX: -300, minY: -500, maxX: 300, maxY: 200 },
    wallFriction: 0.2,
    wallRestitution: 0,
  });
  addBox(world, {
    x: 0,
    y: 20,
    width: 160,
    height: 30,
    static: true,
    restitution: 0.05,
    friction: 0.6,
  });
  const ball = addCircle(world, {
    x: 0,
    y: -180,
    radius: 18,
    restitution: 0.2,
    friction: 0.3,
  });
  run(world, 2.5);
  assert.ok(ball.y < 20 - 15, `sunk into the box at y=${ball.y}`);
  assert.ok(ball.y > -40, `missed the box at y=${ball.y}`);
  assert.ok(Math.hypot(ball.vx, ball.vy) < 40, `still moving ${ball.vx},${ball.vy}`);
});

test("a stack of boxes settles on the floor", () => {
  const world = createWorld({
    gravity: 1400,
    bounds: { minX: -200, minY: -400, maxX: 200, maxY: 0 },
    wallFriction: 0.8,
    wallRestitution: 0.2,
  });
  const boxes = [0, 1, 2].map((level) => addBox(world, {
    x: 0,
    y: -40 - level * 48,
    width: 50,
    height: 40,
    restitution: 0.05,
    friction: 0.7,
  }));
  run(world, 3);
  const centers = boxes.map((box) => box.y).sort((a, b) => a - b);
  for (const box of boxes) {
    assert.ok(Number.isFinite(box.y));
    assert.ok(box.y + 20 < 4, `box fell through at ${box.y}`);
    assert.ok(Math.abs(box.x) < 80, `box walked to ${box.x}`);
    assert.ok(Math.hypot(box.vx, box.vy) < 60, `box still flying ${box.vx},${box.vy}`);
  }
  assert.ok(centers[1] - centers[0] > 30);
  assert.ok(centers[2] - centers[1] > 30);
});

test("overlapping shapes separate instead of locking together", () => {
  const world = arena();
  const left = addBox(world, {
    x: -10,
    y: 0,
    width: 40,
    height: 40,
    angle: 0.4,
    restitution: 0.2,
    friction: 0.2,
  });
  const right = addRegularPolygon(world, {
    x: 10,
    y: 0,
    sides: 5,
    radius: 28,
    restitution: 0.2,
    friction: 0.2,
  });
  run(world, 0.8);
  const gap = Math.hypot(right.x - left.x, right.y - left.y);
  assert.ok(gap > 36, `gap ${gap}`);
  assert.ok(Math.hypot(left.vx, left.vy) < 250);
  assert.ok(Math.hypot(right.vx, right.vy) < 250);
  assert.ok(Number.isFinite(left.angle));
  assert.ok(Number.isFinite(right.angle));
});

test("picking uses the real shape and the later body wins a tie", () => {
  const world = arena();
  const floor = addBox(world, { x: 0, y: 0, width: 80, height: 20, angle: 0 });
  const gem = addRegularPolygon(world, { x: 100, y: 0, sides: 4, radius: 30 });
  const top = addCircle(world, { x: 0, y: 0, radius: 10 });
  assert.equal(bodyAt(world, 0, 0), top);
  assert.equal(bodyAt(world, 30, 0), floor);
  assert.equal(bodyAt(world, 0, 14), null);
  assert.equal(bodyAt(world, 100, 0), gem);
  assert.equal(bodyAt(world, 100 + 16, 16), null);
  assert.equal(bodyAt(world, 100, -20), gem);
  assert.equal(bodyAt(world, 400, 400), null);
  assert.equal(floor.kind, "box");
  assert.equal(gem.kind, "polygon");
  assert.equal(gem.vertices.length, 4);
});

test("a drag throws a dynamic body and only repositions a static one", () => {
  const world = arena();
  const ball = addCircle(world, { x: 0, y: 0, radius: 16, friction: 0, restitution: 0 });
  grabBody(ball, 0, 0);
  moveGrab(ball, 40, -10, 1 / 60);
  assert.equal(ball.x, 40);
  assert.equal(ball.y, -10);
  assert.ok(ball.vx > 1500);
  releaseBody(ball);
  const releasedX = ball.x;
  step(world, 1 / 60);
  assert.ok(ball.x > releasedX + 10);

  const peg = addBox(world, {
    x: 0,
    y: 40,
    width: 30,
    height: 30,
    static: true,
    friction: 0.4,
    restitution: 0.2,
  });
  grabBody(peg, 0, 40);
  moveGrab(peg, 25, 40, 1 / 60);
  releaseBody(peg);
  assert.equal(peg.x, 25);
  assert.equal(peg.vx, 0);
  run(world, 0.3);
  assert.equal(peg.x, 25);
  assert.equal(peg.y, 40);
});

test("dragging through another body pushes it", () => {
  const world = arena();
  const hand = addCircle(world, { x: 0, y: 0, radius: 20, restitution: 1, friction: 0 });
  const target = addCircle(world, { x: 70, y: 0, radius: 20, restitution: 1, friction: 0 });
  grabBody(hand, 0, 0);
  moveGrab(hand, 50, 0, 1 / 60);
  step(world, 1 / 60);
  assert.equal(hand.x, 50);
  assert.ok(target.vx > 30, `target vx ${target.vx}`);
  assert.ok(target.x > 70);
});

test("the opening table stays on the felt", () => {
  const world = createWorld({
    gravity: DEFAULT_GRAVITY,
    bounds: { minX: 40, minY: 80, maxX: 880, maxY: 560 },
  });
  seedTable(world);
  const names = world.bodies.map((body) => body.kind).sort();
  assert.deepEqual(names, ["box", "box", "box", "circle", "circle", "polygon", "polygon"]);
  assert.equal(world.bodies.filter((body) => body.static).length, 1);
  const highBall = world.bodies.find((body) => body.kind === "circle" && body.radius === 16);
  const startY = highBall.y;
  run(world, 4);
  assert.ok(highBall.y > startY);
  for (const body of world.bodies) {
    assert.ok(Number.isFinite(body.x) && Number.isFinite(body.y) && Number.isFinite(body.angle));
    assert.ok(body.x > world.bounds.minX - 4 && body.x < world.bounds.maxX + 4, `${body.kind} x ${body.x}`);
    assert.ok(body.y > world.bounds.minY - 4 && body.y < world.bounds.maxY + 4, `${body.kind} y ${body.y}`);
    assert.ok(Math.hypot(body.vx, body.vy) < 900, `${body.kind} speed ${body.vx},${body.vy}`);
  }
});
