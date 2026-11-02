import assert from "node:assert/strict";
import test from "node:test";
import { arcGap, buildHarbor, placeOnTrack, pointAt, project } from "../src/track.js";

test("the harbor circuit is a closed loop with room to race", () => {
  const track = buildHarbor();
  assert.ok(track.samples.length > 200);
  assert.ok(track.length > 700 && track.length < 1600, `length ${track.length}`);
  assert.equal(track.half * 2, track.width);
  const first = track.samples[0];
  const placed = placeOnTrack(track, 0, 0);
  assert.ok(Math.hypot(placed.x - first.x, placed.z - first.z) < 2);
});

test("a point on the racing line projects to the middle of the asphalt", () => {
  const track = buildHarbor();
  const mid = pointAt(track, 0.37);
  const seen = project(track, mid.x, mid.z);
  assert.ok(Math.abs(seen.lateral) < 0.75, `lateral ${seen.lateral}`);
  assert.ok(Math.abs(seen.t - 0.37) < 0.02 || Math.abs(seen.t - 0.37) > 0.98);
});

test("offsetting along the left normal reads as a positive lateral", () => {
  const track = buildHarbor();
  const mid = pointAt(track, 0.22);
  const x = mid.x + mid.nx * 3;
  const z = mid.z + mid.nz * 3;
  const seen = project(track, x, z);
  assert.ok(seen.lateral > 2, `lateral ${seen.lateral}`);
});

test("the circuit does not fold into itself", () => {
  const track = buildHarbor();
  const samples = track.samples;
  for (let i = 0; i < samples.length; i += 8) {
    for (let j = i + 8; j < samples.length; j += 8) {
      const gap = arcGap(track, samples[i].s, samples[j].s);
      if (gap < 46) continue;
      const dist = Math.hypot(samples[i].x - samples[j].x, samples[i].z - samples[j].z);
      assert.ok(dist > track.width, `samples ${i} and ${j} are ${dist.toFixed(1)}m apart`);
    }
  }
});

test("the grid sits on a gentle stretch", () => {
  const track = buildHarbor();
  const here = pointAt(track, 0.984);
  const ahead = pointAt(track, 0.984 + 24 / track.length);
  const turn = Math.atan2(Math.sin(ahead.heading - here.heading), Math.cos(ahead.heading - here.heading));
  assert.ok(Math.abs(turn) < 0.45, `turn ${turn}`);
});
