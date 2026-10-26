// Real-code parity test: bundles the ACTUAL src/lib/ml.ts with esbuild
// (the older ml-parity test only mirrors the formula, it does not execute
// the shipped evaluator). Also covers the MODEL UNAVAILABLE contract and
// zero-denominator benchmark rates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from '../node_modules/esbuild/lib/main.js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import os from 'node:os';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(os.tmpdir(), 'satark-ml.cjs');
buildSync({ entryPoints: ['src/lib/ml.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'silent', loader: { '.json': 'json' } });
const ml = createRequire(import.meta.url)(out);
const parity = JSON.parse(readFileSync(path.join(root, 'ml/parity_vectors.json'), 'utf8'));

test('shipped evaluator reproduces sklearn decision_function within 1e-4', () => {
  assert.equal(ml.MODEL_STATUS, 'OK');
  parity.vectors.forEach((v, i) => {
    const got = ml.evaluateMl(v);
    assert.equal(got.status, 'OK');
    assert.ok(Math.abs(got.decision - parity.decision_function[i]) < 1e-4, `vector ${i}`);
  });
});
test('malformed model or bad features return MODEL UNAVAILABLE, never a fake score', () => {
  for (const bad of [{}, { trees: [] }, { trees: [{ children_left: [1] }], scaler_mean: [0], scaler_std: [1], feature_order: [], max_samples: 10, offset: 0 }]) {
    const r = ml.evaluateWithModel(bad, [1, 0.1, 0, 0.5, 5]);
    assert.equal(r.status, 'UNAVAILABLE');
    assert.equal(r.flagged, false);
  }
  const r = ml.evaluateWithModel(ml.MODEL, [1, NaN, 0, 0.5, 5]);
  assert.equal(r.status, 'UNAVAILABLE');
  assert.equal(ml.validateModel(ml.MODEL), true);
});
test('safeRate returns null on zero denominator, never NaN or 0-by-default', () => {
  assert.equal(ml.safeRate(0, 0), null);
  assert.equal(ml.safeRate(1, 2), 0.5);
  const b = ml.runBenchmark();
  assert.equal(b.n, 400);
  assert.equal(b.mlAvailable, true);
  assert.equal(b.tp + b.fp + b.tn + b.fn, 400);
  for (const k of ['mlPrecision', 'mlRecall', 'mlFpr', 'rulePrecision', 'ruleRecall', 'ruleFpr']) {
    assert.ok(b[k] === null || (b[k] >= 0 && b[k] <= 1), `${k} must be null or in [0,1], got ${b[k]}`);
  }
});
