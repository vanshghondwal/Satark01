"""Train a real IsolationForest on synthetic NORMAL telemetry-quality features.
Synthetic only. No real sensor data. Exports trees + scaler + metadata to
web/src/assets/model/isolation_forest.json for the browser evaluator.
Feature order (fixed, must match JS):
  0 gap_s           - seconds between this and previous accepted observation
  1 age_at_receipt  - receivedAt - observedAt, seconds
  2 missing_recent  - missing updates counted in the last 10 simulated seconds
  3 speed_change    - |speed - previous speed|, m/s
  4 residual        - distance vs linear extrapolation from previous points, units
"""
import json, math, os
import numpy as np
from sklearn.ensemble import IsolationForest

rng = np.random.default_rng(42)
N = 4000
# Normal operating envelope only (unsupervised training data).
gap = rng.normal(1.0, 0.15, N).clip(0.5, 1.6)
age = rng.exponential(0.12, N).clip(0.0, 0.6)
missing = rng.choice([0, 0, 0, 0, 1], size=N).astype(float)
speed_change = np.abs(rng.normal(0, 0.8, N)).clip(0, 3.0)
residual = np.abs(rng.normal(0, 6.0, N)).clip(0, 25.0)
X = np.column_stack([gap, age, missing, speed_change, residual])

mean = X.mean(axis=0)
std = X.std(axis=0)
std[std == 0] = 1.0
Xs = (X - mean) / std

model = IsolationForest(
    n_estimators=40, max_samples=256, contamination=0.05,
    random_state=42, n_jobs=-1,
)
model.fit(Xs)

def tree_to_dict(tree):
    t = tree.tree_
    return {
        "children_left": t.children_left.tolist(),
        "children_right": t.children_right.tolist(),
        "feature": t.feature.tolist(),
        "threshold": t.threshold.tolist(),
        "n_node_samples": t.n_node_samples.tolist(),
    }

out = {
    "version": "satark-iforest-v1",
    "trained_on": "synthetic normal telemetry-quality features only (seed 42, n=4000)",
    "feature_order": ["gap_s", "age_at_receipt_s", "missing_recent", "speed_change_mps", "residual_units"],
    "scaler_mean": mean.tolist(),
    "scaler_std": std.tolist(),
    "offset": float(model.offset_),
    "n_estimators": int(model.n_estimators),
    "max_samples": int(model.max_samples_) if hasattr(model, "max_samples_") else 256,
    "contamination": 0.05,
    "trees": [tree_to_dict(e) for e in model.estimators_],
}
os.makedirs("../web/src/assets/model", exist_ok=True)
# paths: script runs from ml/ ; write next to web src
base = os.path.dirname(os.path.abspath(__file__))
dest = os.path.join(base, "..", "src", "assets", "model", "isolation_forest.json")
os.makedirs(os.path.dirname(dest), exist_ok=True)
with open(dest, "w") as f:
    json.dump(out, f)
print("wrote", dest)
print("offset", model.offset_, "max_samples_", model.max_samples_)

# Parity vectors: normal, delayed, jump, missing-heavy, stale
vectors = [
    [1.0, 0.1, 0, 0.5, 5.0],
    [1.0, 3.5, 0, 0.5, 5.0],
    [1.0, 0.1, 0, 0.5, 140.0],
    [4.5, 0.1, 3, 0.5, 5.0],
    [1.0, 6.0, 4, 12.0, 180.0],
    [2.2, 1.8, 2, 4.0, 70.0],
]
with open(os.path.join(base, "parity_vectors.json"), "w") as f:
    json.dump({"vectors": vectors,
               "decision_function": model.decision_function((np.array(vectors) - mean) / std).tolist(),
               "score_samples": model.score_samples((np.array(vectors) - mean) / std).tolist(),
               "predict": model.predict((np.array(vectors) - mean) / std).tolist()}, f, indent=2)
print("decision_function", model.decision_function((np.array(vectors) - mean) / std).tolist())
print("score_samples", model.score_samples((np.array(vectors) - mean) / std).tolist())
