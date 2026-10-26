import { mulberry32 } from './prng';
import { evaluateMl, ruleCheck, type MlResult } from './ml';

export type Scenario = 'CLEAN' | 'DELAYED_PACKET' | 'MISSING_UPDATES' | 'POSITION_JUMP' | 'ALERT_SURGE' | 'ZONE_ENTRY';
export const SCENARIOS: { id: Scenario; label: string; desc: string }[] = [
  { id: 'CLEAN', label: 'CLEAN', desc: 'No faults. Baseline monitoring.' },
  { id: 'DELAYED_PACKET', label: 'DELAYED_PACKET', desc: 'T-07 packets arrive 3.5s late.' },
  { id: 'MISSING_UPDATES', label: 'MISSING_UPDATES', desc: 'T-03 sends only every 3rd update.' },
  { id: 'POSITION_JUMP', label: 'POSITION_JUMP', desc: 'T-05 reports a +140 unit jump every 5th tick.' },
  { id: 'ALERT_SURGE', label: 'ALERT_SURGE', desc: 'T-02 + T-07 delayed every tick: grouped by Mission Focus.' },
  { id: 'ZONE_ENTRY', label: 'ZONE_ENTRY', desc: 'T-04 flies straight into Exercise Zone Alpha.' },
];
export type Quality = 'NEW' | 'FRESH' | 'DEGRADED' | 'STALE' | 'INCONSISTENT';
export type Category = 'SECURITY_ADVISORY' | 'DATA_QUALITY';
export type Priority = 'HIGH_REVIEW' | 'MEDIUM_REVIEW' | 'LOW_REVIEW' | 'VERIFY_DATA';
export type ReviewStatus = 'UNREVIEWED' | 'ACKNOWLEDGED' | 'REVIEWED' | 'FOLLOW_UP';

export interface Packet {
  eventId: string; trackId: string; sequence: number;
  observedAtMs: number; receivedAtMs: number;
  x: number; y: number; altitudeM: number; speedMps: number; headingDeg: number;
  faultTags: string[];
}
export interface AlertEvent {
  id: string; trackId: string; category: Category; cause: string; priority: Priority;
  simulatedAtMs: number; sourcePacketIds: string[];
  evidence: { ruleTriggered: boolean; ruleDetail: string; ml: MlResult | null; features: number[] | null };
}
export interface Group {
  groupId: string; trackId: string; category: Category; normalizedCause: string;
  rawEventIds: string[]; firstSeenMs: number; lastSeenMs: number;
  priority: Priority; reviewStatus: ReviewStatus;
}
export interface RejectedPacket { eventId: string; reason: 'INVALID' | 'DUPLICATE' | 'OUT_OF_ORDER'; x: number; y: number; observedAtMs: number; receivedAtMs: number }
export interface TrackView {
  id: string; x: number; y: number; altitudeM: number; speedMps: number; headingDeg: number;
  quality: Quality; ageSec: number; latencySec: number; missing: number;
  accepted: number; rejected: number; residual: number;
  lastObservedMs: number | null; lastConfirmedLabel: string;
  hasObservation: boolean;
  rejectedDetail: RejectedPacket[];
  history: { x: number; y: number; altitudeM?: number }[]; prediction: { x: number; y: number; t: number }[];
  inZone: boolean; nearZone: boolean; ml: MlResult | null; ruleTriggered: boolean;
  features: number[] | null; displayX: number; displayY: number; stale: boolean;
}
export interface Snapshot { t: number; pos: Record<string, { x: number; y: number; quality: Quality }> }

export interface PipelineTrace {
  timestampMs: number;
  trackId: string;
  faultType: string;
  packet: Packet;
  validation: { valid: boolean; reason?: 'INVALID' | 'DUPLICATE' | 'OUT_OF_ORDER' };
  trustLens: { gapSec: number; ageSec: number; missing: number; residual: number; speedChange: number };
  rules: { triggered: boolean; checks: { id: string; triggered: boolean; detail: string }[] };
  ml: MlResult;
  createdEventId?: string;
  createdGroupId?: string;
}

const ZONE = { cx: 520, cy: 480, r: 170, name: 'EXERCISE ZONE ALPHA' };
export const ZONE_INFO = ZONE;
const PRI_RANK: Record<Priority, number> = { HIGH_REVIEW: 4, MEDIUM_REVIEW: 3, LOW_REVIEW: 2, VERIFY_DATA: 1 };

interface GT { x: number; y: number; vx: number; vy: number; alt: number; phase: number }
interface TrackInternal {
  id: string; gt: GT; accepted: Packet[]; rejected: string[]; rejectedPackets: RejectedPacket[]; seenIds: Set<string>;
  quality: Quality; missing: number; residual: number; ml: MlResult | null; ruleTriggered: boolean;
  features: number[] | null; inZone: boolean; nearZone: boolean; predictedFlag: boolean;
  lastAge: number; lastLatency: number;
}

export class Engine {
  seed = 42; scenario: Scenario = 'CLEAN'; trackCount = 8;
  simTimeMs = 0; tickCount = 0; running = false;
  tracks: TrackInternal[] = [];
  events: AlertEvent[] = [];
  groups: Group[] = [];
  snapshots: Snapshot[] = [];
  private queue: { packet: Packet; deliverAt: number }[] = [];
  private pendingFault = new Map<string, string>();
  private eventSeq = 0;
  reviews: Record<string, ReviewStatus> = {};
  lastPipelineTrace: PipelineTrace | null = null;

  constructor(seed = 42, scenario: Scenario = 'CLEAN') {
    this.seed = seed; this.scenario = scenario;
    try { this.reviews = JSON.parse(localStorage.getItem('satark-reviews-v1') || '{}'); } catch { this.reviews = {}; }
    this.initTracks();
  }
  initTracks() {
    const rnd = mulberry32(this.seed);
    this.tracks = [];
    for (let i = 0; i < this.trackCount; i++) {
      const id = `T-0${i + 1}`;
      let x = 80 + rnd() * 840, y = 80 + rnd() * 840;
      let ang = rnd() * Math.PI * 2; const sp = 14 + rnd() * 14;
      let vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp;
      if (this.scenario === 'ZONE_ENTRY' && id === 'T-04') { x = 120; y = 480; vx = 28; vy = 0; }
      if (this.scenario === 'CLEAN' && id === 'T-04') { x = 200; y = 500; vx = 20; vy = 0; }
      this.tracks.push({ id, gt: { x, y, vx, vy, alt: 80 + rnd() * 220, phase: rnd() * 6.28 },
        accepted: [], rejected: [], rejectedPackets: [], seenIds: new Set(), quality: 'NEW', missing: 0, residual: 0,
        ml: null, ruleTriggered: false, features: null, inZone: false, nearZone: false,
        predictedFlag: false, lastAge: 0, lastLatency: 0 });
    }
    this.simTimeMs = 0; this.tickCount = 0; this.events = []; this.groups = [];
    this.snapshots = []; this.queue = []; this.eventSeq = 0;
    this.lastPipelineTrace = null;
  }
  reset(seed = this.seed, scenario = this.scenario) {
    this.seed = seed; this.scenario = scenario; this.initTracks();
  }
  injectFault(trackId: string, fault: string) { this.pendingFault.set(trackId, fault); }
  pendingFaultFor(trackId: string) { return this.pendingFault.get(trackId); }
  recordAlert(e: Omit<AlertEvent, 'id'>): AlertEvent { return this.addEvent(e); }

  private addEvent(e: Omit<AlertEvent, 'id'>): AlertEvent {
    const id = `EV-${String(++this.eventSeq).padStart(4, '0')}`;
    const ev: AlertEvent = { id, ...e };
    this.events.unshift(ev);
    // Mission Focus grouping: same track+category+cause, consecutive window 10s
    const g = [...this.groups].reverse().find((gr) =>
      gr.trackId === ev.trackId && gr.category === ev.category && gr.normalizedCause === ev.cause
      && ev.simulatedAtMs - gr.lastSeenMs <= 10000);
    if (g) {
      g.rawEventIds.push(ev.id); g.lastSeenMs = ev.simulatedAtMs;
      if (PRI_RANK[ev.priority] > PRI_RANK[g.priority]) g.priority = ev.priority;
    } else {
      this.groups.unshift({ groupId: `${ev.trackId}|${ev.category}|${ev.cause}|${ev.simulatedAtMs}`,
        trackId: ev.trackId, category: ev.category, normalizedCause: ev.cause,
        rawEventIds: [ev.id], firstSeenMs: ev.simulatedAtMs, lastSeenMs: ev.simulatedAtMs,
        priority: ev.priority, reviewStatus: this.reviews[`${ev.trackId}|${ev.category}|${ev.cause}|${ev.simulatedAtMs}`] || 'UNREVIEWED' });
    }
    return ev;
  }

  setReview(groupId: string, status: ReviewStatus) {
    const g = this.groups.find((x) => x.groupId === groupId); if (!g) return;
    g.reviewStatus = status; this.reviews[groupId] = status;
    try { localStorage.setItem('satark-reviews-v1', JSON.stringify(this.reviews)); } catch { /* storage unavailable */ }
  }

  tick() {
    this.simTimeMs += 1000; this.tickCount += 1;
    const t = this.simTimeMs;
    // 1. Ground truth moves (private; UI never reads this directly)
    for (const tr of this.tracks) {
      const g = tr.gt;
      g.x += g.vx + Math.sin(t / 9000 + g.phase) * 1.5;
      g.y += g.vy + Math.cos(t / 11000 + g.phase) * 1.5;
      if (g.x < 40 || g.x > 960) { g.vx *= -1; g.x = Math.max(40, Math.min(960, g.x)); }
      if (g.y < 40 || g.y > 960) { g.vy *= -1; g.y = Math.max(40, Math.min(960, g.y)); }
    }
    // 2. Emit (possibly faulted) packets
    const toDeliver: Packet[] = [];
    for (const tr of this.tracks) {
      const sc = this.scenario;
      if (sc === 'MISSING_UPDATES' && tr.id === 'T-03' && this.tickCount % 3 !== 0) continue;
      const fault = this.pendingFault.get(tr.id);
      if (fault === 'MISSING') { this.pendingFault.delete(tr.id); continue; }
      const g = tr.gt;
      let x = g.x, y = g.y; const tags: string[] = [];
      let delay = 0;
      if (sc === 'DELAYED_PACKET' && tr.id === 'T-07') delay = 3500;
      if (sc === 'ALERT_SURGE' && (tr.id === 'T-02' || tr.id === 'T-07')) delay = 3000;
      if (sc === 'POSITION_JUMP' && tr.id === 'T-05' && this.tickCount % 5 === 0) { x += 140; y += 80; tags.push('POSITION_ERROR'); }
      if (sc === 'CLEAN' && tr.id === 'T-02' && this.tickCount % 14 === 5) delay = 2200;
      if (sc === 'CLEAN' && tr.id === 'T-03' && this.tickCount % 18 === 9) continue;
      if (sc === 'CLEAN' && tr.id === 'T-05' && this.tickCount % 22 === 13) { x += 85; y += 45; tags.push('POSITION_ERROR'); }
      if (fault === 'DELAY') { delay = 4000; tags.push('LATE'); this.pendingFault.delete(tr.id); }
      if (fault === 'POSITION_ERROR') { x += 130; y += 70; tags.push('POSITION_ERROR'); this.pendingFault.delete(tr.id); }
      const speed = Math.hypot(g.vx, g.vy);
      const pkt: Packet = { eventId: `PK-${tr.id}-${this.tickCount}`, trackId: tr.id, sequence: this.tickCount,
        observedAtMs: t, receivedAtMs: t + delay, x, y, altitudeM: Math.round(g.alt),
        speedMps: Math.round(speed * 10) / 10, headingDeg: Math.round((Math.atan2(g.vy, g.vx) * 180 / Math.PI + 360) % 360),
        faultTags: tags };
      if (delay > 0) this.queue.push({ packet: pkt, deliverAt: t + delay });
      else toDeliver.push(pkt);
    }
    for (const q of this.queue.filter((q) => q.deliverAt <= t)) toDeliver.push(q.packet);
    this.queue = this.queue.filter((q) => q.deliverAt > t);
    // 3. Process delivered packets through the same pipeline
    for (const pkt of toDeliver) this.processPacket(pkt);
    // 4. Freshness + snapshot
    for (const tr of this.tracks) {
      const last = tr.accepted[tr.accepted.length - 1];
      if (!last) { tr.quality = 'NEW'; continue; }
      const age = (t - last.observedAtMs) / 1000;
      if (tr.residual > 60 && age <= 4) tr.quality = 'INCONSISTENT';
      else if (age > 4) tr.quality = 'STALE';
      else if (age > 2) tr.quality = 'DEGRADED';
      else tr.quality = 'FRESH';
    }
    const pos: Snapshot['pos'] = {};
    for (const tr of this.tracks) { const v = this.trackView(tr); pos[tr.id] = { x: v.displayX, y: v.displayY, quality: v.quality }; }
    this.snapshots.push({ t, pos });
    if (this.snapshots.length > 600) this.snapshots.shift();
  }

  private reject(tr: TrackInternal, pkt: Packet, reason: RejectedPacket['reason']) {
    tr.rejected.push(pkt.eventId);
    tr.rejectedPackets.push({ eventId: pkt.eventId, reason, x: pkt.x, y: pkt.y, observedAtMs: pkt.observedAtMs, receivedAtMs: pkt.receivedAtMs });
    if (tr.rejectedPackets.length > 60) tr.rejectedPackets.shift();
  }

  /**
   * Process an ingested packet through the full pipeline:
   * 1. Ingestion -> 2. Validation -> 3. Dedup & Sequencing -> 4. Residual & Features ->
   * 5. Trust Lens -> 6. Rules -> 7. ML Isolation Forest -> 8. Alert Event Creation ->
   * 9. Mission Focus Grouping -> 10. Audit trace record.
   */
  processPacket(pkt: Packet): { accepted: boolean; event?: AlertEvent } {
    const tr = this.tracks.find((x) => x.id === pkt.trackId);
    if (!tr) return { accepted: false };

    // Validation (Zod-style, hand-rolled, zero external deps)
    const valid = Number.isFinite(pkt.x) && Number.isFinite(pkt.y) && pkt.x >= 0 && pkt.x <= 1000 && pkt.y >= 0 && pkt.y <= 1000
      && pkt.altitudeM >= 0 && pkt.altitudeM <= 1000 && pkt.speedMps >= 0 && pkt.speedMps <= 120
      && Number.isFinite(pkt.observedAtMs) && Number.isFinite(pkt.receivedAtMs) && pkt.receivedAtMs >= pkt.observedAtMs;

    if (!valid) {
      this.reject(tr, pkt, 'INVALID');
      this.lastPipelineTrace = {
        timestampMs: this.simTimeMs,
        trackId: pkt.trackId,
        faultType: pkt.faultTags.join(',') || 'INVALID_PACKET',
        packet: pkt,
        validation: { valid: false, reason: 'INVALID' },
        trustLens: { gapSec: 0, ageSec: (pkt.receivedAtMs - pkt.observedAtMs) / 1000, missing: 0, residual: 0, speedChange: 0 },
        rules: { triggered: false, checks: [] },
        ml: { score: NaN, decision: NaN, threshold: 0, flagged: false, status: 'UNAVAILABLE' },
      };
      return { accepted: false };
    }

    if (tr.seenIds.has(pkt.eventId)) {
      this.reject(tr, pkt, 'DUPLICATE');
      this.lastPipelineTrace = {
        timestampMs: this.simTimeMs,
        trackId: pkt.trackId,
        faultType: 'DUPLICATE_PACKET',
        packet: pkt,
        validation: { valid: false, reason: 'DUPLICATE' },
        trustLens: { gapSec: 0, ageSec: (pkt.receivedAtMs - pkt.observedAtMs) / 1000, missing: 0, residual: 0, speedChange: 0 },
        rules: { triggered: false, checks: [] },
        ml: { score: NaN, decision: NaN, threshold: 0, flagged: false, status: 'UNAVAILABLE' },
      };
      return { accepted: false };
    }

    const prev = tr.accepted[tr.accepted.length - 1];
    if (prev && pkt.observedAtMs <= prev.observedAtMs) {
      this.reject(tr, pkt, 'OUT_OF_ORDER');
      this.lastPipelineTrace = {
        timestampMs: this.simTimeMs,
        trackId: pkt.trackId,
        faultType: 'OUT_OF_ORDER_PACKET',
        packet: pkt,
        validation: { valid: false, reason: 'OUT_OF_ORDER' },
        trustLens: { gapSec: 0, ageSec: (pkt.receivedAtMs - pkt.observedAtMs) / 1000, missing: 0, residual: 0, speedChange: 0 },
        rules: { triggered: false, checks: [] },
        ml: { score: NaN, decision: NaN, threshold: 0, flagged: false, status: 'UNAVAILABLE' },
      };
      return { accepted: false };
    }

    tr.seenIds.add(pkt.eventId);
    const gapSec = prev ? (pkt.observedAtMs - prev.observedAtMs) / 1000 : 1;
    const ageSec = (pkt.receivedAtMs - pkt.observedAtMs) / 1000;
    const missing = prev ? Math.max(0, Math.round(gapSec) - 1) : 0;

    // Residual vs linear extrapolation from previous two accepted points
    let residual = 0;
    const h = tr.accepted;
    if (h.length >= 2) {
      const a = h[h.length - 2], b = h[h.length - 1];
      const dt = (b.observedAtMs - a.observedAtMs) / 1000 || 1;
      const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
      const dt2 = (pkt.observedAtMs - b.observedAtMs) / 1000;
      residual = Math.hypot(pkt.x - (b.x + vx * dt2), pkt.y - (b.y + vy * dt2));
    }
    const speedChange = prev ? Math.abs(pkt.speedMps - prev.speedMps) : 0;
    const features = [gapSec, ageSec, missing, speedChange, residual];
    const ml = evaluateMl(features);
    const rule = ruleCheck({ gap_s: gapSec, age_s: ageSec, missing, residual });

    tr.accepted.push(pkt); tr.missing = missing; tr.residual = residual; tr.ml = ml;
    tr.ruleTriggered = rule.triggered; tr.features = features;
    tr.lastAge = ageSec; tr.lastLatency = ageSec;
    if (tr.accepted.length > 60) tr.accepted.shift();
    const now = this.simTimeMs;

    let createdEvent: AlertEvent | undefined;

    // Data-quality events (never merged with security advisories)
    if (ageSec > 1.5) {
      createdEvent = this.addEvent({ trackId: pkt.trackId, category: 'DATA_QUALITY', cause: 'DELAYED_PACKET', priority: 'VERIFY_DATA', simulatedAtMs: now, sourcePacketIds: [pkt.eventId], evidence: { ruleTriggered: rule.triggered, ruleDetail: rule.checks.map((c) => `${c.id}:${c.triggered ? 'TRIGGERED' : 'ok'} (${c.detail})`).join(' · '), ml, features } });
    }
    if (missing >= 1) {
      createdEvent = this.addEvent({ trackId: pkt.trackId, category: 'DATA_QUALITY', cause: 'MISSING_UPDATE', priority: 'VERIFY_DATA', simulatedAtMs: now, sourcePacketIds: [pkt.eventId], evidence: { ruleTriggered: rule.triggered, ruleDetail: rule.checks.map((c) => `${c.id}:${c.triggered ? 'TRIGGERED' : 'ok'}`).join(' · '), ml, features } });
    }
    if (residual > 60) {
      createdEvent = this.addEvent({ trackId: pkt.trackId, category: 'DATA_QUALITY', cause: 'POSITION_INCONSISTENCY', priority: 'VERIFY_DATA', simulatedAtMs: now, sourcePacketIds: [pkt.eventId], evidence: { ruleTriggered: true, ruleDetail: `POSITION residual ${residual.toFixed(0)} > 60`, ml, features } });
    }

    // Zone advisories: only on accepted, fresh observations
    const d = Math.hypot(pkt.x - ZONE.cx, pkt.y - ZONE.cy);
    const inZone = d <= ZONE.r; const nearZone = !inZone && d <= ZONE.r + 35;
    if (inZone && !tr.inZone) {
      createdEvent = this.addEvent({ trackId: pkt.trackId, category: 'SECURITY_ADVISORY', cause: 'ZONE_OBSERVATION', priority: 'HIGH_REVIEW', simulatedAtMs: now, sourcePacketIds: [pkt.eventId], evidence: { ruleTriggered: false, ruleDetail: `Accepted observation inside ${ZONE.name} (dist ${d.toFixed(0)} <= ${ZONE.r})`, ml, features } });
    }
    if (nearZone && !tr.nearZone && !inZone) {
      createdEvent = this.addEvent({ trackId: pkt.trackId, category: 'SECURITY_ADVISORY', cause: 'ZONE_BOUNDARY_REVIEW', priority: 'MEDIUM_REVIEW', simulatedAtMs: now, sourcePacketIds: [pkt.eventId], evidence: { ruleTriggered: false, ruleDetail: `Accepted observation near boundary (dist ${d.toFixed(0)}, zone radius ${ZONE.r})`, ml, features } });
    }
    tr.inZone = inZone; tr.nearZone = nearZone;

    // Predicted crossing (valid short projection only)
    const pred = this.predictionFor(tr);
    if (pred.length && !inZone && !tr.predictedFlag) {
      const p15 = pred[pred.length - 1];
      if (Math.hypot(p15.x - ZONE.cx, p15.y - ZONE.cy) <= ZONE.r) {
        tr.predictedFlag = true;
        createdEvent = this.addEvent({ trackId: pkt.trackId, category: 'SECURITY_ADVISORY', cause: 'PREDICTED_ZONE_CROSSING', priority: 'MEDIUM_REVIEW', simulatedAtMs: now, sourcePacketIds: [pkt.eventId], evidence: { ruleTriggered: false, ruleDetail: `15s projection enters ${ZONE.name}: estimate, not a guarantee`, ml, features } });
      }
    }
    if (d > ZONE.r + 120) tr.predictedFlag = false;

    // Record the full pipeline audit trace
    this.lastPipelineTrace = {
      timestampMs: this.simTimeMs,
      trackId: pkt.trackId,
      faultType: pkt.faultTags.join(',') || 'NOMINAL_INGESTION',
      packet: pkt,
      validation: { valid: true },
      trustLens: { gapSec, ageSec, missing, residual, speedChange },
      rules: { triggered: rule.triggered, checks: rule.checks },
      ml,
      createdEventId: createdEvent?.id,
      createdGroupId: this.groups.find((g) => g.rawEventIds.includes(createdEvent?.id || ''))?.groupId,
    };

    return { accepted: true, event: createdEvent };
  }

  /**
   * Genuine Live Pipeline Fault Injection:
   * Injects a real synthetic packet directly into the ingestion pathway for a given track,
   * without mutating the ground truth.
   */
  injectLivePipelineFault(trackId: string, faultType: 'DELAY' | 'MISSING' | 'POSITION_ERROR' | 'OUT_OF_ORDER' | 'INVALID' | 'CLEAN') {
    const tr = this.tracks.find((x) => x.id === trackId);
    if (!tr) return null;
    this.tickCount += 1;
    this.simTimeMs += 1000;
    const t = this.simTimeMs;
    const g = tr.gt;
    g.x += g.vx; g.y += g.vy;
    let x = g.x, y = g.y;
    let delay = 0;
    const tags: string[] = [];
    const speed = Math.hypot(g.vx, g.vy);

    if (faultType === 'MISSING') {
      // Simulate packet loss: gap increases on next packet
      this.pendingFault.set(trackId, 'MISSING');
      this.lastPipelineTrace = {
        timestampMs: t,
        trackId,
        faultType: 'MISSING (PACKET DROPPED)',
        packet: { eventId: `PK-${trackId}-${this.tickCount}-DROPPED`, trackId, sequence: this.tickCount, observedAtMs: t, receivedAtMs: t, x, y, altitudeM: Math.round(g.alt), speedMps: Math.round(speed * 10) / 10, headingDeg: 0, faultTags: ['DROPPED'] },
        validation: { valid: true },
        trustLens: { gapSec: 2, ageSec: 0, missing: 1, residual: 0, speedChange: 0 },
        rules: { triggered: false, checks: [] },
        ml: { score: 0, decision: 0, threshold: 0, flagged: false, status: 'OK' },
      };
      return this.lastPipelineTrace;
    }

    if (faultType === 'DELAY') {
      delay = 4000;
      tags.push('LATE_DELIVERY');
    } else if (faultType === 'POSITION_ERROR') {
      x += 130; y += 70;
      tags.push('POSITION_ERROR');
    } else if (faultType === 'INVALID') {
      x = 9999; // triggers validation error
      tags.push('INVALID_COORDINATES');
    } else if (faultType === 'OUT_OF_ORDER') {
      const last = tr.accepted[tr.accepted.length - 1];
      const observedAtMs = last ? Math.max(0, last.observedAtMs - 1500) : t;
      const pkt: Packet = {
        eventId: `PK-${trackId}-${this.tickCount}-OOO`,
        trackId,
        sequence: this.tickCount,
        observedAtMs,
        receivedAtMs: t,
        x, y,
        altitudeM: Math.round(g.alt),
        speedMps: Math.round(speed * 10) / 10,
        headingDeg: Math.round((Math.atan2(g.vy, g.vx) * 180 / Math.PI + 360) % 360),
        faultTags: ['OUT_OF_ORDER'],
      };
      this.processPacket(pkt);
      return this.lastPipelineTrace;
    }

    const pkt: Packet = {
      eventId: `PK-${trackId}-${this.tickCount}-LIVE`,
      trackId,
      sequence: this.tickCount,
      observedAtMs: t,
      receivedAtMs: t + delay,
      x, y,
      altitudeM: Math.round(g.alt),
      speedMps: Math.round(speed * 10) / 10,
      headingDeg: Math.round((Math.atan2(g.vy, g.vx) * 180 / Math.PI + 360) % 360),
      faultTags: tags,
    };

    this.processPacket(pkt);
    return this.lastPipelineTrace;
  }

  private predictionFor(tr: TrackInternal) {
    const h = tr.accepted; if (h.length < 2) return [];
    const a = h[h.length - 2], b = h[h.length - 1];
    const dt = (b.observedAtMs - a.observedAtMs) / 1000 || 1;
    const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
    return [5, 10, 15].map((s) => ({ x: b.x + vx * s, y: b.y + vy * s, t: s }));
  }

  trackView(tr: TrackInternal): TrackView {
    const last = tr.accepted[tr.accepted.length - 1];
    const ageSec = last ? (this.simTimeMs - last.observedAtMs) / 1000 : 0;
    const stale = tr.quality === 'STALE';
    const prediction = (!stale && tr.quality !== 'INCONSISTENT') ? this.predictionFor(tr) : [];
    return { id: tr.id, x: last ? last.x : tr.gt.x, y: last ? last.y : tr.gt.y,
      altitudeM: last ? last.altitudeM : Math.round(tr.gt.alt), speedMps: last ? last.speedMps : 0,
      headingDeg: last ? last.headingDeg : 0, quality: tr.quality, ageSec, latencySec: tr.lastAge,
      missing: tr.missing, accepted: tr.accepted.length, rejected: tr.rejected.length, residual: tr.residual,
      lastObservedMs: last ? last.observedAtMs : null,
      hasObservation: !!last,
      rejectedDetail: tr.rejectedPackets.slice(-10),
      lastConfirmedLabel: last ? `LAST OBSERVED T+${(last.observedAtMs / 1000).toFixed(0)}s` : 'NO OBSERVATION YET',
      history: tr.accepted.slice(-20).map((p) => ({ x: p.x, y: p.y, altitudeM: p.altitudeM })), prediction,
      inZone: tr.inZone, nearZone: tr.nearZone, ml: tr.ml, ruleTriggered: tr.ruleTriggered,
      features: tr.features, displayX: last ? last.x : tr.gt.x, displayY: last ? last.y : tr.gt.y, stale };
  }
  views(): TrackView[] { return this.tracks.map((t) => this.trackView(t)); }
  stats() {
    return { tracks: this.tracks.length, events: this.events.length, groups: this.groups.length,
      unresolved: this.groups.filter((g) => g.reviewStatus === 'UNREVIEWED' || g.reviewStatus === 'FOLLOW_UP').length,
      stale: this.views().filter((v) => v.quality === 'STALE').length,
      high: this.groups.filter((g) => g.priority === 'HIGH_REVIEW' && g.reviewStatus !== 'REVIEWED').length };
  }
}
export function fmtSim(ms: number) { return `T+${(ms / 1000).toFixed(0)}s`; }
