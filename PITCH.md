# SATARK — Judge pitch (5 minutes)

**One line:** See the sky. Verify the signal.

## 1. Problem, decoded (60 seconds — say this before showing any screen)
- **User:** a simulated airspace operator on a time-sensitive shift, plus the trainer/judge who must audit their decisions.
- **Surface symptom:** alert floods, and stale positions drawn as if they were live.
- **Root cause:** telemetry quality and threat are conflated, with no inspectable chain from packet → rule/ML → grouped incident → human review.
- **Constraints:** no real feeds, no API keys, offline-capable, demo-only login. An anomaly score is never a probability of hostility, and a zone advisory is never an instruction to engage.

## 2. USP — say it in one sentence
> Everyone shows a radar. SATARK shows why you should believe it — an integrated, inspectable, reproducible review workflow.

Radar, replay and anomaly detection exist elsewhere. The differentiator is the chain: same seeded input → same rules score → same ML score → same grouped incident → same review, all openable in the app.

## 3. Demo script (do not wander — follow the clicks)
| Time | Do | Say |
|---|---|---|
| 0:00 | Home → Enter Demo → Fill demo credentials | "Public demo login, not verified access." |
| 1:00 | Start, scenario ZONE_ENTRY | "A fresh accepted observation enters the fictional zone — HIGH_REVIEW, with its packet as evidence." |
| 1:30 | Evidence → Mark reviewed | "Review is a human action, persisted in this browser." |
| 2:30 | Proof Mode → inject delayed packet | "Judge, inject the fault yourself. Rules and ML score the same features, side by side." |
| 3:00 | Run held-out benchmark | "Precision, recall and false-positive rate computed now on 400 held-out cases — not a slide number." |
| 3:30 | ALERT_SURGE → expand a group | "Count the raw event IDs. Grouping compresses the queue, it never deletes evidence." |
| 4:30 | Replay → step → Return to Live, reload | "Same seed reproduces the same run, and the Saved reviews strip shows the review survived the reload." |

## 4. If challenged — honest answers, prepared
- **"Is the AI real?"** Yes: scikit-learn Isolation Forest trained on synthetic normal telemetry features, exported to JSON, evaluated in the browser. Parity test: `npm test` (max diff < 0.0001 vs sklearn).
- **"Is this a real military system?"** No, and it never claims to be. Simulation only, fictional coordinates, demo login.
- **"What breaks?"** Persistence is localStorage, not IndexedDB — stated in README.md. A service worker IS generated in the production build (vite-plugin-pwa, 7 precached entries), but an offline reload has NOT been verified in a real browser here (loopback navigation is blocked in the build environment) — so test one offline reload on the presenting machine before claiming it live. No real sensor adapter exists.
- **"Why should this win over a prettier radar?"** Because a judge can reproduce, challenge and audit every flag in under five minutes.

## 5. What NOT to say
Do not claim real drone detections, hostile probability, engagement, Army affiliation, or an offline reload you have not tested on the presenting machine (the service worker exists in the build, but the offline reload itself is still unverified). Do not present the benchmark as real-world accuracy — it is a synthetic held-out benchmark, labelled as such in the app.
