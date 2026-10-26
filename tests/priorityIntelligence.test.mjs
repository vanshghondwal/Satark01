import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from '../node_modules/esbuild/lib/main.js';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

// Bundle real TS engine and priority intelligence with esbuild
const outEngine = path.join(os.tmpdir(), 'satark-engine-pi.cjs');
buildSync({ entryPoints: ['src/lib/engine.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: outEngine, logLevel: 'silent' });
const { Engine } = createRequire(import.meta.url)(outEngine);

const outPI = path.join(os.tmpdir(), 'satark-pi.cjs');
buildSync({ entryPoints: ['src/lib/priorityIntelligence.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: outPI, logLevel: 'silent' });
const {
  computeRecommendedReviewOrder,
  getEventCategoryConcept,
  getDataReliabilityConcept,
} = createRequire(import.meta.url)(outPI);

function runEngine(scenario, ticks) {
  const e = new Engine(42, scenario);
  for (let i = 0; i < ticks; i++) e.tick();
  return e;
}

test('deterministic recommended review ordering from identical inputs', () => {
  const e1 = runEngine('ZONE_ENTRY', 35);
  const e2 = runEngine('ZONE_ENTRY', 35);

  const order1 = computeRecommendedReviewOrder(e1.groups, e1.views(), e1.events, e1.simTimeMs);
  const order2 = computeRecommendedReviewOrder(e2.groups, e2.views(), e2.events, e2.simTimeMs);

  assert.equal(order1.length, order2.length);
  assert.deepEqual(
    order1.map((item) => ({ pos: item.queuePosition, track: item.group.trackId, tier: item.scoreTier })),
    order2.map((item) => ({ pos: item.queuePosition, track: item.group.trackId, tier: item.scoreTier }))
  );
});

test('unresolved exercise-zone advisory with fresh observation precedes data quality faults', () => {
  const e = runEngine('ZONE_ENTRY', 40);
  const order = computeRecommendedReviewOrder(e.groups, e.views(), e.events, e.simTimeMs);

  assert.ok(order.length > 0, 'expected at least one review item');
  const first = order[0];
  assert.equal(first.queuePosition, 1);
  assert.equal(first.group.category, 'SECURITY_ADVISORY');
  assert.equal(first.scoreTier, 1);
  assert.ok(first.reasonForPlacement.includes('Unresolved simulated-zone advisory'));
});

test('operator marking item REVIEWED demotes it in suggested review order', () => {
  const e = runEngine('ZONE_ENTRY', 40);
  const initialOrder = computeRecommendedReviewOrder(e.groups, e.views(), e.events, e.simTimeMs);
  assert.ok(initialOrder.length > 0);
  const target = initialOrder[0];
  assert.equal(target.reviewState, 'UNREVIEWED');

  // Mark reviewed
  e.setReview(target.group.groupId, 'REVIEWED');
  const updatedOrder = computeRecommendedReviewOrder(e.groups, e.views(), e.events, e.simTimeMs);
  const updatedItem = updatedOrder.find((i) => i.group.groupId === target.group.groupId);

  assert.ok(updatedItem);
  assert.equal(updatedItem.reviewState, 'REVIEWED');
  assert.equal(updatedItem.scoreTier, 6); // Demoted to reviewed tier
  assert.ok(updatedItem.reasonForPlacement.includes('verified by operator'));
});

test('operator marking item FOLLOW_UP elevates it above resolved items', () => {
  const e = runEngine('ALERT_SURGE', 30);
  assert.ok(e.groups.length >= 2, 'expected multiple groups in alert surge');

  // Mark first as REVIEWED, second as FOLLOW_UP
  e.setReview(e.groups[0].groupId, 'REVIEWED');
  e.setReview(e.groups[1].groupId, 'FOLLOW_UP');

  const order = computeRecommendedReviewOrder(e.groups, e.views(), e.events, e.simTimeMs);
  const followUpItem = order.find((i) => i.group.groupId === e.groups[1].groupId);
  const reviewedItem = order.find((i) => i.group.groupId === e.groups[0].groupId);

  assert.ok(followUpItem);
  assert.ok(reviewedItem);
  assert.ok(followUpItem.queuePosition < reviewedItem.queuePosition, 'follow up must precede reviewed');
  assert.ok(followUpItem.reasonForPlacement.includes('follow-up'));
});

test('reopening an event restores its priority in the active review queue', () => {
  const e = runEngine('ZONE_ENTRY', 40);
  const initialOrder = computeRecommendedReviewOrder(e.groups, e.views(), e.events, e.simTimeMs);
  const targetId = initialOrder[0].group.groupId;

  // Mark reviewed
  e.setReview(targetId, 'REVIEWED');
  let order = computeRecommendedReviewOrder(e.groups, e.views(), e.events, e.simTimeMs);
  assert.equal(order.find((i) => i.group.groupId === targetId).reviewState, 'REVIEWED');

  // Reopen
  e.setReview(targetId, 'UNREVIEWED');
  order = computeRecommendedReviewOrder(e.groups, e.views(), e.events, e.simTimeMs);
  const reopenedItem = order.find((i) => i.group.groupId === targetId);
  assert.equal(reopenedItem.reviewState, 'UNREVIEWED');
  assert.equal(reopenedItem.scoreTier, 1);
});

test('clearly separates Event Category, Data Reliability, and Suggested Review Order', () => {
  const e = runEngine('POSITION_JUMP', 25);
  const order = computeRecommendedReviewOrder(e.groups, e.views(), e.events, e.simTimeMs);

  assert.ok(order.length > 0);
  for (const item of order) {
    // Concept A: Event category
    assert.ok(typeof item.eventCategoryConcept === 'string' && item.eventCategoryConcept.length > 0);
    // Concept B: Data reliability
    assert.ok(item.dataReliabilityConcept && typeof item.dataReliabilityConcept.label === 'string');
    // Concept C: Suggested review order
    assert.ok(item.queuePosition >= 1);
    assert.ok(typeof item.reasonForPlacement === 'string' && item.reasonForPlacement.length > 0);
    assert.ok(typeof item.detailedExplanation === 'string' && item.detailedExplanation.length > 0);
  }
});

test('category filter restricts queue without altering underlying groups', () => {
  const e = runEngine('ZONE_ENTRY', 40);
  const allOrder = computeRecommendedReviewOrder(e.groups, e.views(), e.events, e.simTimeMs, { categoryFilter: 'ALL' });
  const secOrder = computeRecommendedReviewOrder(e.groups, e.views(), e.events, e.simTimeMs, { categoryFilter: 'SECURITY_ADVISORY' });
  const dqOrder = computeRecommendedReviewOrder(e.groups, e.views(), e.events, e.simTimeMs, { categoryFilter: 'DATA_QUALITY' });

  assert.equal(secOrder.every((i) => i.group.category === 'SECURITY_ADVISORY'), true);
  assert.equal(dqOrder.every((i) => i.group.category === 'DATA_QUALITY'), true);
  assert.equal(secOrder.length + dqOrder.length, allOrder.length);
});

test('sorting by NEWEST vs RECOMMENDED preserves deterministic position integrity', () => {
  const e = runEngine('ALERT_SURGE', 35);
  const recOrder = computeRecommendedReviewOrder(e.groups, e.views(), e.events, e.simTimeMs, { sortBy: 'RECOMMENDED' });
  const newOrder = computeRecommendedReviewOrder(e.groups, e.views(), e.events, e.simTimeMs, { sortBy: 'NEWEST' });

  assert.equal(recOrder.length, newOrder.length);
  // In NEWEST, lastSeenMs must be monotonically non-increasing
  for (let i = 1; i < newOrder.length; i++) {
    assert.ok(newOrder[i - 1].group.lastSeenMs >= newOrder[i].group.lastSeenMs);
  }
});
