import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from '../node_modules/esbuild/lib/main.js';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const out = path.join(os.tmpdir(), 'satark-engine-test.cjs');
buildSync({ entryPoints: ['src/lib/engine.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'silent' });
const { Engine } = createRequire(import.meta.url)(out);

test('live pipeline fault injection passes through real ingestion and records trace', () => {
  const e = new Engine(42, 'CLEAN');
  e.tick(); // initialize baseline
  const trace = e.injectLivePipelineFault('T-01', 'DELAY');
  assert.ok(trace, 'expected pipeline trace');
  assert.equal(trace.trackId, 'T-01');
  assert.equal(trace.validation.valid, true);
  assert.ok(trace.trustLens.ageSec >= 3.5, 'latency must reflect delayed packet');
  assert.ok(e.lastPipelineTrace, 'lastPipelineTrace must be set');
});

test('invalid packet fault is rejected and original fields preserved', () => {
  const e = new Engine(42, 'CLEAN');
  e.tick();
  const trace = e.injectLivePipelineFault('T-02', 'INVALID');
  assert.ok(trace, 'expected pipeline trace');
  assert.equal(trace.validation.valid, false);
  assert.equal(trace.validation.reason, 'INVALID');
  assert.equal(trace.packet.x, 9999);
});

test('position error triggers residual anomaly and rules check', () => {
  const e = new Engine(42, 'CLEAN');
  // Need at least 2 ticks for residual calculation
  e.tick();
  e.tick();
  const trace = e.injectLivePipelineFault('T-03', 'POSITION_ERROR');
  assert.ok(trace, 'expected pipeline trace');
  assert.ok(trace.trustLens.residual > 60, 'residual must exceed 60');
  assert.equal(trace.rules.triggered, true);
});
