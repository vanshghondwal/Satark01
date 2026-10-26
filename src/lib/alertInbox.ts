import type { Group, TrackView, Priority } from './engine';
import { formatRelativeSimTime } from './coverageWatch';

export type AlertIconType = 'SHIELD' | 'BOUNDARY' | 'NO_SIGNAL' | 'POSITION' | 'CLOCK';

export interface AlertInboxItem {
  groupId: string;
  trackId: string;
  category: 'SECURITY_ADVISORY' | 'DATA_QUALITY';
  title: string;
  iconType: AlertIconType;
  contextLine: string;
  shortContext: string;
  priorityBadge: {
    label: 'High' | 'Medium' | 'Verify';
    level: 'high' | 'medium' | 'verify';
  };
  relatedEventsText: string | null;
  ageLabel: string;
  rawEventCount: number;
}

/**
 * Maps a Mission Focus group and its optional TrackView into scannable inbox fields.
 * Visual vocabulary follows strict guidelines:
 * - Shield/exclamation: observed inside restricted zone (INSIDE RESTRICTED ZONE)
 * - Boundary/map: near exercise-zone boundary (NEAR ZONE BOUNDARY)
 * - Broken-signal: no recent updates / stale (NO RECENT DATA)
 * - Movement/position: inconsistent reported position (POSITION INCONSISTENT)
 * - Clock: delayed observations (UPDATES DELAYED)
 */
export function getAlertInboxItem(group: Group, simTimeMs: number, track?: TrackView): AlertInboxItem {
  const norm = group.normalizedCause.toUpperCase();
  const trackId = group.trackId;

  let title = 'AIRSPACE ADVISORY';
  let iconType: AlertIconType = 'SHIELD';
  let contextLine = 'Activity flagged by real-time validation checks.';
  let shortContext = 'Zone Alpha';

  // Determine Title, Icon, and Context Line
  if (norm === 'PREDICTED_ZONE_CROSSING' || norm === 'PROJECTED_ZONE_ENTRY') {
    title = 'PREDICTED ZONE CROSSING';
    iconType = 'BOUNDARY';
    contextLine = 'Projected trajectory approaches Zone Alpha';
    shortContext = 'Projected Crossing';
  } else if (norm.includes('BOUNDARY') || norm.includes('APPROACH') || norm.includes('NEAR')) {
    title = 'NEAR ZONE BOUNDARY';
    iconType = 'BOUNDARY';
    contextLine = 'Near Zone Alpha review boundary (30m)';
    shortContext = 'Zone Alpha';
  } else if (norm.includes('PREDICTED')) {
    title = 'PREDICTED ZONE CROSSING';
    iconType = 'BOUNDARY';
    contextLine = 'Projected trajectory approaches Zone Alpha';
    shortContext = 'Projected Crossing';
  } else if (norm.includes('ZONE') || norm.includes('RESTRICTED') || norm.includes('ENTERED')) {
    title = 'INSIDE RESTRICTED ZONE';
    iconType = 'SHIELD';
    contextLine = 'Observed inside Exercise Zone Alpha perimeter';
    shortContext = 'Zone Alpha';
  } else if (norm.includes('POSITION') || norm.includes('JUMP') || norm.includes('INCONSISTENCY')) {
    title = 'POSITION INCONSISTENT';
    iconType = 'POSITION';
    contextLine = 'Reported position conflicts with kinematic physics';
    shortContext = 'Inconsistent Position';
  } else if (norm.includes('MISSING') || norm.includes('GAP') || norm.includes('STALE') || (track && track.quality === 'STALE')) {
    title = 'NO RECENT DATA';
    iconType = 'NO_SIGNAL';
    contextLine = 'No recent accepted updates from transponder';
    shortContext = 'Transponder Inactive';
  } else if (norm.includes('DELAY') || norm.includes('LATENCY')) {
    title = 'UPDATES DELAYED';
    iconType = 'CLOCK';
    contextLine = 'Telemetry packets arriving outside 2s window';
    shortContext = 'Delayed Telemetry';
  } else if (group.category === 'SECURITY_ADVISORY') {
    title = 'INSIDE RESTRICTED ZONE';
    iconType = 'SHIELD';
    contextLine = 'Simulated airspace security boundary alert';
    shortContext = 'Zone Alpha';
  } else {
    title = 'NO RECENT DATA';
    iconType = 'NO_SIGNAL';
    contextLine = 'Sensor data quality verification requested';
    shortContext = 'Sensor Quality';
  }

  // Priority indicator:
  // - High: urgent security/zone entry ('High')
  // - Medium: boundary advisory / caution ('Medium')
  // - Verify: neutral data-quality verification issues ('Verify')
  let priorityBadge: AlertInboxItem['priorityBadge'] = {
    label: 'Verify',
    level: 'verify',
  };

  if (group.category === 'SECURITY_ADVISORY') {
    if (group.priority === 'HIGH_REVIEW') {
      priorityBadge = { label: 'High', level: 'high' };
    } else {
      priorityBadge = { label: 'Medium', level: 'medium' };
    }
  } else {
    // Data quality issues must not be described as confirmed security threats
    priorityBadge = { label: 'Verify', level: 'verify' };
  }

  // Related events badge
  const rawEventCount = group.rawEventIds.length;
  const relatedEventsText = rawEventCount > 1 ? `${rawEventCount} related events` : null;

  // Relative timestamp of first detection
  const ageSec = Math.max(0, (simTimeMs - group.firstSeenMs) / 1000);
  const ageLabel = formatRelativeSimTime(ageSec);

  return {
    groupId: group.groupId,
    trackId,
    category: group.category,
    title,
    iconType,
    contextLine,
    shortContext,
    priorityBadge,
    relatedEventsText,
    ageLabel,
    rawEventCount,
  };
}
