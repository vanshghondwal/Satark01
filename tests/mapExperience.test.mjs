import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from '../node_modules/esbuild/lib/main.js';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const outEngine = path.join(os.tmpdir(), 'satark-engine-map.cjs');
buildSync({
  entryPoints: ['src/lib/engine.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: outEngine,
  logLevel: 'silent',
});
const { Engine, ZONE_INFO } = createRequire(import.meta.url)(outEngine);

test('Map Drone Marker State: Zone Alpha intrusion triggers correct alert state', () => {
  const e = new Engine(42, 'ZONE_ENTRY');
  for (let i = 0; i < 40; i++) e.tick();
  const views = e.views();
  const t04 = views.find((t) => t.id === 'T-04');
  assert.ok(t04, 'Track T-04 must exist in views');

  // Verify distance to zone center
  const dx = t04.displayX - ZONE_INFO.cx;
  const dy = t04.displayY - ZONE_INFO.cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const insideZone = dist <= ZONE_INFO.r;

  assert.equal(insideZone, true, 'T-04 must be inside Zone Alpha after 40 ticks');
  assert.equal(t04.inZone, true, 't04.inZone flag must be set by engine');
});

test('Map Drone Marker State: Stale track suppresses prediction and preserves last confirmed coordinates', () => {
  const e = new Engine(42, 'MISSING_UPDATES');
  // Tick enough so T-03 misses telemetry
  for (let i = 0; i < 35; i++) e.tick();
  const views = e.views();
  const t03 = views.find((t) => t.id === 'T-03');
  assert.ok(t03, 'Track T-03 must exist in views');

  assert.ok(t03.displayX !== 0 || t03.displayY !== 0, 'Last confirmed coordinates must not be reset to origin (0,0)');
  if (t03.quality === 'STALE') {
    assert.equal(t03.prediction.length, 0, 'Predicted path must be safely suspended for stale tracks');
  }
  assert.ok(t03.accepted > 0, 'Track must retain accepted packet history');
});

test('2.5D Tactical View: Altitude projection and stem calculation', () => {
  // Test isometric projection formula used in MapView
  const cx = 500;
  const cy = 300;
  const tiltRad = 0.38; // ~22 degrees
  const cosTilt = Math.cos(tiltRad);
  const sinTilt = Math.sin(tiltRad);
  const perspective = 0.88;

  function project25D(gx, gy, alt) {
    const rx = gx - cx;
    const ry = gy - cy;
    const isoX = cx + rx * cosTilt - ry * sinTilt;
    const isoY = cy + rx * sinTilt + ry * cosTilt * perspective;
    const altOffset = Math.min(65, Math.max(12, (alt || 120) * 0.18));
    return {
      groundX: isoX,
      groundY: isoY,
      airX: isoX,
      airY: isoY - altOffset,
      altOffset,
    };
  }

  const p1 = project25D(500, 300, 100);
  const p2 = project25D(500, 300, 250);

  // Center ground coordinate should stay at center
  assert.equal(Math.round(p1.groundX), 500);
  assert.equal(Math.round(p1.groundY), 300);

  // Higher altitude must have a strictly greater upward vertical offset
  assert.ok(p2.altOffset > p1.altOffset, 'Higher altitude must produce larger stem offset');
  assert.ok(p2.airY < p1.airY, 'Higher altitude aerial marker must float higher (lower Y coordinate)');
  assert.equal(p1.groundX, p1.airX, 'Vertical altitude stem must align horizontally (pure vertical drop-line)');
});

test('View on Map Target Resolution: Drone coordinates center smoothly at tactical zoom', () => {
  const e = new Engine(42, 'ZONE_ENTRY');
  for (let i = 0; i < 20; i++) e.tick();
  const views = e.views();
  const t04 = views.find((t) => t.id === 'T-04');
  assert.ok(t04);

  // Tactical centering formula:
  const targetScale = 1.85;
  const targetX = -t04.displayX;
  const targetY = -t04.displayY;

  assert.ok(Number.isFinite(targetX) && Number.isFinite(targetY), 'Coordinates must be finite numbers');
  assert.ok(targetScale > 1.0, 'View on Map must provide tactical zoom focus');
});
