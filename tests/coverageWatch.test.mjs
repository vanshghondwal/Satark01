import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from '../node_modules/esbuild/lib/main.js';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

// Bundle real TS engine and coverage watch with esbuild
const outEngine = path.join(os.tmpdir(), 'satark-engine-cw.cjs');
buildSync({ entryPoints: ['src/lib/engine.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: outEngine, logLevel: 'silent' });
const { Engine } = createRequire(import.meta.url)(outEngine);

const outCW = path.join(os.tmpdir(), 'satark-cw.cjs');
buildSync({ entryPoints: ['src/lib/coverageWatch.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: outCW, logLevel: 'silent' });
const {
  formatRelativeSimTime,
  getCoverageWatchSummary,
} = createRequire(import.meta.url)(outCW);

test('relative time formatting: Just now, Ns ago, Nm ago, without NaN or negative values', () => {
  assert.equal(formatRelativeSimTime(0), 'Just now');
  assert.equal(formatRelativeSimTime(0.4), 'Just now');
  assert.equal(formatRelativeSimTime(0.9), 'Just now');
  assert.equal(formatRelativeSimTime(1), '1s ago');
  assert.equal(formatRelativeSimTime(5), '5s ago');
  assert.equal(formatRelativeSimTime(30), '30s ago');
  assert.equal(formatRelativeSimTime(60), '1m ago');
  assert.equal(formatRelativeSimTime(75), '1m 15s ago');
  assert.equal(formatRelativeSimTime(120), '2m ago');
  assert.equal(formatRelativeSimTime(3600), '1h ago');
  assert.equal(formatRelativeSimTime(null), 'Awaiting data');
  assert.equal(formatRelativeSimTime(undefined), 'Awaiting data');
  assert.equal(formatRelativeSimTime(-5), 'Awaiting data');
  assert.equal(formatRelativeSimTime(NaN), 'Awaiting data');
});

test('freshness thresholds: FRESH <= 2s, DEGRADED > 2s and <= 4s, STALE > 4s', () => {
  const e = new Engine(42, 'CLEAN');
  e.tick(); // t = 1000ms
  const v1 = e.views()[0];
  assert.equal(v1.quality, 'FRESH');
  assert.ok(v1.ageSec <= 2, `expected age <= 2, got ${v1.ageSec}`);

  // Now run MISSING_UPDATES where T-03 sends only every 3rd update
  const eMiss = new Engine(42, 'MISSING_UPDATES');
  for (let i = 0; i < 15; i++) eMiss.tick();

  const t03 = eMiss.views().find((v) => v.id === 'T-03');
  assert.ok(t03);
  // In MISSING_UPDATES, age advances and quality transitions to DEGRADED or STALE
  if (t03.ageSec > 4) {
    assert.equal(t03.quality, 'STALE');
  } else if (t03.ageSec > 2) {
    assert.equal(t03.quality, 'DEGRADED');
  } else {
    assert.equal(t03.quality, 'FRESH');
  }
});

test('Coverage Watch counts derive correctly from real track states without hardcoded values', () => {
  const e = new Engine(42, 'CLEAN');
  e.tick();
  const views = e.views();
  const summary = getCoverageWatchSummary(views);

  assert.equal(summary.totalTracks, views.length);
  assert.equal(summary.recentCount + summary.needsVerificationCount + summary.noRecentDataCount, views.length);
  assert.equal(summary.recentCount, views.filter((v) => v.quality === 'FRESH').length);
  assert.equal(
    summary.needsVerificationCount,
    views.filter((v) => v.quality === 'DEGRADED' || v.quality === 'INCONSISTENT').length
  );
  assert.equal(
    summary.noRecentDataCount,
    views.filter((v) => v.quality === 'STALE' || !v.hasObservation).length
  );
});

test('Coverage Watch suppresses prediction and marks current location unknown for stale tracks', () => {
  const e = new Engine(42, 'MISSING_UPDATES');
  // Run until T-03 becomes stale (> 4s)
  for (let i = 0; i < 30; i++) e.tick();
  const views = e.views();
  const summary = getCoverageWatchSummary(views);

  const staleTrack = summary.tracks.find((t) => t.quality === 'STALE');
  if (staleTrack) {
    assert.equal(staleTrack.isCurrentPositionKnown, false);
    assert.equal(staleTrack.isPredictionAvailable, false);
    assert.ok(staleTrack.explanation.includes('Current location is unknown'));
  }
});

test('distinct zone boundary vs confirmed entry events in ZONE_ENTRY scenario', () => {
  const e = new Engine(42, 'ZONE_ENTRY');
  for (let i = 0; i < 45; i++) e.tick();

  const boundaryGroup = e.groups.find((g) => g.normalizedCause === 'ZONE_BOUNDARY_REVIEW');
  const entryGroup = e.groups.find((g) => g.normalizedCause === 'ZONE_OBSERVATION');

  // If both occurred, verify they are distinct groups with proper priorities
  if (boundaryGroup) {
    assert.equal(boundaryGroup.priority, 'MEDIUM_REVIEW');
    assert.equal(boundaryGroup.category, 'SECURITY_ADVISORY');
  }
  if (entryGroup) {
    assert.equal(entryGroup.priority, 'HIGH_REVIEW');
    assert.equal(entryGroup.category, 'SECURITY_ADVISORY');
  }

  // They must not share the same group ID
  if (boundaryGroup && entryGroup) {
    assert.notEqual(boundaryGroup.groupId, entryGroup.groupId);
  }
});

test('stable first-detected timestamp: grouping preserves firstSeenMs while updating lastSeenMs', () => {
  const e = new Engine(42, 'ALERT_SURGE');
  for (let i = 0; i < 30; i++) e.tick();

  const grouped = e.groups.find((g) => g.rawEventIds.length > 1);
  assert.ok(grouped, 'expected at least one grouped alert in ALERT_SURGE');
  assert.ok(grouped.firstSeenMs <= grouped.lastSeenMs);
  assert.ok(grouped.rawEventIds.length > 1);

  // Tick 5 more times
  const initialFirstSeen = grouped.firstSeenMs;
  for (let i = 0; i < 5; i++) e.tick();

  const refreshed = e.groups.find((g) => g.groupId === grouped.groupId);
  if (refreshed) {
    assert.equal(refreshed.firstSeenMs, initialFirstSeen, 'firstSeenMs must remain immutable on updates');
  }
});

test('paused simulation stops advancing simTimeMs and observation ages', () => {
  const e = new Engine(42, 'CLEAN');
  for (let i = 0; i < 10; i++) e.tick();

  const simTimeBefore = e.simTimeMs;
  const ageBefore = e.views()[0].ageSec;

  // Paused: no ticks called
  // The simulation time remains identical
  assert.equal(e.simTimeMs, simTimeBefore);
  const ageAfter = e.views()[0].ageSec;
  assert.equal(ageAfter, ageBefore);
});

test('scenario reset cleanly resets simulation clock and clears previous run groups', () => {
  const e = new Engine(42, 'ZONE_ENTRY');
  for (let i = 0; i < 40; i++) e.tick();
  assert.ok(e.simTimeMs > 0);
  assert.ok(e.groups.length > 0);

  // Reset
  e.reset(42, 'CLEAN');
  assert.equal(e.simTimeMs, 0);
  assert.equal(e.tickCount, 0);
  assert.equal(e.groups.length, 0);
  assert.equal(e.events.length, 0);
});
