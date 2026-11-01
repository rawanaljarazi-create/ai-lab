// Small 2D impulse solver. Y grows downward, the same way the canvas does.
// Positive angles rotate clockwise on screen. The engine has no DOM dependency.

export const DEFAULT_GRAVITY = 1400;
export const MAX_FRAME = 1 / 15;
export const FIXED_DT = 1 / 120;
export const SLOP = 0.6;
export const POS_PERCENT = 0.75;
export const REST_VELOCITY = 50;
export const SLEEP_SPEED = 22;
export const SLEEP_SPIN = 0.4;
export const MAX_SPEED = 2800;
export const MAX_SPIN = 36;

const DENSITY = 1;

export function createWorld(options = {}) {
  const bounds = options.bounds ?? {};
  return {
    gravity: Number.isFinite(options.gravity) ? options.gravity : DEFAULT_GRAVITY,
    bounds: {
      minX: bounds.minX ?? 0,
      minY: bounds.minY ?? 0,
      maxX: bounds.maxX ?? 960,
      maxY: bounds.maxY ?? 640,
    },
    bodies: [],
    nextId: 1,
    paused: false,
    iterations: options.iterations ?? 10,
    wallFriction: options.wallFriction ?? 0.9,
    wallRestitution: options.wallRestitution ?? 1,
  };
}

export function addCircle(world, spec = {}) {
  const radius = Math.max(1, spec.radius ?? 28);
  const mass = DENSITY * Math.PI * radius * radius;
  const inertia = 0.5 * mass * radius * radius;
  return addBody(world, spec, {
    kind: "circle",
    radius,
    vertices: null,
    mass,
    inertia,
  });
}

export function addBox(world, spec = {}) {
  const width = Math.max(2, spec.width ?? 56);
  const height = Math.max(2, spec.height ?? 56);
  const hw = width / 2;
  const hh = height / 2;
  return addPolygon(world, {
    ...spec,
    kind: "box",
    vertices: [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    ],
  });
}

export function addRegularPolygon(world, spec = {}) {
  const sides = Math.max(3, Math.min(8, Math.floor(spec.sides ?? 5)));
  const radius = Math.max(2, spec.radius ?? 32);
  const vertices = [];
  for (let i = 0; i < sides; i += 1) {
    const theta = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    vertices.push({ x: Math.cos(theta) * radius, y: Math.sin(theta) * radius });
  }
  return addPolygon(world, { ...spec, kind: "polygon", vertices });
}

export function addPolygon(world, spec = {}) {
  const source = spec.vertices ?? [];
  if (source.length < 3) throw new Error("A polygon needs at least 3 vertices");
  const vertices = centerPolygon(windClockwise(source.map((vertex) => ({ x: vertex.x, y: vertex.y }))));
  const { mass, inertia } = polygonMass(vertices);
  let radius = 0;
  for (const vertex of vertices) radius = Math.max(radius, Math.hypot(vertex.x, vertex.y));
  return addBody(world, spec, {
    kind: spec.kind === "box" ? "box" : "polygon",
    radius: Math.max(radius, 1),
    vertices,
    mass,
    inertia,
  });
}

export function setStatic(body, isStatic) {
  body.static = !!isStatic;
  if (body.static) {
    body.invMass = 0;
    body.invInertia = 0;
    if (!body.held) {
      body.vx = 0;
      body.vy = 0;
      body.av = 0;
    }
  } else {
    body.invMass = body.mass > 0 ? 1 / body.mass : 0;
    body.invInertia = body.inertia > 0 ? 1 / body.inertia : 0;
  }
  return body;
}

export function setGravity(world, gravity) {
  if (Number.isFinite(gravity)) world.gravity = gravity;
  return world.gravity;
}

export function setPaused(world, paused) {
  world.paused = !!paused;
  return world.paused;
}

export function clearBodies(world) {
  world.bodies.length = 0;
}

export function removeBody(world, body) {
  const index = world.bodies.indexOf(body);
  if (index >= 0) world.bodies.splice(index, 1);
}

export function grabBody(body, x, y) {
  body.held = true;
  body.grabX = x - body.x;
  body.grabY = y - body.y;
  return body;
}

export function moveGrab(body, x, y, dt) {
  if (!body.held) return body;
  const targetX = x - body.grabX;
  const targetY = y - body.grabY;
  const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 1 / 240), MAX_FRAME) : 1 / 60;
  let vx = (targetX - body.x) / step;
  let vy = (targetY - body.y) / step;
  const speed = Math.hypot(vx, vy);
  if (speed > MAX_SPEED) {
    vx = (vx / speed) * MAX_SPEED;
    vy = (vy / speed) * MAX_SPEED;
  }
  body.vx = vx;
  body.vy = vy;
  body.av *= 0.9;
  body.x = targetX;
  body.y = targetY;
  return body;
}

export function releaseBody(body) {
  body.held = false;
  if (body.static) {
    body.vx = 0;
    body.vy = 0;
    body.av = 0;
  }
  const speed = Math.hypot(body.vx, body.vy);
  if (speed > MAX_SPEED) {
    body.vx = (body.vx / speed) * MAX_SPEED;
    body.vy = (body.vy / speed) * MAX_SPEED;
  }
  return body;
}

export function bodyAt(world, x, y) {
  for (let i = world.bodies.length - 1; i >= 0; i -= 1) {
    if (contains(world.bodies[i], x, y)) return world.bodies[i];
  }
  return null;
}

export function outlineOf(body) {
  if (!body.vertices) return null;
  return worldVertices(body);
}

export function step(world, dt) {
  if (world.paused) return;
  if (!Number.isFinite(dt) || dt <= 0) return;
  const frame = Math.min(dt, MAX_FRAME);
  const substeps = Math.max(1, Math.ceil(frame / FIXED_DT));
  const h = frame / substeps;
  for (let i = 0; i < substeps; i += 1) substep(world, h);
}

export function seedTable(world) {
  clearBodies(world);
  const bounds = world.bounds;
  const width = Math.max(240, bounds.maxX - bounds.minX);
  const height = Math.max(240, bounds.maxY - bounds.minY);
  const mid = (bounds.minX + bounds.maxX) / 2;
  const floor = bounds.maxY;
  const shelfY = Math.min(floor - 90, Math.max(bounds.minY + 150, floor - Math.min(height * 0.34, 230)));

  addBox(world, {
    x: mid - width * 0.05,
    y: shelfY,
    width: Math.min(width * 0.46, 320),
    height: 22,
    angle: -0.16,
    static: true,
    color: "#c4844a",
    restitution: 0.05,
    friction: 0.95,
  });
  addBox(world, {
    x: mid - width * 0.12,
    y: shelfY - 70,
    width: 58,
    height: 58,
    angle: 0.15,
    color: "#f0a202",
    restitution: 0.14,
    friction: 0.62,
  });
  addBox(world, {
    x: mid + width * 0.02,
    y: shelfY - 132,
    width: 46,
    height: 46,
    angle: -0.08,
    color: "#4c8dff",
    restitution: 0.16,
    friction: 0.5,
  });
  addCircle(world, {
    x: mid + width * 0.2,
    y: Math.max(bounds.minY + 36, shelfY - 180),
    radius: 24,
    color: "#f25c54",
    restitution: 0.78,
    friction: 0.22,
  });
  addRegularPolygon(world, {
    x: mid - width * 0.28,
    y: floor - Math.min(height * 0.48, 280),
    sides: 3,
    radius: 32,
    angle: 0.5,
    color: "#4cc9f0",
    restitution: 0.28,
    friction: 0.45,
  });
  addRegularPolygon(world, {
    x: mid + width * 0.18,
    y: floor - 78,
    sides: 5,
    radius: 30,
    color: "#b388eb",
    restitution: 0.24,
    friction: 0.55,
  });
  addCircle(world, {
    x: mid - width * 0.02,
    y: Math.max(bounds.minY + 28, floor - Math.min(height * 0.78, 460)),
    radius: 16,
    color: "#ffe66d",
    restitution: 0.86,
    friction: 0.18,
  });
}

function addBody(world, spec, shape) {
  const isStatic = !!spec.static;
  const body = {
    id: world.nextId,
    kind: shape.kind,
    static: isStatic,
    held: false,
    grabX: 0,
    grabY: 0,
    x: spec.x ?? 0,
    y: spec.y ?? 0,
    angle: spec.angle ?? 0,
    vx: spec.vx ?? 0,
    vy: spec.vy ?? 0,
    av: spec.av ?? 0,
    radius: shape.radius,
    vertices: shape.vertices,
    mass: shape.mass,
    inertia: shape.inertia,
    invMass: !isStatic && shape.mass > 0 ? 1 / shape.mass : 0,
    invInertia: !isStatic && shape.inertia > 0 ? 1 / shape.inertia : 0,
    restitution: spec.restitution ?? 0.35,
    friction: spec.friction ?? 0.4,
    color: spec.color ?? "#f2c14e",
    grounded: false,
  };
  world.nextId += 1;
  world.bodies.push(body);
  return body;
}

function substep(world, h) {
  for (const body of world.bodies) {
    body.grounded = false;
    if (body.static || body.held) continue;
    body.vy += world.gravity * h;
    clampMotion(body);
  }

  for (const body of world.bodies) {
    if (body.static || body.held) continue;
    body.x += body.vx * h;
    body.y += body.vy * h;
    body.angle += body.av * h;
  }

  const manifolds = collectManifolds(world);
  const passes = Math.max(1, world.iterations | 0);
  for (let pass = 0; pass < passes; pass += 1) {
    for (const manifold of manifolds) solveManifold(manifold);
  }
  for (const manifold of manifolds) {
    separate(manifold.a, manifold.b, manifold.nx, manifold.ny, manifold.pen);
    markGrounded(manifold.a);
    markGrounded(manifold.b);
  }

  for (const body of world.bodies) {
    if (!Number.isFinite(body.x) || !Number.isFinite(body.y) || !Number.isFinite(body.angle)) {
      body.x = (world.bounds.minX + world.bounds.maxX) / 2;
      body.y = (world.bounds.minY + world.bounds.maxY) / 2;
      body.angle = 0;
      body.vx = 0;
      body.vy = 0;
      body.av = 0;
      continue;
    }
    clampMotion(body);
    if (body.static || body.held || !body.grounded) continue;
    if (Math.hypot(body.vx, body.vy) < SLEEP_SPEED && Math.abs(body.av) < SLEEP_SPIN) {
      body.vx = 0;
      body.vy = 0;
      body.av = 0;
    }
  }
}

function collectManifolds(world) {
  const manifolds = [];
  const wall = {
    static: true,
    held: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    av: 0,
    invMass: 0,
    invInertia: 0,
    friction: world.wallFriction,
    restitution: world.wallRestitution,
  };
  const bodies = world.bodies;

  for (const body of bodies) {
    if (body.static) continue;
    for (const side of wallContacts(body, world.bounds)) {
      manifolds.push({ a: wall, b: body, nx: side.nx, ny: side.ny, pen: side.pen, points: side.points });
    }
  }

  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i];
      const b = bodies[j];
      if ((a.static || a.held) && (b.static || b.held)) continue;
      const reach = a.radius + b.radius;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      const manifold = pairManifold(a, b);
      if (manifold) manifolds.push(manifold);
    }
  }
  return manifolds;
}

function wallContacts(body, bounds) {
  const sides = [];
  if (body.kind === "circle") {
    pushSide(sides, body.x - body.radius < bounds.minX, 1, 0, bounds.minX - (body.x - body.radius), bounds.minX, body.y);
    pushSide(sides, body.x + body.radius > bounds.maxX, -1, 0, body.x + body.radius - bounds.maxX, bounds.maxX, body.y);
    pushSide(sides, body.y - body.radius < bounds.minY, 0, 1, bounds.minY - (body.y - body.radius), body.x, bounds.minY);
    pushSide(sides, body.y + body.radius > bounds.maxY, 0, -1, body.y + body.radius - bounds.maxY, body.x, bounds.maxY);
    return sides;
  }

  const groups = [
    { nx: 1, ny: 0, pen: 0, points: [] },
    { nx: -1, ny: 0, pen: 0, points: [] },
    { nx: 0, ny: 1, pen: 0, points: [] },
    { nx: 0, ny: -1, pen: 0, points: [] },
  ];
  for (const vertex of worldVertices(body)) {
    if (vertex.x < bounds.minX) noteWall(groups[0], bounds.minX - vertex.x, bounds.minX, vertex.y);
    if (vertex.x > bounds.maxX) noteWall(groups[1], vertex.x - bounds.maxX, bounds.maxX, vertex.y);
    if (vertex.y < bounds.minY) noteWall(groups[2], bounds.minY - vertex.y, vertex.x, bounds.minY);
    if (vertex.y > bounds.maxY) noteWall(groups[3], vertex.y - bounds.maxY, vertex.x, bounds.maxY);
  }
  for (const group of groups) {
    if (group.points.length === 0) continue;
    group.points.sort((p, q) => q.pen - p.pen);
    group.points = group.points.slice(0, 2);
    sides.push(group);
  }
  return sides;
}

function pushSide(sides, hit, nx, ny, pen, x, y) {
  if (!hit || pen <= 0) return;
  sides.push({ nx, ny, pen, points: [{ x, y }] });
}

function noteWall(group, pen, x, y) {
  group.pen = Math.max(group.pen, pen);
  group.points.push({ x, y, pen });
}

function pairManifold(a, b) {
  if (a.kind === "circle" && b.kind === "circle") return circleManifold(a, b);
  if (a.kind === "circle") return circleOnPolygon(a, b);
  if (b.kind === "circle") return polygonOnCircle(a, b);
  return polygonManifold(a, b);
}

function circleManifold(a, b) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const radius = a.radius + b.radius;
  const distSq = dx * dx + dy * dy;
  if (distSq >= radius * radius) return null;
  const dist = Math.sqrt(distSq);
  let nx = 1;
  let ny = 0;
  if (dist > 1e-6) {
    nx = dx / dist;
    ny = dy / dist;
  } else {
    dx = radius;
    dy = 0;
  }
  return {
    a,
    b,
    nx,
    ny,
    pen: radius - dist,
    points: [{ x: a.x + nx * (a.radius - (radius - dist) * 0.5), y: a.y + ny * (a.radius - (radius - dist) * 0.5) }],
  };
}

function circleOnPolygon(circle, poly) {
  const hit = circleHitsPolygon(circle, poly);
  if (!hit) return null;
  return { a: circle, b: poly, nx: -hit.nx, ny: -hit.ny, pen: hit.pen, points: hit.points };
}

function polygonOnCircle(poly, circle) {
  const hit = circleHitsPolygon(circle, poly);
  if (!hit) return null;
  return { a: poly, b: circle, nx: hit.nx, ny: hit.ny, pen: hit.pen, points: hit.points };
}

function circleHitsPolygon(circle, poly) {
  const verts = worldVertices(poly);
  let face = 0;
  let separation = -Infinity;
  const faces = [];
  for (let i = 0; i < verts.length; i += 1) {
    const start = verts[i];
    const end = verts[(i + 1) % verts.length];
    const ex = end.x - start.x;
    const ey = end.y - start.y;
    const length = Math.hypot(ex, ey) || 1;
    const nx = ey / length;
    const ny = -ex / length;
    const sep = (circle.x - start.x) * nx + (circle.y - start.y) * ny;
    faces.push({ nx, ny, ax: start.x, ay: start.y, bx: end.x, by: end.y, ex, ey });
    if (sep > separation) {
      separation = sep;
      face = i;
    }
  }
  if (separation > circle.radius) return null;

  const chosen = faces[face];
  if (separation <= 0.001) {
    return {
      nx: chosen.nx,
      ny: chosen.ny,
      pen: circle.radius - separation,
      points: [{ x: circle.x - chosen.nx * circle.radius, y: circle.y - chosen.ny * circle.radius }],
    };
  }

  const dotStart = (circle.x - chosen.ax) * chosen.ex + (circle.y - chosen.ay) * chosen.ey;
  const dotEnd = (circle.x - chosen.bx) * -chosen.ex + (circle.y - chosen.by) * -chosen.ey;
  if (dotStart <= 0) return circleVertex(circle, chosen.ax, chosen.ay);
  if (dotEnd <= 0) return circleVertex(circle, chosen.bx, chosen.by);
  return {
    nx: chosen.nx,
    ny: chosen.ny,
    pen: circle.radius - separation,
    points: [{ x: circle.x - chosen.nx * circle.radius, y: circle.y - chosen.ny * circle.radius }],
  };
}

function circleVertex(circle, x, y) {
  const dx = circle.x - x;
  const dy = circle.y - y;
  const dist = Math.hypot(dx, dy);
  if (dist > circle.radius || dist < 1e-6) return null;
  return {
    nx: dx / dist,
    ny: dy / dist,
    pen: circle.radius - dist,
    points: [{ x, y }],
  };
}

function polygonManifold(a, b) {
  const vertsA = worldVertices(a);
  const vertsB = worldVertices(b);
  const sat = separateAxis(vertsA, vertsB);
  if (!sat) return null;
  let nx = sat.nx;
  let ny = sat.ny;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx * nx + dy * ny < 0) {
    nx = -nx;
    ny = -ny;
  }

  const scored = [];
  for (const vertex of vertsB) {
    const depth = penetrationDepth(vertsA, vertex.x, vertex.y, SLOP);
    if (depth !== null) scored.push({ x: vertex.x, y: vertex.y, depth });
  }
  for (const vertex of vertsA) {
    const depth = penetrationDepth(vertsB, vertex.x, vertex.y, SLOP);
    if (depth !== null) scored.push({ x: vertex.x, y: vertex.y, depth });
  }
  scored.sort((p, q) => q.depth - p.depth);
  const points = [];
  for (const point of scored) {
    if (points.some((kept) => Math.hypot(kept.x - point.x, kept.y - point.y) < 1)) continue;
    points.push(point);
    if (points.length === 2) break;
  }
  if (points.length === 0) {
    let best = vertsB[0];
    let bestDot = -Infinity;
    for (const vertex of vertsB) {
      const dot = vertex.x * nx + vertex.y * ny;
      if (dot > bestDot) {
        bestDot = dot;
        best = vertex;
      }
    }
    points.push(best);
  }
  return { a, b, nx, ny, pen: sat.pen, points };
}

function separateAxis(vertsA, vertsB) {
  let minPen = Infinity;
  let nx = 0;
  let ny = 0;
  if (!axisPass(vertsA, vertsB, 1)) return null;
  if (!axisPass(vertsB, vertsA, -1)) return null;
  return { nx, ny, pen: minPen };

  function axisPass(verts, other, sign) {
    for (let i = 0; i < verts.length; i += 1) {
      const start = verts[i];
      const end = verts[(i + 1) % verts.length];
      const ex = end.x - start.x;
      const ey = end.y - start.y;
      const length = Math.hypot(ex, ey) || 1;
      const ox = ey / length;
      const oy = -ex / length;
      let support = Infinity;
      for (const vertex of other) {
        const projection = (vertex.x - start.x) * ox + (vertex.y - start.y) * oy;
        if (projection < support) support = projection;
      }
      const pen = -support;
      if (pen <= 0) return false;
      if (pen < minPen) {
        minPen = pen;
        nx = ox * sign;
        ny = oy * sign;
      }
    }
    return true;
  }
}

function solveManifold(manifold) {
  const { a, b, nx, ny, points } = manifold;
  const restitution = Math.min(Math.max(a.restitution, 0), Math.max(b.restitution, 0));
  const friction = Math.sqrt(Math.max(a.friction, 0) * Math.max(b.friction, 0));
  for (const point of points) solvePoint(a, b, nx, ny, point.x, point.y, restitution, friction);
}

function solvePoint(a, b, nx, ny, px, py, restitution, friction) {
  const relative = relativeVelocity(a, b, px, py);
  const velN = relative.x * nx + relative.y * ny;
  const invA = massScale(a);
  const invB = massScale(b);
  const iA = inertiaScale(a);
  const iB = inertiaScale(b);
  const rax = px - a.x;
  const ray = py - a.y;
  const rbx = px - b.x;
  const rby = py - b.y;
  const raN = rax * ny - ray * nx;
  const rbN = rbx * ny - rby * nx;
  const denom = invA + invB + raN * raN * iA + rbN * rbN * iB;
  if (denom <= 1e-12) return;

  let normalImpulse = 0;
  if (velN < 0) {
    const bounce = velN < -REST_VELOCITY ? restitution : 0;
    normalImpulse = (-(1 + bounce) * velN) / denom;
    applyImpulse(a, -normalImpulse * nx, -normalImpulse * ny, px, py);
    applyImpulse(b, normalImpulse * nx, normalImpulse * ny, px, py);
  }

  if (normalImpulse <= 0 || friction <= 0) return;
  const tangent = relativeVelocity(a, b, px, py);
  const tx = -ny;
  const ty = nx;
  const velT = tangent.x * tx + tangent.y * ty;
  const raT = rax * ty - ray * tx;
  const rbT = rbx * ty - rby * tx;
  const denomT = invA + invB + raT * raT * iA + rbT * rbT * iB;
  if (denomT <= 1e-12) return;
  const limit = friction * normalImpulse;
  const frictionImpulse = Math.max(-limit, Math.min(limit, -velT / denomT));
  applyImpulse(a, -frictionImpulse * tx, -frictionImpulse * ty, px, py);
  applyImpulse(b, frictionImpulse * tx, frictionImpulse * ty, px, py);
}

function separate(a, b, nx, ny, pen) {
  if (pen <= SLOP) return;
  const invA = massScale(a);
  const invB = massScale(b);
  const inv = invA + invB;
  if (inv <= 0) return;
  const magnitude = ((pen - SLOP) * POS_PERCENT) / inv;
  const cx = nx * magnitude;
  const cy = ny * magnitude;
  if (invA > 0) {
    a.x -= cx * invA;
    a.y -= cy * invA;
  }
  if (invB > 0) {
    b.x += cx * invB;
    b.y += cy * invB;
  }
}

function relativeVelocity(a, b, px, py) {
  const va = pointVelocity(a, px, py);
  const vb = pointVelocity(b, px, py);
  return { x: vb.x - va.x, y: vb.y - va.y };
}

function pointVelocity(body, px, py) {
  if (body.static && !body.held) return { x: 0, y: 0 };
  const rx = px - body.x;
  const ry = py - body.y;
  return {
    x: body.vx - body.av * ry,
    y: body.vy + body.av * rx,
  };
}

function applyImpulse(body, ix, iy, px, py) {
  if (body.static || body.held || body.invMass <= 0) return;
  body.vx += ix * body.invMass;
  body.vy += iy * body.invMass;
  const rx = px - body.x;
  const ry = py - body.y;
  body.av += (rx * iy - ry * ix) * body.invInertia;
}

function massScale(body) {
  if (body.static || body.held) return 0;
  return body.invMass;
}

function inertiaScale(body) {
  if (body.static || body.held) return 0;
  return body.invInertia;
}

function markGrounded(body) {
  if (body && !body.static && !body.held) body.grounded = true;
}

function clampMotion(body) {
  const speed = Math.hypot(body.vx, body.vy);
  if (speed > MAX_SPEED) {
    body.vx = (body.vx / speed) * MAX_SPEED;
    body.vy = (body.vy / speed) * MAX_SPEED;
  }
  if (body.av > MAX_SPIN) body.av = MAX_SPIN;
  if (body.av < -MAX_SPIN) body.av = -MAX_SPIN;
}

function contains(body, x, y) {
  const dx = x - body.x;
  const dy = y - body.y;
  if (dx * dx + dy * dy > body.radius * body.radius) return false;
  if (body.kind === "circle") return true;
  const local = toLocal(body, x, y);
  return penetrationDepth(body.vertices, local.x, local.y, 0) !== null;
}

function worldVertices(body) {
  const cosine = Math.cos(body.angle);
  const sine = Math.sin(body.angle);
  return body.vertices.map((vertex) => ({
    x: body.x + vertex.x * cosine - vertex.y * sine,
    y: body.y + vertex.x * sine + vertex.y * cosine,
  }));
}

function toLocal(body, x, y) {
  const dx = x - body.x;
  const dy = y - body.y;
  const cosine = Math.cos(body.angle);
  const sine = Math.sin(body.angle);
  return { x: dx * cosine + dy * sine, y: -dx * sine + dy * cosine };
}

function penetrationDepth(verts, x, y, slop) {
  let face = Infinity;
  for (let i = 0; i < verts.length; i += 1) {
    const start = verts[i];
    const end = verts[(i + 1) % verts.length];
    const ex = end.x - start.x;
    const ey = end.y - start.y;
    const length = Math.hypot(ex, ey) || 1;
    const separation = ((x - start.x) * ey + (y - start.y) * -ex) / length;
    if (separation > slop) return null;
    face = Math.min(face, -separation);
  }
  return face;
}

function windClockwise(vertices) {
  const copy = vertices.map((vertex) => ({ x: vertex.x, y: vertex.y }));
  if (signedArea(copy) < 0) copy.reverse();
  return copy;
}

function centerPolygon(vertices) {
  let area2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < vertices.length; i += 1) {
    const start = vertices[i];
    const end = vertices[(i + 1) % vertices.length];
    const cross = start.x * end.y - start.y * end.x;
    area2 += cross;
    cx += (start.x + end.x) * cross;
    cy += (start.y + end.y) * cross;
  }
  if (Math.abs(area2) < 1e-8) return vertices;
  cx /= 3 * area2;
  cy /= 3 * area2;
  return vertices.map((vertex) => ({ x: vertex.x - cx, y: vertex.y - cy }));
}

function polygonMass(vertices) {
  let acc = 0;
  let area2 = 0;
  for (let i = 0; i < vertices.length; i += 1) {
    const start = vertices[i];
    const end = vertices[(i + 1) % vertices.length];
    const cross = start.x * end.y - start.y * end.x;
    area2 += cross;
    acc += cross * (
      start.x * start.x + start.x * end.x + end.x * end.x +
      start.y * start.y + start.y * end.y + end.y * end.y
    );
  }
  const area = Math.abs(area2 * 0.5);
  const mass = Math.max(DENSITY * area, 1e-4);
  const inertia = area > 1e-8 ? Math.abs((mass / area) * (acc / 12)) : mass;
  return { mass, inertia: Math.max(inertia, mass) };
}

function signedArea(vertices) {
  let sum = 0;
  for (let i = 0; i < vertices.length; i += 1) {
    const start = vertices[i];
    const end = vertices[(i + 1) % vertices.length];
    sum += start.x * end.y - start.y * end.x;
  }
  return sum * 0.5;
}
