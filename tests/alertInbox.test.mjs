import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from '../node_modules/esbuild/lib/main.js';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

// Bundle real TS modules with esbuild
const outEngine = path.join(os.tmpdir(), 'satark-engine-inbox.cjs');
buildSync({ entryPoints: ['src/lib/engine.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: outEngine, logLevel: 'silent' });
const { Engine } = createRequire(import.meta.url)(outEngine);

const outInbox = path.join(os.tmpdir(), 'satark-inbox.cjs');
buildSync({ entryPoints: ['src/lib/alertInbox.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: outInbox, logLevel: 'silent' });
const { getAlertInboxItem } = createRequire(import.meta.url)(outInbox);

const outPI = path.join(os.tmpdir(), 'satark-pi-inbox.cjs');
buildSync({ entryPoints: ['src/lib/priorityIntelligence.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: outPI, logLevel: 'silent' });
const { computeRecommendedReviewOrder } = createRequire(import.meta.url)(outPI);

test('Alert visual vocabulary: exact titles and Lucide icon mappings', () => {
  const dummyGroup = (cause, category, priority = 'HIGH_REVIEW', count = 1) => ({
    groupId: `T-01|${category}|${cause}|1000`,
    trackId: 'T-01',
    category,
    normalizedCause: cause,
    rawEventIds: Array.from({ length: count }, (_, i) => `EV-000${i + 1}`),
    firstSeenMs: 1000,
    lastSeenMs: 1000 + count * 500,
    priority,
    reviewStatus: 'UNREVIEWED',
  });

  // 1. Inside restricted zone
  const insideItem = getAlertInboxItem(dummyGroup('ENTERED_RESTRICTED_ZONE', 'SECURITY_ADVISORY'), 2000);
  assert.equal(insideItem.title, 'INSIDE RESTRICTED ZONE');
  assert.equal(insideItem.iconType, 'SHIELD');
  assert.equal(insideItem.priorityBadge.label, 'High');
  assert.equal(insideItem.priorityBadge.level, 'high');

  // 2. Near zone boundary
  const nearItem = getAlertInboxItem(dummyGroup('NEAR_EXERCISE_BOUNDARY', 'SECURITY_ADVISORY', 'MEDIUM_REVIEW'), 2000);
  assert.equal(nearItem.title, 'NEAR ZONE BOUNDARY');
  assert.equal(nearItem.iconType, 'BOUNDARY');
  assert.equal(nearItem.priorityBadge.label, 'Medium');
  assert.equal(nearItem.priorityBadge.level, 'medium');

  // 3. Predicted boundary approach
  const predItem = getAlertInboxItem(dummyGroup('PREDICTED_BOUNDARY_CROSSING', 'SECURITY_ADVISORY', 'MEDIUM_REVIEW'), 2000);
  assert.equal(predItem.title, 'NEAR ZONE BOUNDARY');
  assert.equal(predItem.iconType, 'BOUNDARY');

  // 4. Position inconsistent
  const posItem = getAlertInboxItem(dummyGroup('POSITION_INCONSISTENCY_JUMP', 'DATA_QUALITY', 'VERIFY_DATA'), 2000);
  assert.equal(posItem.title, 'POSITION INCONSISTENT');
  assert.equal(posItem.iconType, 'POSITION');
  assert.equal(posItem.priorityBadge.label, 'Verify');
  assert.equal(posItem.priorityBadge.level, 'verify');

  // 5. No recent data / missing updates
  const missingItem = getAlertInboxItem(dummyGroup('MISSING_OBSERVATIONS_GAP', 'DATA_QUALITY', 'VERIFY_DATA'), 2000);
  assert.equal(missingItem.title, 'NO RECENT DATA');
  assert.equal(missingItem.iconType, 'NO_SIGNAL');
  assert.equal(missingItem.priorityBadge.label, 'Verify');
  assert.equal(missingItem.priorityBadge.level, 'verify');

  // 6. Delayed updates
  const delayItem = getAlertInboxItem(dummyGroup('TELEMETRY_LATENCY_DELAY', 'DATA_QUALITY', 'VERIFY_DATA'), 2000);
  assert.equal(delayItem.title, 'UPDATES DELAYED');
  assert.equal(delayItem.iconType, 'CLOCK');
  assert.equal(delayItem.priorityBadge.label, 'Verify');
  assert.equal(delayItem.priorityBadge.level, 'verify');
});

test('Data quality faults are never labeled as security threats or high priority', () => {
  const dqCauses = [
    'MISSING_TELEMETRY',
    'POSITION_INCONSISTENCY',
    'TELEMETRY_LATENCY_DELAY',
    'EXTRAPOLATION_RESIDUAL',
    'STALE_TRACK',
  ];

  for (const cause of dqCauses) {
    const item = getAlertInboxItem(
      {
        groupId: `T-02|DATA_QUALITY|${cause}|1000`,
        trackId: 'T-02',
        category: 'DATA_QUALITY',
        normalizedCause: cause,
        rawEventIds: ['EV-0001'],
        firstSeenMs: 1000,
        lastSeenMs: 1000,
        priority: 'VERIFY_DATA',
        reviewStatus: 'UNREVIEWED',
      },
      2000
    );

    assert.equal(item.priorityBadge.label, 'Verify');
    assert.equal(item.priorityBadge.level, 'verify');
    assert.notEqual(item.priorityBadge.level, 'high');
    assert.equal(item.category, 'DATA_QUALITY');
  }
});

test('Unobtrusive grouped event count: 8 related events label matches requirement', () => {
  const singleEventGroup = {
    groupId: 'T-03|DATA_QUALITY|MISSING|1000',
    trackId: 'T-03',
    category: 'DATA_QUALITY',
    normalizedCause: 'MISSING',
    rawEventIds: ['EV-0001'],
    firstSeenMs: 1000,
    lastSeenMs: 1000,
    priority: 'VERIFY_DATA',
    reviewStatus: 'UNREVIEWED',
  };

  const itemSingle = getAlertInboxItem(singleEventGroup, 1000);
  assert.equal(itemSingle.relatedEventsText, null);
  assert.equal(itemSingle.rawEventCount, 1);

  const eightEventGroup = {
    groupId: 'T-03|SECURITY_ADVISORY|ZONE|1000',
    trackId: 'T-03',
    category: 'SECURITY_ADVISORY',
    normalizedCause: 'ZONE',
    rawEventIds: ['EV-1', 'EV-2', 'EV-3', 'EV-4', 'EV-5', 'EV-6', 'EV-7', 'EV-8'],
    firstSeenMs: 1000,
    lastSeenMs: 8000,
    priority: 'HIGH_REVIEW',
    reviewStatus: 'UNREVIEWED',
  };

  const itemEight = getAlertInboxItem(eightEventGroup, 8000);
  assert.equal(itemEight.relatedEventsText, '8 related events');
  assert.equal(itemEight.rawEventCount, 8);
});

test('Alert Inbox derives from live engine without invented data', () => {
  const e = new Engine(42, 'ZONE_ENTRY');
  for (let i = 0; i < 20; i++) e.tick();

  assert.ok(e.groups.length > 0, 'Scenario should generate real alert groups');

  const views = e.views();
  const trackMap = new Map(views.map((v) => [v.id, v]));

  for (const g of e.groups) {
    const item = getAlertInboxItem(g, e.simTimeMs, trackMap.get(g.trackId));
    assert.ok(item.trackId.startsWith('T-0'));
    assert.ok(['INSIDE RESTRICTED ZONE', 'NEAR ZONE BOUNDARY', 'PREDICTED ZONE CROSSING', 'NO RECENT DATA', 'POSITION INCONSISTENT', 'UPDATES DELAYED'].includes(item.title));
    assert.ok(['High', 'Medium', 'Verify'].includes(item.priorityBadge.label));
    assert.ok(item.contextLine.length > 5);
    assert.ok(item.rawEventCount >= 1);
  }
});

test('Three compact filters: All, Zone Alerts, and Data Issues partition groups accurately', () => {
  const e = new Engine(42, 'ALERT_SURGE');
  for (let i = 0; i < 25; i++) e.tick();

  const allGroups = e.groups;
  const zoneAlerts = allGroups.filter((g) => g.category === 'SECURITY_ADVISORY');
  const dataIssues = allGroups.filter((g) => g.category === 'DATA_QUALITY');

  assert.equal(zoneAlerts.length + dataIssues.length, allGroups.length);

  for (const zg of zoneAlerts) {
    const item = getAlertInboxItem(zg, e.simTimeMs);
    assert.equal(item.category, 'SECURITY_ADVISORY');
  }

  for (const dg of dataIssues) {
    const item = getAlertInboxItem(dg, e.simTimeMs);
    assert.equal(item.category, 'DATA_QUALITY');
  }
});

test('Suggested review order integration and review persistence', () => {
  const e = new Engine(42, 'ZONE_ENTRY');
  for (let i = 0; i < 20; i++) e.tick();

  const orderedBefore = computeRecommendedReviewOrder(e.groups, e.views(), e.events, e.simTimeMs, {
    categoryFilter: 'ALL',
    sortBy: 'RECOMMENDED',
  });

  assert.ok(orderedBefore.length > 0);
  const topItem = orderedBefore[0];

  // Operator marks top item REVIEWED
  e.setReview(topItem.group.groupId, 'REVIEWED');
  assert.equal(e.reviews[topItem.group.groupId], 'REVIEWED');

  const orderedAfter = computeRecommendedReviewOrder(e.groups, e.views(), e.events, e.simTimeMs, {
    categoryFilter: 'ALL',
    sortBy: 'RECOMMENDED',
  });

  // Demoted below unresolved active items
  if (orderedAfter.length > 1) {
    const newIndex = orderedAfter.findIndex((item) => item.group.groupId === topItem.group.groupId);
    assert.ok(newIndex > 0, 'Reviewed item should be deprioritized behind unreviewed items');
  }

  // Operator reopens the item
  e.setReview(topItem.group.groupId, 'UNREVIEWED');
  assert.equal(e.reviews[topItem.group.groupId], 'UNREVIEWED');
});
