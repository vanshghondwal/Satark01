import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from '../node_modules/esbuild/lib/main.js';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

// Bundle real TS engine and trackStatus with esbuild
const outEngine = path.join(os.tmpdir(), 'satark-engine-status.cjs');
buildSync({ entryPoints: ['src/lib/engine.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: outEngine, logLevel: 'silent' });
const { Engine } = createRequire(import.meta.url)(outEngine);

const outStatus = path.join(os.tmpdir(), 'satark-status.cjs');
buildSync({ entryPoints: ['src/lib/trackStatus.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: outStatus, logLevel: 'silent' });
const { getTrackDerivedStatus } = createRequire(import.meta.url)(outStatus);

test('T+0 or unobserved tracks never show Reliable or fake coordinates', () => {
  const e = new Engine(42, 'CLEAN');
  const views = e.views();

  for (const t of views) {
    const status = getTrackDerivedStatus(t);
    assert.equal(status.hasObservation, false);
    assert.equal(status.statusLabel, 'Awaiting data');
    assert.equal(status.positionText, 'Awaiting data');
    assert.equal(status.altitudeText, '---');
    assert.equal(status.speedText, '---');
    assert.equal(status.headingText, '---');
    assert.equal(status.reliabilityLabel, 'Not yet assessed');
    assert.notEqual(status.reliabilityLabel, 'Reliable');
    assert.equal(status.badgeText, 'Awaiting data');
    assert.equal(status.dotColor, 'var(--text-muted)');
  }
});

test('Fresh observation transitions to Reliable and shows live telemetry', () => {
  const e = new Engine(42, 'CLEAN');
  e.tick(); // t = 1000ms

  const views = e.views();
  for (const t of views) {
    const status = getTrackDerivedStatus(t);
    assert.equal(status.hasObservation, true);
    assert.ok(status.positionText.includes(','));
    assert.ok(status.altitudeText.endsWith('m'));
    assert.ok(status.speedText.endsWith('m/s'));
    assert.equal(status.reliabilityLabel, 'Reliable');
    if (!t.inZone && !t.nearZone) {
      assert.equal(status.statusLabel, 'Recent data');
      assert.equal(status.badgeText, 'Airspace Normal');
      assert.equal(status.dotColor, 'var(--success)');
    }
  }
});

test('Stale track marks current position unknown and shows last confirmed position', () => {
  const e = new Engine(42, 'MISSING_UPDATES');
  for (let i = 0; i < 20; i++) e.tick();

  const t03 = e.views().find((v) => v.id === 'T-03');
  assert.ok(t03);

  if (t03.ageSec > 4) {
    const status = getTrackDerivedStatus(t03);
    assert.equal(status.hasObservation, true);
    assert.equal(status.statusLabel, 'No recent data');
    assert.equal(status.reliabilityLabel, 'No recent data');
    assert.ok(status.positionText.startsWith('Last: '));
    assert.ok(status.altitudeText.startsWith('Last: '));
    assert.equal(status.badgeText, 'No Recent Data');
  }
});

test('Restricted zone incursions show Restricted Area Alert badge', () => {
  const e = new Engine(42, 'ZONE_ENTRY');
  for (let i = 0; i < 20; i++) e.tick();

  const t04 = e.views().find((v) => v.id === 'T-04');
  assert.ok(t04);

  if (t04.inZone) {
    const status = getTrackDerivedStatus(t04);
    assert.equal(status.badgeText, 'Restricted Area Alert');
    assert.equal(status.badgeColor, 'var(--error)');
    assert.equal(status.dotColor, 'var(--error)');
  }
});
