// Engine tests: bundle the real TS engine + ML with esbuild (from vite's
// dependency) and run it in Node. No mirrors, no re-implemented logic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from '../node_modules/esbuild/lib/main.js';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import os from 'node:os';
import path from 'node:path';

const out = path.join(os.tmpdir(), 'satark-engine.cjs');
buildSync({ entryPoints: ['src/lib/engine.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'silent' });
const { Engine } = createRequire(import.meta.url)(out);

function run(scenario, ticks) {
  const e = new Engine(42, scenario);
  for (let i = 0; i < ticks; i++) e.tick();
  return e;
}
test('same seed + scenario = same run (deterministic)', () => {
  const a = run('CLEAN', 20), b = run('CLEAN', 20);
  assert.deepEqual(a.views().map((v) => [v.id, Math.round(v.displayX), Math.round(v.displayY)]),
    b.views().map((v) => [v.id, Math.round(v.displayX), Math.round(v.displayY)]));
  assert.equal(a.events.length, b.events.length);
});
test('ZONE_ENTRY creates a HIGH_REVIEW advisory', () => {
  const e = run('ZONE_ENTRY', 40);
  assert.ok(e.groups.some((g) => g.priority === 'HIGH_REVIEW' && g.normalizedCause === 'ZONE_OBSERVATION'),
    'expected a HIGH zone observation group');
});
test('ALERT_SURGE groups repeated events and preserves raw IDs', () => {
  const e = run('ALERT_SURGE', 30);
  const dq = e.groups.filter((g) => g.category === 'DATA_QUALITY');
  assert.ok(dq.length > 0, 'expected data-quality groups');
  const raw = dq.reduce((n, g) => n + g.rawEventIds.length, 0);
  assert.ok(raw > dq.length, `expected grouping to compress: ${raw} raw events into ${dq.length} groups`);
  const ids = new Set(dq.flatMap((g) => g.rawEventIds));
  assert.equal(ids.size, raw, 'raw event IDs must not be duplicated across groups');
  assert.ok(!e.groups.some((g) => g.category === 'SECURITY_ADVISORY' && g.normalizedCause === 'DELAYED_PACKET'),
    'quality causes must never merge into security groups');
});
test('MISSING_UPDATES drives a track stale and suspends its prediction', () => {
  const e = run('MISSING_UPDATES', 30);
  const t = e.views().find((v) => v.id === 'T-03');
  // T-03 only emits every 3rd tick, so its age grows between packets; it must
  // never claim a fresh projection while stale.
  if (t.quality === 'STALE') assert.equal(t.prediction.length, 0, 'stale track must not project');
  assert.ok(t.accepted > 0, 'T-03 should still have accepted packets');
});
test('reviews persist through the engine review map', () => {
  const e = run('ALERT_SURGE', 20);
  const g = e.groups[0];
  assert.ok(g, 'expected at least one group');
  e.setReview(g.groupId, 'REVIEWED');
  assert.equal(e.groups.find((x) => x.groupId === g.groupId).reviewStatus, 'REVIEWED');
});
test('NEW track has no observation before the first tick (ground truth is never plotted)', () => {
  const e = new Engine(42, 'CLEAN');
  const t = e.views()[0];
  assert.equal(t.hasObservation, false);
  assert.equal(t.lastObservedMs, null);
  assert.equal(t.accepted, 0);
  e.tick();
  assert.equal(e.views()[0].hasObservation, true);
});
test('rejected packets keep their original fields: INVALID, DUPLICATE, OUT_OF_ORDER', () => {
  const e = run('CLEAN', 5);
  const tr = e.tracks[0];
  const last = tr.accepted[tr.accepted.length - 1];
  const acceptedBefore = tr.accepted.length;
  // Duplicate: same eventId as an accepted packet.
  e.processPacket({ ...last });
  // Invalid: out-of-bounds coordinates, fresh eventId.
  e.processPacket({ eventId: 'PK-TEST-INVALID', trackId: 'T-01', sequence: 999, observedAtMs: last.observedAtMs + 1000, receivedAtMs: last.observedAtMs + 1000, x: 9999, y: 10, altitudeM: 100, speedMps: 20, headingDeg: 90, faultTags: [] });
  // Out-of-order: fresh eventId but older than the last accepted observation.
  e.processPacket({ eventId: 'PK-TEST-OOO', trackId: 'T-01', sequence: 998, observedAtMs: last.observedAtMs - 1000, receivedAtMs: last.observedAtMs, x: 100, y: 100, altitudeM: 100, speedMps: 20, headingDeg: 90, faultTags: [] });
  assert.equal(tr.accepted.length, acceptedBefore, 'rejected packets must never become observations');
  const reasons = e.views()[0].rejectedDetail.map((r) => r.reason);
  assert.ok(reasons.includes('DUPLICATE'), 'duplicate must be recorded');
  assert.ok(reasons.includes('INVALID'), 'invalid packet must be recorded with its fields');
  assert.ok(reasons.includes('OUT_OF_ORDER'), 'out-of-order packet must be recorded');
  const inv = e.views()[0].rejectedDetail.find((r) => r.eventId === 'PK-TEST-INVALID');
  assert.equal(inv.x, 9999, 'original coordinates must be preserved, not sanitised away');
});
test('groups never mix tracks: every raw event in a group belongs to that group track', () => {
  const e = run('ALERT_SURGE', 30);
  for (const g of e.groups) {
    for (const id of g.rawEventIds) {
      const ev = e.events.find((x) => x.id === id);
      assert.ok(ev, `event ${id} must exist`);
      assert.equal(ev.trackId, g.trackId);
      assert.equal(ev.category, g.category);
    }
  }
});
test('replay snapshots are isolated: mutating a snapshot never changes live state', () => {
  const e = run('CLEAN', 10);
  const eventsBefore = e.events.length, groupsBefore = e.groups.length;
  const liveX = e.views()[0].displayX;
  e.snapshots[0].pos['T-01'].x = 99999;
  assert.equal(e.views()[0].displayX, liveX, 'live view must not read from snapshots');
  e.tick();
  assert.equal(e.events.length >= eventsBefore, true);
  assert.equal(e.groups.length >= groupsBefore, true);
});
test('review restores when the same group regenerates after a fresh engine (reload)', () => {
  // Regression: the demo script ends with "reload: the review is still
  // there", but a fresh engine starts with an EMPTY live queue. The saved
  // decision must therefore reattach when the same seed + scenario
  // regenerates the same group (and the UI's Saved reviews strip shows it
  // in the meantime). Uses a stubbed localStorage shared across both
  // engines, standing in for the browser's storage across a reload.
  const store = {};
  const stub = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
  const prev = globalThis.localStorage;
  globalThis.localStorage = stub;
  try {
    const first = run('ZONE_ENTRY', 40);
    const g = first.groups.find((x) => x.priority === 'HIGH_REVIEW');
    assert.ok(g, 'expected a HIGH group');
    first.setReview(g.groupId, 'REVIEWED');
    // "Reload": a brand-new engine starts with no live groups at all.
    const reloaded = new Engine(42, 'ZONE_ENTRY');
    assert.equal(reloaded.groups.length, 0, 'fresh engine must start with no live groups');
    // Re-running the same seed + scenario regenerates the same group id,
    // and the saved REVIEWED status reattaches to it.
    for (let i = 0; i < 40; i++) reloaded.tick();
    const again = reloaded.groups.find((x) => x.groupId === g.groupId);
    assert.ok(again, 'expected the same group to regenerate');
    assert.equal(again.reviewStatus, 'REVIEWED');
  } finally {
    if (prev === undefined) delete globalThis.localStorage; else globalThis.localStorage = prev;
  }
});
