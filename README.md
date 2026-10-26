# SATARK — See the sky. Verify the signal.

**Problem Statement 2: Counter-Drone Monitoring & Airspace Security (Military & Armed Forces — Defense Technology theme).**
Browser-based, simulation-driven, offline-capable dashboard. **SIMULATION / NON-OPERATIONAL prototype — not an official Indian Army system.** No real sensor feeds, no classified data, no targeting, no interdiction, no hostile-intent inference.

Renamed from the PRD's working title “VAYU TRACE” to **SATARK** throughout (app title, sidebar, login, demo ID, README, model version).

## Demo in 2 minutes
```bash
npm install
npm run dev        # http://localhost:5173
# or: npm run build && npm run preview
```
1. Home → **Enter Demo** → **Fill demo credentials** → Enter Command Center.
   - Demo User ID: `SATARK-DEMO-001`
   - Demo Password: `SatarkDemo@2026!`
   - Role label: Simulation Operator (Demo). Public test data only; the gate is UX gating, not verified access.
2. Press **Start**. 8 tracks move at ~1 packet/track/second on the fictional XY map.
3. Try **ZONE_ENTRY** → a HIGH_REVIEW advisory appears → click **Evidence** → **Mark reviewed** → reload the page: before you restart the run, the Saved reviews strip above the queue shows the review is still there (browser-local storage).
4. Try **ALERT_SURGE** → expand a Data Quality group and count the raw event IDs — none are deleted.
5. Open **Proof Mode** → pick a track + fault → compare Rules vs ML → **Run held-out benchmark** → **Inject into live stream**, then Start and watch the same fault flow through the real pipeline.
6. Open **Replay** → step/play through recorded snapshots → **Return to Live**.

## What is real here (not placeholder)
- Seeded simulator (`src/lib/engine.ts`): ground-truth state is private; the UI only ever sees delivered packets, which can be late, missing, duplicated/out-of-order, or position-corrupted. Same seed + scenario = same run.
- Freshness: FRESH ≤2s, DEGRADED ≤4s, STALE >4s (configurable demo thresholds). Stale tracks show last-confirmed position only, current position UNKNOWN, projection suspended.
- Prediction: constant-velocity from the last two accepted observations, 5/10/15s, labelled “estimate, not guarantee”, withheld when stale/inconsistent.
- Zones: fictional Exercise Zone Alpha (centre 520,480, radius 170, +60 boundary-review ring). Advisories only from accepted fresh observations.
- Mission Focus grouping: same track + category + normalised cause within a consecutive 10s window. Security and data-quality groups never merge.
- ML: a real Isolation Forest trained in Python with scikit-learn 1.9.1 on synthetic normal telemetry-quality features only (`ml/train.py`, seed 42, n=4000, 40 trees). The browser evaluator (`src/lib/ml.ts`) reproduces sklearn `decision_function` — parity verified exactly (max diff < 0.000001 on `ml/parity_vectors.json`, see `npm test`). If the model file failed to load, the UI would show model-unavailable instead of inventing a score (it loads as a bundled local JSON asset).
- Benchmark in Proof Mode is computed at click time from a deterministic held-out set (400 cases, seed 999: 200 normal, 200 fault-injected). Zero denominators show N/A.
- A track with no accepted packet yet shows "No observation yet" — its ground-truth position is never plotted as if observed. Rejected packets (INVALID / DUPLICATE / OUT_OF_ORDER) keep their original fields and are inspectable in the track drawer; they never become observations and never overwrite a newer accepted one.
- If the local model cannot be validated, every ML surface shows MODEL UNAVAILABLE and no score is printed; the rules baseline and live monitoring keep working. The shipped model validates OK (see `npm test`).
- Offline states in the Command Center header: ONLINE — SIMULATION, OFFLINE SIMULATION, and DATA STALE (when any track is last-confirmed only). Disconnecting never pretends fresh physical sensor data exists — all data is labelled simulation.
- Every button does something: search (⌘K/Ctrl+K), zoom/pan/reset/center, trail/prediction/label/zone toggles, scenario/speed/seed/track-count settings, review actions, copy-evidence, handover summary.

## Honest deviations from prd.md (so judges are not misled)
- **Persistence is localStorage, not IndexedDB.** Same user-visible result for this single-browser demo (reviews survive reload), but the PRD's IndexedDB store was swapped for a simpler, tested store. Records are browser-local, not centrally audited. Only the small review map (groupId → status) lives in localStorage; telemetry/run histories are in-memory only and are never written to localStorage, so storage cannot grow with telemetry.
- **Offline via service worker.** `vite-plugin-pwa` now generates `dist/sw.js` (8 precached entries). Verified by script after the final audit build: every file in `dist/` except `sw.js`/`workbox-*` itself is in the precache manifest, the ML model is bundled into the precached JS asset, and the built bundle contains no CDN/font/API fetches (only a React error-decoder URL that is never fetched unless React throws, and a localhost string in docs text). The live-browser offline reload itself was NOT verified in a real browser here (headless Chromium in this environment returns no DOM for loopback URLs, same block as before), so test one offline reload on the presenting machine before claiming it live to a judge.
- **Routing is state-based, not React Router.** Same three screens (Home / Login / Command Center) and the same login guard (direct Command Center access without a session returns to Login); the drawer/overlay model from the PRD is kept.
- **Demo ID renamed** with the project: `SATARK-DEMO-001` / `SatarkDemo@2026!` (PRD's VAYU-DEMO-001 is superseded).

## Structure
```
web (this repo root) — Vite + React + TypeScript (strict), no backend, no API keys
  src/lib/engine.ts      simulator, validation, freshness, prediction, zones, grouping
  src/lib/ml.ts          browser Isolation Forest evaluator + benchmark
  src/lib/prng.ts        deterministic seeded PRNG
  src/assets/model/isolation_forest.json   exported sklearn model (local)
  src/components/        SidebarNav (adapted from user-supplied component), MapView (SVG)
  src/pages/             Home, Login, Command Center
ml/train.py              sklearn training + export + parity vectors
tests/ml-parity.test.mjs parity check (node --test)
PITCH.md                 5-minute judge pitch: problem decoded, USP, demo script, honest challenge answers
Home page                now carries the same problem-decoded + demo-script + PS2 checklist, so a judge sees the story before the dashboard
.env.example             feature flags (all remote options disabled by default)
```

## Judging checklist (PS2)
Simulated telemetry ✓ · multiple tracks (8, configurable 4–10) ✓ · live visualisation ✓ · trajectory prediction ✓ · threat prioritisation as explainable review advisories (HIGH/MEDIUM/LOW/VERIFY_DATA) ✓ · meaningful local AI with measured benchmark ✓ · offline-safe local map ✓.
