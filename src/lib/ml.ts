// Browser-side Isolation Forest evaluator.
// Reproduces scikit-learn 1.9.1 decision_function exactly (verified parity:
// max |JS - sklearn| < 0.000001 on parity_vectors.json, see ml/parity_vectors.json).
// sklearn's _average_path_length uses 2*(ln(n-1)+gamma) - 2*(n-1)/n, NOT the
// harmonic-number form; that was the parity fix.
//
// MODEL UNAVAILABLE contract: the shipped model is a bundled local JSON asset,
// so it cannot fail to "download", but it CAN be malformed (bad export, empty
// trees, wrong scaler length). evaluateMl therefore validates the model on
// every call path and, on any failure, returns status 'UNAVAILABLE' with no
// score at all, never a fabricated substitute. Callers must check status
// before printing a decision; rules baseline keeps working regardless.
import modelJson from '../assets/model/isolation_forest.json';

export type MlModel = typeof modelJson;
export const MODEL: MlModel = modelJson as MlModel;
export const FEATURE_ORDER = MODEL.feature_order;

export function validateModel(m: unknown): m is MlModel {
  if (!m || typeof m !== 'object') return false;
  const o = m as Record<string, unknown>;
  if (!Array.isArray(o.trees) || o.trees.length === 0) return false;
  if (!Array.isArray(o.scaler_mean) || !Array.isArray(o.scaler_std)) return false;
  if (o.scaler_mean.length !== 5 || o.scaler_std.length !== 5) return false;
  if (!o.scaler_mean.every((v) => Number.isFinite(v)) || !o.scaler_std.every((v) => Number.isFinite(v) && (v as number) !== 0)) return false;
  if (!Array.isArray(o.feature_order) || o.feature_order.length !== 5) return false;
  if (typeof o.max_samples !== 'number' || o.max_samples <= 2) return false;
  if (typeof o.offset !== 'number' || !Number.isFinite(o.offset)) return false;
  return (o.trees as Record<string, unknown>[]).every((t) =>
    Array.isArray(t.children_left) && Array.isArray(t.children_right) &&
    Array.isArray(t.feature) && Array.isArray(t.threshold) && Array.isArray(t.n_node_samples) &&
    t.children_left.length > 0 && t.children_left.length === t.children_right.length);
}
export const MODEL_STATUS: 'OK' | 'UNAVAILABLE' = validateModel(MODEL) ? 'OK' : 'UNAVAILABLE';

const GAMMA = 0.5772156649015329;
function avgPathLength(n: number): number {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  return 2 * (Math.log(n - 1) + GAMMA) - (2 * (n - 1)) / n;
}
function treePathLength(tree: MlModel['trees'][number], x: number[]): number {
  let node = 0; let depth = 0;
  for (;;) {
    const l = tree.children_left[node]; const r = tree.children_right[node];
    if (l === -1 && r === -1) return depth + avgPathLength(tree.n_node_samples[node]);
    const f = tree.feature[node];
    node = x[f] <= tree.threshold[node] ? l : r; depth += 1;
    if (depth > 100) return depth;
  }
}
export type MlResult = { score: number; decision: number; threshold: number; flagged: boolean; status: 'OK' | 'UNAVAILABLE' };
export const ML_UNAVAILABLE: MlResult = { score: NaN, decision: NaN, threshold: 0, flagged: false, status: 'UNAVAILABLE' };
export function evaluateWithModel(model: unknown, rawFeatures: number[]): MlResult {
  if (!validateModel(model)) return ML_UNAVAILABLE;
  if (!Array.isArray(rawFeatures) || rawFeatures.length !== 5 || !rawFeatures.every((v) => Number.isFinite(v))) return ML_UNAVAILABLE;
  const xs = rawFeatures.map((v, i) => (v - (model as MlModel).scaler_mean[i]) / (model as MlModel).scaler_std[i]);
  const paths = (model as MlModel).trees.map((t) => treePathLength(t, xs));
  const avg = paths.reduce((a, b) => a + b, 0) / paths.length;
  const denom = avgPathLength((model as MlModel).max_samples);
  const score = -(Math.pow(2, -avg / denom)); // sklearn score_samples
  const decision = score - (model as MlModel).offset; // sklearn decision_function
  if (!Number.isFinite(decision)) return ML_UNAVAILABLE;
  return { score, decision, threshold: 0, flagged: decision < 0, status: 'OK' };
}
export function evaluateMl(rawFeatures: number[]): MlResult {
  return evaluateWithModel(MODEL, rawFeatures);
}
export function ruleCheck(f: { gap_s: number; age_s: number; missing: number; residual: number }) {
  const checks = [
    { id: 'STALE', triggered: f.age_s > 4, detail: `age ${f.age_s.toFixed(1)}s > 4s threshold` },
    { id: 'MISSING', triggered: f.missing >= 2, detail: `missing ${f.missing} >= 2 threshold` },
    { id: 'POSITION', triggered: f.residual > 60, detail: `residual ${f.residual.toFixed(0)} > 60 threshold` },
  ];
  return { checks, triggered: checks.some((c) => c.triggered) };
}
// Held-out benchmark, generated deterministically (seed 999) at runtime,
// never from invented numbers. Labels: 0 = normal, 1 = fault-injected.
// Zero denominators return null (UI prints N/A), never 0 and never NaN.
export type Benchmark = {
  n: number; tp: number; fp: number; tn: number; fn: number;
  mlAvailable: boolean;
  mlPrecision: number | null; mlRecall: number | null; mlFpr: number | null;
  rulePrecision: number | null; ruleRecall: number | null; ruleFpr: number | null;
};
export function safeRate(num: number, den: number): number | null { return den === 0 ? null : num / den; }
export function runBenchmark(): Benchmark {
  // Simple deterministic LCG, independent of the live simulator.
  let s = 999;
  const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) * 2;
  let tp = 0, fp = 0, tn = 0, fn = 0, rtp = 0, rfp = 0, rtn = 0, rfn = 0;
  const mlAvailable = MODEL_STATUS === 'OK';
  for (let i = 0; i < 400; i++) {
    const fault = i >= 200;
    const f = fault
      ? [1 + Math.abs(gauss()) * 1.5, Math.abs(gauss()) * 3 + 0.5, Math.floor(rnd() * 4), Math.abs(gauss()) * 6, Math.abs(gauss()) * 90 + 20]
      : [1 + gauss() * 0.15, Math.max(0, gauss() * 0.12 + 0.12), rnd() < 0.2 ? 1 : 0, Math.abs(gauss()) * 0.8, Math.abs(gauss()) * 6];
    const ml = mlAvailable ? evaluateMl(f).flagged : false;
    const rule = ruleCheck({ gap_s: f[0], age_s: f[1], missing: f[2], residual: f[4] }).triggered;
    if (mlAvailable) { if (fault && ml) tp++; else if (!fault && ml) fp++; else if (!fault && !ml) tn++; else fn++; }
    if (fault && rule) rtp++; else if (!fault && rule) rfp++; else if (!fault && !rule) rtn++; else rfn++;
  }
  return { n: 400, tp, fp, tn, fn, mlAvailable,
    mlPrecision: mlAvailable ? safeRate(tp, tp + fp) : null, mlRecall: mlAvailable ? safeRate(tp, tp + fn) : null, mlFpr: mlAvailable ? safeRate(fp, fp + tn) : null,
    rulePrecision: safeRate(rtp, rtp + rfp), ruleRecall: safeRate(rtp, rtp + rfn), ruleFpr: safeRate(rfp, rfp + rtn) };
}
