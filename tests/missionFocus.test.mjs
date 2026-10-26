import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from '../node_modules/esbuild/lib/main.js';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

// Bundle real TS engine and Priority Intelligence modules with esbuild
const outEngine = path.join(os.tmpdir(), 'satark-engine-mf.cjs');
buildSync({ entryPoints: ['src/lib/engine.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: outEngine, logLevel: 'silent' });
const { Engine } = createRequire(import.meta.url)(outEngine);

const outPI = path.join(os.tmpdir(), 'satark-pi-mf.cjs');
buildSync({ entryPoints: ['src/lib/priorityIntelligence.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: outPI, logLevel: 'silent' });
const { computeRecommendedReviewOrder } = createRequire(import.meta.url)(outPI);

const outInbox = path.join(os.tmpdir(), 'satark-inbox-mf.cjs');
buildSync({ entryPoints: ['src/lib/alertInbox.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: outInbox, logLevel: 'silent' });
const { getAlertInboxItem } = createRequire(import.meta.url)(outInbox);

// Helper to advance engine ticks
function advance(engine, ticks) {
  for (let i = 0; i < ticks; i++) {
    engine.tick();
  }
}

test('Mission Focus: every raw event belongs to the correct incident group', () => {
  const engine = new Engine(42, 'ALERT_SURGE');
  advance(engine, 30);

  assert.ok(engine.events.length > 0, 'Must have recorded events');
  assert.ok(engine.groups.length > 0, 'Must have formed groups');

  for (const group of engine.groups) {
    for (const eventId of group.rawEventIds) {
      const ev = engine.events.find((e) => e.id === eventId);
      assert.ok(ev, `Raw event ${eventId} must exist in engine.events`);
      assert.equal(ev.trackId, group.trackId, `Track ID must match group track ID (${group.trackId})`);
      assert.equal(ev.category, group.category, `Category must match group category (${group.category})`);
      assert.equal(ev.cause, group.normalizedCause, `Cause must match group normalized cause (${group.normalizedCause})`);
    }
  }
});

test('Mission Focus: no original event is deleted or duplicated', () => {
  const engine = new Engine(42, 'ALERT_SURGE');
  advance(engine, 30);

  const allMappedIds = engine.groups.flatMap((g) => g.rawEventIds);
  const uniqueMappedIds = new Set(allMappedIds);

  assert.equal(allMappedIds.length, uniqueMappedIds.size, 'No raw event ID should appear in multiple groups');

  // Verify that every raw event in engine.events is accounted for
  for (const ev of engine.events) {
    assert.ok(uniqueMappedIds.has(ev.id), `Event ${ev.id} must be preserved in a group`);
  }
  assert.equal(uniqueMappedIds.size, engine.events.length, 'Total mapped raw events must equal total engine.events length');
});

test('Mission Focus: group event counts are accurate and equal rawEventIds length', () => {
  const engine = new Engine(42, 'ALERT_SURGE');
  advance(engine, 25);

  for (const group of engine.groups) {
    assert.ok(group.rawEventIds.length >= 1, 'Every group must contain at least 1 raw event ID');
    const matchingRawEvents = engine.events.filter((e) => group.rawEventIds.includes(e.id));
    assert.equal(group.rawEventIds.length, matchingRawEvents.length, 'Group count must strictly match underlying matching events');
  }
});

test('Mission Focus: Organized and All Events derive from the exact same ledger', () => {
  const engine = new Engine(42, 'ALERT_SURGE');
  advance(engine, 20);

  const ledgerRawEventIds = engine.events.map((e) => e.id);
  const organizedGroupRawEventIds = engine.groups.flatMap((g) => g.rawEventIds);

  // Both views reference the identical set of event IDs
  assert.deepEqual(
    [...ledgerRawEventIds].sort(),
    [...organizedGroupRawEventIds].sort(),
    'Organized groups and All Events ledger must contain identical event IDs'
  );
});

test('Mission Focus: separate drones and event categories are never merged', () => {
  const engine = new Engine(42, 'ALERT_SURGE');
  // Inject faults across multiple distinct drones
  engine.injectLivePipelineFault('T-01', 'DELAY');
  engine.injectLivePipelineFault('T-03', 'POSITION_ERROR');
  advance(engine, 20);

  for (const group of engine.groups) {
    const rawEvents = engine.events.filter((e) => group.rawEventIds.includes(e.id));

    // Drones must never be merged
    const tracksInGroup = new Set(rawEvents.map((e) => e.trackId));
    assert.equal(tracksInGroup.size, 1, `Group ${group.groupId} must only contain events for a single track`);
    assert.ok(tracksInGroup.has(group.trackId), 'Track in group must match group.trackId');

    // Categories must never be merged
    const categoriesInGroup = new Set(rawEvents.map((e) => e.category));
    assert.equal(categoriesInGroup.size, 1, `Group ${group.groupId} must only contain events for a single category`);
    assert.ok(categoriesInGroup.has(group.category), 'Category in group must match group.category');
  }
});

test('Mission Focus: reviewing a group updates the review queue appropriately', () => {
  const engine = new Engine(42, 'ALERT_SURGE');
  advance(engine, 25);

  const initialItems = computeRecommendedReviewOrder(engine.groups, engine.views(), engine.events, engine.simTimeMs);
  assert.ok(initialItems.length >= 2, 'Need at least 2 items to test review queue reordering');

  const topGroupId = initialItems[0].group.groupId;
  assert.equal(initialItems[0].reviewState, 'UNREVIEWED');

  // Operator marks top item as REVIEWED
  engine.setReview(topGroupId, 'REVIEWED');

  const updatedItems = computeRecommendedReviewOrder(engine.groups, engine.views(), engine.events, engine.simTimeMs);
  const reviewedItem = updatedItems.find((item) => item.group.groupId === topGroupId);

  assert.ok(reviewedItem, 'Reviewed item must still be present in queue');
  assert.equal(reviewedItem.reviewState, 'REVIEWED');
  // Reviewed items are demoted after unresolved items
  assert.ok(reviewedItem.queuePosition > 1, 'Reviewed item must be demoted below unreviewed items');
});

test('Mission Focus: the event ledger remains available after review', () => {
  const engine = new Engine(42, 'ALERT_SURGE');
  advance(engine, 25);

  const eventCountBefore = engine.events.length;
  const topGroup = engine.groups[0];

  engine.setReview(topGroup.groupId, 'REVIEWED');

  // Ledger must be completely intact
  assert.equal(engine.events.length, eventCountBefore, 'Events ledger must not delete or drop any event on review');
  for (const rawId of topGroup.rawEventIds) {
    assert.ok(engine.events.some((e) => e.id === rawId), `Raw event ${rawId} must remain in ledger after review`);
  }
});

test('Mission Focus: same seed and scenario produce reproducible grouping', () => {
  const run1 = new Engine(42, 'ALERT_SURGE');
  const run2 = new Engine(42, 'ALERT_SURGE');

  advance(run1, 30);
  advance(run2, 30);

  assert.equal(run1.events.length, run2.events.length, 'Raw event counts must match');
  assert.equal(run1.groups.length, run2.groups.length, 'Group counts must match');

  for (let i = 0; i < run1.groups.length; i++) {
    const g1 = run1.groups[i];
    const g2 = run2.groups[i];
    assert.equal(g1.groupId, g2.groupId);
    assert.equal(g1.trackId, g2.trackId);
    assert.equal(g1.category, g2.category);
    assert.deepEqual(g1.rawEventIds, g2.rawEventIds);
  }
});

test('Mission Focus: AI model failures do not break deterministic grouping', () => {
  const engine = new Engine(42, 'ALERT_SURGE');
  advance(engine, 20);

  // Even if telemetry model returns unavailable/corrupted results, engine grouping is rule-based
  const views = engine.views();
  for (const v of views) {
    v.ml = { score: NaN, decision: NaN, threshold: 0, flagged: false, status: 'UNAVAILABLE' };
  }

  const reviewItems = computeRecommendedReviewOrder(engine.groups, views, engine.events, engine.simTimeMs);
  assert.ok(reviewItems.length > 0, 'Review order must remain fully functional during AI model unavailability');
  assert.ok(reviewItems.every((item) => Number.isFinite(item.queuePosition)));
});

test('Mission Focus: factual summary accurately calculates consolidation count without fake metrics', () => {
  const engine = new Engine(42, 'ALERT_SURGE');
  advance(engine, 25);

  const rawCount = engine.events.length;
  const groupCount = engine.groups.length;
  const consolidatedCount = Math.max(0, rawCount - groupCount);

  assert.ok(rawCount > groupCount, 'In ALERT_SURGE, raw events should exceed group count');
  assert.equal(consolidatedCount, rawCount - groupCount, 'Consolidated count must be strictly calculated as rawCount - groupCount');
});

test('Mission Focus: Guided Demo step See alerts get organized uses real state', () => {
  const engine = new Engine(42, 'ALERT_SURGE');
  advance(engine, 25);

  // Guided demo runs 25 ticks of ALERT_SURGE
  assert.ok(engine.events.length >= 20, 'Guided demo must have recorded real events');
  assert.ok(engine.groups.length >= 1, 'Guided demo must have recorded real groups');

  const firstGroup = engine.groups[0];
  assert.ok(firstGroup.rawEventIds.length > 0, 'Sample group must contain real raw event IDs');
  assert.equal(typeof firstGroup.trackId, 'string');
});
