// Parity test: mirrors src/lib/ml.ts exactly (same sklearn 1.9.1 formula:
// _average_path_length = 2*(ln(n-1)+gamma) - 2*(n-1)/n) and checks it against
// the sklearn decision_function values recorded in ml/parity_vectors.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const model = JSON.parse(readFileSync(path.join(root, 'src/assets/model/isolation_forest.json'), 'utf8'));
const parity = JSON.parse(readFileSync(path.join(root, 'ml/parity_vectors.json'), 'utf8'));
const GAMMA = 0.5772156649015329;
const c = (n) => n <= 1 ? 0 : n === 2 ? 1 : 2 * (Math.log(n - 1) + GAMMA) - 2 * (n - 1) / n;
const pathLen = (tree, x) => {
  let node = 0, depth = 0;
  for (;;) {
    const l = tree.children_left[node], r = tree.children_right[node];
    if (l === -1) return depth + c(tree.n_node_samples[node]);
    node = x[tree.feature[node]] <= tree.threshold[node] ? l : r; depth++;
  }
};
const decision = (raw) => {
  const xs = raw.map((v, i) => (v - model.scaler_mean[i]) / model.scaler_std[i]);
  const avg = model.trees.reduce((a, t) => a + pathLen(t, xs), 0) / model.trees.length;
  const score = -(2 ** (-avg / c(model.max_samples)));
  return score - model.offset;
};

test('model metadata is the exported sklearn model', () => {
  assert.equal(model.version, 'satark-iforest-v1');
  assert.equal(model.trees.length, 40);
  assert.deepEqual(model.feature_order, ['gap_s', 'age_at_receipt_s', 'missing_recent', 'speed_change_mps', 'residual_units']);
});
test('JS evaluator reproduces sklearn decision_function within 1e-4', () => {
  parity.vectors.forEach((v, i) => {
    const got = decision(v), want = parity.decision_function[i];
    assert.ok(Math.abs(got - want) < 1e-4, `vector ${i}: got ${got}, want ${want}`);
  });
});
test('flagging direction: a clean vector is not flagged, a severe fault is', () => {
  assert.ok(decision([1.0, 0.1, 0, 0.5, 5.0]) >= 0);
  assert.ok(decision([1.0, 6.0, 4, 12.0, 180.0]) < 0);
});
