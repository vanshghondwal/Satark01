import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from '../node_modules/esbuild/lib/main.js';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

// Bundle real TS modules with esbuild
const outEngine = path.join(os.tmpdir(), 'satark-engine-exact.cjs');
buildSync({ entryPoints: ['src/lib/engine.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: outEngine, logLevel: 'silent' });
const { Engine } = createRequire(import.meta.url)(outEngine);

const outInbox = path.join(os.tmpdir(), 'satark-inbox-exact.cjs');
buildSync({ entryPoints: ['src/lib/alertInbox.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: outInbox, logLevel: 'silent' });
const { getAlertInboxItem } = createRequire(import.meta.url)(outInbox);

const outPI = path.join(os.tmpdir(), 'satark-pi-exact.cjs');
buildSync({ entryPoints: ['src/lib/priorityIntelligence.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: outPI, logLevel: 'silent' });
const { computeRecommendedReviewOrder } = createRequire(import.meta.url)(outPI);

test('Test 1: Three identical events belonging to one track and cause become one review group containing three original events', () => {
  const e = new Engine(42, 'ZONE_ENTRY');
  e.simTimeMs = 1000;
  
  // Directly record 3 identical events for T-05 within 10s window
  e.recordAlert({
    id: 'EV-T05-01',
    simulatedAtMs: 1000,
    trackId: 'T-05',
    category: 'SECURITY_ADVISORY',
    cause: 'ENTERED_RESTRICTED_ZONE',
    priority: 'HIGH_REVIEW',
    evidence: { ruleDetail: 'Inside Zone Alpha' }
  });
  e.recordAlert({
    id: 'EV-T05-02',
    simulatedAtMs: 2000,
    trackId: 'T-05',
    category: 'SECURITY_ADVISORY',
    cause: 'ENTERED_RESTRICTED_ZONE',
    priority: 'HIGH_REVIEW',
    evidence: { ruleDetail: 'Inside Zone Alpha' }
  });
  e.recordAlert({
    id: 'EV-T05-03',
    simulatedAtMs: 3000,
    trackId: 'T-05',
    category: 'SECURITY_ADVISORY',
    cause: 'ENTERED_RESTRICTED_ZONE',
    priority: 'HIGH_REVIEW',
    evidence: { ruleDetail: 'Inside Zone Alpha' }
  });

  const matchingGroups = e.groups.filter((g) => g.trackId === 'T-05' && g.normalizedCause === 'ENTERED_RESTRICTED_ZONE');
  assert.equal(matchingGroups.length, 1, 'Should consolidate into exactly 1 review group');
  assert.equal(matchingGroups[0].rawEventIds.length, 3, 'Group must contain exactly 3 original events');
  for (const evId of matchingGroups[0].rawEventIds) {
    assert.ok(e.events.some((ev) => ev.id === evId), `Event ${evId} exists in events ledger`);
  }
});

test('Test 2: Different tracks do not get merged', () => {
  const e = new Engine(42, 'NORMAL_SWARM');
  e.simTimeMs = 1000;
  
  e.recordAlert({
    id: 'EV-T01-01',
    simulatedAtMs: 1000,
    trackId: 'T-01',
    category: 'SECURITY_ADVISORY',
    cause: 'ENTERED_RESTRICTED_ZONE',
    priority: 'HIGH_REVIEW',
    evidence: { ruleDetail: 'Inside Zone Alpha' }
  });
  e.recordAlert({
    id: 'EV-T02-01',
    simulatedAtMs: 1000,
    trackId: 'T-02',
    category: 'SECURITY_ADVISORY',
    cause: 'ENTERED_RESTRICTED_ZONE',
    priority: 'HIGH_REVIEW',
    evidence: { ruleDetail: 'Inside Zone Alpha' }
  });

  const t1Group = e.groups.find((g) => g.trackId === 'T-01');
  const t2Group = e.groups.find((g) => g.trackId === 'T-02');
  assert.ok(t1Group, 'T-01 group exists');
  assert.ok(t2Group, 'T-02 group exists');
  assert.notEqual(t1Group.groupId, t2Group.groupId, 'Different tracks must have different groups');
});

test('Test 3: Different causes do not get merged', () => {
  const e = new Engine(42, 'NORMAL_SWARM');
  e.simTimeMs = 1000;
  
  e.recordAlert({
    id: 'EV-T01-01',
    simulatedAtMs: 1000,
    trackId: 'T-01',
    category: 'SECURITY_ADVISORY',
    cause: 'APPROACHING_BOUNDARY',
    priority: 'MEDIUM_REVIEW',
    evidence: { ruleDetail: 'Near Zone Alpha boundary' }
  });
  e.recordAlert({
    id: 'EV-T01-02',
    simulatedAtMs: 1500,
    trackId: 'T-01',
    category: 'SECURITY_ADVISORY',
    cause: 'ENTERED_RESTRICTED_ZONE',
    priority: 'HIGH_REVIEW',
    evidence: { ruleDetail: 'Inside Zone Alpha' }
  });

  const groups = e.groups.filter((g) => g.trackId === 'T-01');
  assert.equal(groups.length, 2, 'Different causes on same track produce separate groups');
});

test('Test 4: A zone-entry warning and a data-quality warning remain separate', () => {
  const e = new Engine(42, 'NORMAL_SWARM');
  e.simTimeMs = 1000;
  
  e.recordAlert({
    id: 'EV-T03-01',
    simulatedAtMs: 1000,
    trackId: 'T-03',
    category: 'SECURITY_ADVISORY',
    cause: 'ENTERED_RESTRICTED_ZONE',
    priority: 'HIGH_REVIEW',
    evidence: { ruleDetail: 'Inside Zone Alpha' }
  });
  e.recordAlert({
    id: 'EV-T03-02',
    simulatedAtMs: 1200,
    trackId: 'T-03',
    category: 'DATA_QUALITY',
    cause: 'POSITION_INCONSISTENCY',
    priority: 'VERIFY_DATA',
    evidence: { ruleDetail: 'Kinematic residual jump' }
  });

  const secGroup = e.groups.find((g) => g.trackId === 'T-03' && g.category === 'SECURITY_ADVISORY');
  const dqGroup = e.groups.find((g) => g.trackId === 'T-03' && g.category === 'DATA_QUALITY');
  assert.ok(secGroup, 'Security advisory group exists');
  assert.ok(dqGroup, 'Data quality group exists');
  assert.notEqual(secGroup.groupId, dqGroup.groupId, 'Security and data quality must never merge');
});

test('Test 5: Original event counts reconcile with displayed group counts', () => {
  const e = new Engine(42, 'ALERT_SURGE');
  for (let i = 0; i < 30; i++) e.tick();

  const totalRawEvents = e.events.length;
  const sumGroupEvents = e.groups.reduce((acc, g) => acc + g.rawEventIds.length, 0);
  assert.equal(sumGroupEvents, totalRawEvents, 'All raw events must reconcile exactly with sum of group events');
});

test('Test 6 & 7: Reviewing a group updates pending count and preserves raw event ledger', () => {
  const e = new Engine(42, 'ALERT_SURGE');
  for (let i = 0; i < 20; i++) e.tick();

  const initialRawEventCount = e.events.length;
  const initialPendingCount = e.groups.filter((g) => g.reviewStatus === 'UNREVIEWED').length;
  assert.ok(initialPendingCount > 0, 'Should have pending review groups');

  // Review the first group
  const targetGroup = e.groups[0];
  e.setReview(targetGroup.groupId, 'REVIEWED');

  const afterPendingCount = e.groups.filter((g) => g.reviewStatus === 'UNREVIEWED').length;
  assert.equal(afterPendingCount, initialPendingCount - 1, 'Pending count decrements by 1');
  assert.equal(e.events.length, initialRawEventCount, 'Raw event ledger must NOT be deleted or mutated');
  assert.equal(targetGroup.reviewStatus, 'REVIEWED');
});

test('Test 8: Review #1 reflects the actual review-order policy (unresolved high security advisory first)', () => {
  const e = new Engine(42, 'NORMAL_SWARM');
  e.simTimeMs = 5000;
  
  // DQ event (lower priority)
  e.recordAlert({
    id: 'EV-DQ-01',
    simulatedAtMs: 2000,
    trackId: 'T-02',
    category: 'DATA_QUALITY',
    cause: 'MISSING_TELEMETRY',
    priority: 'VERIFY_DATA',
    evidence: { ruleDetail: 'No updates for 3s' }
  });

  // Fresh Zone event (highest priority)
  e.recordAlert({
    id: 'EV-SEC-01',
    simulatedAtMs: 4000,
    trackId: 'T-05',
    category: 'SECURITY_ADVISORY',
    cause: 'ENTERED_RESTRICTED_ZONE',
    priority: 'HIGH_REVIEW',
    evidence: { ruleDetail: 'Inside Zone Alpha' }
  });

  const views = e.views();
  const queue = computeRecommendedReviewOrder(e.groups, views, e.events, e.simTimeMs);
  assert.ok(queue.length >= 2);
  assert.equal(queue[0].queuePosition, 1);
  assert.equal(queue[0].group.trackId, 'T-05', 'Fresh Zone advisory must be Review #1');
  assert.equal(queue[0].group.category, 'SECURITY_ADVISORY');
});

test('Test 9: Exact Card Contract fields for UI rendering', () => {
  const dummyGroup = {
    groupId: 'T-05|SECURITY_ADVISORY|ENTERED_RESTRICTED_ZONE|1000',
    trackId: 'T-05',
    category: 'SECURITY_ADVISORY',
    normalizedCause: 'ENTERED_RESTRICTED_ZONE',
    rawEventIds: ['EV-01', 'EV-02'],
    firstSeenMs: 1000,
    lastSeenMs: 2000,
    priority: 'HIGH_REVIEW',
    reviewStatus: 'UNREVIEWED',
  };

  const item = getAlertInboxItem(dummyGroup, 3000);
  // Row 1
  assert.equal(item.iconType, 'SHIELD');
  assert.equal(item.title, 'INSIDE RESTRICTED ZONE');
  assert.equal(item.priorityBadge.label, 'High');

  // Row 2
  assert.equal(item.trackId, 'T-05');
  assert.equal(item.shortContext, 'Zone Alpha');
  assert.equal(item.rawEventCount, 2);

  // Formatted context line
  const row2String = `${item.trackId} · ${item.shortContext} · ${item.rawEventCount} events`;
  assert.equal(row2String, 'T-05 · Zone Alpha · 2 events');
});
