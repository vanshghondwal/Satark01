import type { Group, TrackView, AlertEvent, Category, ReviewStatus, Quality } from './engine';
import { formatRelativeSimTime } from './coverageWatch';

/**
 * Priority Intelligence: Deterministic Review Order Policy
 * 
 * Training Policy Configuration:
 * 1. Unresolved records (UNREVIEWED or FOLLOW_UP) precede resolved records.
 * 2. Unresolved simulated exercise-zone advisories with fresh observations precede data-quality faults.
 * 3. Fresh observations (age < 5s) take precedence over stale observations because they represent
 *    an active, verifiable physical situation.
 * 4. Stale or inconsistent observations are flagged as requiring sensor verification before movement analysis.
 * 5. Isolation Forest AI anomaly flags provide supporting evidence that telemetry is anomalous,
 *    without acting as a standalone military threat score.
 * 6. Equal-tier items are stably ordered by recent activity and track ID.
 */

export interface ReviewItem {
  queuePosition: number;
  group: Group;
  track?: TrackView;
  eventCategoryConcept: string;
  dataReliabilityConcept: {
    label: string;
    text: string;
    color: string;
    status: Quality;
  };
  shortIssue: string;
  reasonForPlacement: string;
  detailedExplanation: string;
  ageLabel: string;
  reviewState: ReviewStatus;
  aiAssisted: boolean;
  scoreTier: number;
}

export type CategoryFilter = 'ALL' | 'SECURITY_ADVISORY' | 'DATA_QUALITY';
export type SortOption = 'RECOMMENDED' | 'NEWEST';

/**
 * Concept A: Event Category mapping
 * Distinguishes exercise movement advisories from sensor / telemetry faults.
 */
export function getEventCategoryConcept(cause: string, category: Category): string {
  const c = cause.toUpperCase();
  if (category === 'SECURITY_ADVISORY') {
    if (c.includes('ZONE') || c.includes('ENTERED')) return 'Simulated Exercise-Zone Advisory';
    if (c.includes('APPROACH') || c.includes('BOUNDARY')) return 'Simulated Airspace Boundary Alert';
    return 'Simulated Airspace Advisory';
  }
  if (c.includes('INCONSISTENT') || c.includes('JUMP') || c.includes('POSITION')) return 'Inconsistent Reported Position';
  if (c.includes('MISSING') || c.includes('DROPPED')) return 'Missing Observations';
  if (c.includes('DELAY') || c.includes('LATENCY')) return 'Delayed Observations';
  return 'Sensor and Telemetry Fault';
}

/**
 * Concept B: Data Reliability mapping
 * Assesses whether current telemetry can be trusted or requires sensor verification.
 */
export function getDataReliabilityConcept(track?: TrackView): {
  label: string;
  text: string;
  color: string;
  status: Quality;
} {
  if (!track || !track.hasObservation) {
    return {
      label: 'No Observations Recorded',
      text: 'No valid telemetry received yet for this drone.',
      color: 'var(--text-muted)',
      status: 'NEW',
    };
  }
  switch (track.quality) {
    case 'FRESH':
      return {
        label: 'Current Observations Available',
        text: 'Telemetry is within the 1-second transmission window with low kinematic residual.',
        color: 'var(--success)',
        status: 'FRESH',
      };
    case 'DEGRADED':
      return {
        label: 'Data Delayed',
        text: 'Telemetry packets are arriving with latency exceeding the transmission window.',
        color: 'var(--warning)',
        status: 'DEGRADED',
      };
    case 'STALE':
      return {
        label: 'No Recent Observations',
        text: 'Updates have stopped. Current position is unknown; displaying last confirmed telemetry.',
        color: 'var(--text-muted)',
        status: 'STALE',
      };
    case 'INCONSISTENT':
      return {
        label: 'Inconsistent Observations',
        text: 'Reported coordinate jumps conflict with expected kinematic model.',
        color: 'var(--error)',
        status: 'INCONSISTENT',
      };
    default:
      return {
        label: 'Baseline Telemetry',
        text: 'Telemetry under evaluation.',
        color: 'var(--text-secondary)',
        status: 'NEW',
      };
  }
}

/**
 * Concept C: Suggested Review Order
 * Computes deterministic ordering and human-understandable explanations for each item.
 */
export function computeRecommendedReviewOrder(
  groups: Group[],
  tracks: TrackView[],
  events: AlertEvent[],
  simTimeMs: number,
  options?: {
    categoryFilter?: CategoryFilter;
    sortBy?: SortOption;
  }
): ReviewItem[] {
  const categoryFilter = options?.categoryFilter ?? 'ALL';
  const sortBy = options?.sortBy ?? 'RECOMMENDED';

  // 1. Filter by category if requested
  const filtered = groups.filter((g) => {
    if (categoryFilter === 'ALL') return true;
    return g.category === categoryFilter;
  });

  // Track map for fast lookup
  const trackMap = new Map<string, TrackView>();
  for (const t of tracks) {
    trackMap.set(t.id, t);
  }

  // Event map for latest event per group
  const eventMap = new Map<string, AlertEvent>();
  for (const ev of events) {
    eventMap.set(ev.id, ev);
  }

  // Calculate score and build items
  const items: ReviewItem[] = filtered.map((g) => {
    const tr = trackMap.get(g.trackId);
    const reliability = getDataReliabilityConcept(tr);
    const catConcept = getEventCategoryConcept(g.normalizedCause, g.category);

    // Latest event in this group
    const latestEventId = g.rawEventIds[g.rawEventIds.length - 1];
    const latestEvent = eventMap.get(latestEventId);
    const aiAssisted = !!(latestEvent?.evidence?.ml && latestEvent.evidence.ml.flagged);

    // Compute Deterministic Review Priority Tier
    // Tier 1 (Highest): Unresolved security/zone advisory with fresh observation
    // Tier 2: Unresolved operator-requested follow-up on security advisory
    // Tier 3: Unresolved data quality fault (inconsistent jump, missing data)
    // Tier 4: Unresolved follow-up on data quality
    // Tier 5: Acknowledged items
    // Tier 6 (Lowest): Formally reviewed items
    let tier = 3;
    const isUnresolved = g.reviewStatus === 'UNREVIEWED';
    const isFollowUp = g.reviewStatus === 'FOLLOW_UP';
    const isAcknowledged = g.reviewStatus === 'ACKNOWLEDGED';
    const isReviewed = g.reviewStatus === 'REVIEWED';

    const hasFreshObs = tr ? tr.quality === 'FRESH' && tr.ageSec < 5 : false;

    if (g.category === 'SECURITY_ADVISORY') {
      if (isUnresolved) {
        tier = hasFreshObs ? 1 : 2;
      } else if (isFollowUp) {
        tier = 2;
      } else if (isAcknowledged) {
        tier = 5;
      } else if (isReviewed) {
        tier = 6;
      }
    } else {
      // DATA_QUALITY
      if (isUnresolved) {
        tier = tr?.quality === 'INCONSISTENT' ? 3 : 4;
      } else if (isFollowUp) {
        tier = 4;
      } else if (isAcknowledged) {
        tier = 5;
      } else if (isReviewed) {
        tier = 6;
      }
    }

    // Short issue title
    let shortIssue = g.normalizedCause;
    if (g.normalizedCause.includes('ZONE_ENTRY') || g.normalizedCause.includes('ENTERED')) {
      shortIssue = 'Restricted Area Alert (Zone Alpha)';
    } else if (g.normalizedCause.includes('BOUNDARY') || g.normalizedCause.includes('APPROACH')) {
      shortIssue = 'Approaching Restricted Boundary';
    } else if (g.normalizedCause.includes('POSITION') || g.normalizedCause.includes('JUMP')) {
      shortIssue = 'Inconsistent Position Jump';
    } else if (g.normalizedCause.includes('MISSING')) {
      shortIssue = 'Telemetry Stream Missing Updates';
    } else if (g.normalizedCause.includes('DELAY')) {
      shortIssue = 'Delayed Telemetry Transmission';
    }

    // Reason for placement
    const ageSeconds = Math.max(0, (simTimeMs - g.lastSeenMs) / 1000);
    const ageLabel = formatRelativeSimTime(ageSeconds);

    let reasonForPlacement = '';
    let detailedExplanation = '';

    if (isReviewed) {
      reasonForPlacement = 'Previously verified by operator.';
      detailedExplanation = `This record was verified and marked reviewed by an operator. It is preserved in the audit log for exercise accountability.`;
    } else if (isAcknowledged) {
      reasonForPlacement = 'Acknowledged by operator, pending closure.';
      detailedExplanation = `An operator acknowledged this item. It remains visible until full review is completed.`;
    } else if (isFollowUp) {
      reasonForPlacement = 'Operator requested follow-up inspection.';
      detailedExplanation = `Placed in the review queue because a human operator flagged this item as requiring secondary verification.`;
    } else if (g.category === 'SECURITY_ADVISORY') {
      if (hasFreshObs) {
        reasonForPlacement = 'Unresolved simulated-zone advisory with current observations.';
        detailedExplanation = `Placed high in the review queue because this is an active, unresolved exercise-zone advisory with verified fresh telemetry (age: ${ageLabel}). Immediate operator situational awareness is recommended.`;
      } else {
        reasonForPlacement = 'Unresolved simulated-zone advisory awaiting observation refresh.';
        detailedExplanation = `Placed in the review queue because an airspace boundary advisory is active, but telemetry updates are delayed (${ageLabel}). Verify sensor coverage before assessing track position.`;
      }
    } else {
      if (tr?.quality === 'INCONSISTENT') {
        reasonForPlacement = 'Reported position conflicts with kinematic trajectory.';
        detailedExplanation = `Placed in the data-quality review queue because reported coordinates jumped unexpectedly. Both kinematic residual analysis and Isolation Forest AI flag this update as anomalous, indicating a telemetry fault rather than hostile flight behavior.`;
      } else if (tr?.quality === 'STALE') {
        reasonForPlacement = 'Telemetry updates halted, position prediction suspended.';
        detailedExplanation = `Placed in the data-quality review queue because updates have ceased for over 5 seconds. Predicted track path has been suspended to prevent misleading display.`;
      } else {
        reasonForPlacement = 'Telemetry packet delay detected in transmission.';
        detailedExplanation = `Placed in the data-quality review queue because telemetry packets are arriving outside the normal 1-second transmission window.`;
      }
    }

    if (aiAssisted && isUnresolved) {
      detailedExplanation += ` Note: Isolation Forest model confirmed anomaly pattern in telemetry features.`;
    }

    return {
      queuePosition: 0, // Will be set after sorting
      group: g,
      track: tr,
      eventCategoryConcept: catConcept,
      dataReliabilityConcept: reliability,
      shortIssue,
      reasonForPlacement,
      detailedExplanation,
      ageLabel,
      reviewState: g.reviewStatus,
      aiAssisted,
      scoreTier: tier,
    };
  });

  // Sort deterministically
  items.sort((a, b) => {
    if (sortBy === 'NEWEST') {
      // Newest event first
      if (b.group.lastSeenMs !== a.group.lastSeenMs) {
        return b.group.lastSeenMs - a.group.lastSeenMs;
      }
      return a.group.trackId.localeCompare(b.group.trackId);
    }

    // Recommended order:
    // 1. Lower tier number = higher priority
    if (a.scoreTier !== b.scoreTier) {
      return a.scoreTier - b.scoreTier;
    }
    // 2. For same tier, items with older unresolved firstSeenMs don't starve
    if (a.group.firstSeenMs !== b.group.firstSeenMs) {
      return a.group.firstSeenMs - b.group.firstSeenMs;
    }
    // 3. Most recent update
    if (b.group.lastSeenMs !== a.group.lastSeenMs) {
      return b.group.lastSeenMs - a.group.lastSeenMs;
    }
    // 4. Stable tie-breaker: track ID and group ID
    const cmp = a.group.trackId.localeCompare(b.group.trackId);
    if (cmp !== 0) return cmp;
    return a.group.groupId.localeCompare(b.group.groupId);
  });

  // Assign 1-based queue position
  items.forEach((item, idx) => {
    item.queuePosition = idx + 1;
  });

  return items;
}
