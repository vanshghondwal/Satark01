import type { TrackView } from './engine';

export interface TrackDerivedStatus {
  hasObservation: boolean;
  statusLabel: string;
  positionText: string;
  altitudeText: string;
  speedText: string;
  headingText: string;
  reliabilityLabel: string;
  reliabilityColor: string;
  badgeText: string;
  badgeColor: string;
  badgeBg: string;
  badgeBorder: string;
  dotColor: string;
}

/**
 * Single source of truth for drone telemetry status and reliability assessment.
 * Ensures that track list, live map, details strip, Trust Lens, and Coverage Watch
 * never contradict each other.
 *
 * Rules:
 * 1. If hasObservation is false (T+0 or before first accepted packet):
 *    - Status is 'Awaiting data'
 *    - Position is 'Awaiting data'
 *    - Altitude and Speed are '---'
 *    - Reliability is 'Not yet assessed' (NEVER 'Reliable')
 *    - Badge is 'Awaiting data'
 * 2. If track is STALE (>4s without updates):
 *    - Current position is unknown; last confirmed position is shown
 *    - Reliability is 'No recent data'
 *    - Status is 'No recent data'
 * 3. If track has INCONSISTENT physics or DEGRADED latency:
 *    - Reliability is 'Needs review'
 * 4. Only FRESH tracks with valid telemetry and no active faults are 'Reliable'.
 */
export function getTrackDerivedStatus(t: TrackView | undefined): TrackDerivedStatus {
  if (!t || !t.hasObservation) {
    return {
      hasObservation: false,
      statusLabel: 'Awaiting data',
      positionText: 'Awaiting data',
      altitudeText: '---',
      speedText: '---',
      headingText: '---',
      reliabilityLabel: 'Not yet assessed',
      reliabilityColor: 'var(--text-muted)',
      badgeText: 'Awaiting data',
      badgeColor: 'var(--text-muted)',
      badgeBg: 'var(--elevated)',
      badgeBorder: 'var(--border)',
      dotColor: 'var(--text-muted)',
    };
  }

  // Stale track: no recent accepted transponder updates
  if (t.quality === 'STALE' || t.stale) {
    return {
      hasObservation: true,
      statusLabel: 'No recent data',
      positionText: `Last: ${t.displayX.toFixed(0)}, ${t.displayY.toFixed(0)}`,
      altitudeText: `Last: ${t.altitudeM} m`,
      speedText: `Last: ${t.speedMps} m/s`,
      headingText: `${t.headingDeg}°`,
      reliabilityLabel: 'No recent data',
      reliabilityColor: 'var(--text-muted)',
      badgeText: 'No Recent Data',
      badgeColor: 'var(--text-muted)',
      badgeBg: 'var(--elevated)',
      badgeBorder: 'var(--border)',
      dotColor: 'var(--text-muted)',
    };
  }

  // Airspace restricted area incursion
  if (t.inZone) {
    return {
      hasObservation: true,
      statusLabel: 'Inside restricted zone',
      positionText: `${t.displayX.toFixed(0)}, ${t.displayY.toFixed(0)}`,
      altitudeText: `${t.altitudeM} m`,
      speedText: `${t.speedMps} m/s`,
      headingText: `${t.headingDeg}°`,
      reliabilityLabel: t.quality === 'FRESH' ? 'Reliable' : 'Needs review',
      reliabilityColor: t.quality === 'FRESH' ? 'var(--success)' : 'var(--warning)',
      badgeText: 'Restricted Area Alert',
      badgeColor: 'var(--error)',
      badgeBg: 'var(--error-surface)',
      badgeBorder: 'var(--error-border)',
      dotColor: 'var(--error)',
    };
  }

  // Approaching exercise zone boundary
  if (t.nearZone) {
    return {
      hasObservation: true,
      statusLabel: 'Near zone boundary',
      positionText: `${t.displayX.toFixed(0)}, ${t.displayY.toFixed(0)}`,
      altitudeText: `${t.altitudeM} m`,
      speedText: `${t.speedMps} m/s`,
      headingText: `${t.headingDeg}°`,
      reliabilityLabel: t.quality === 'FRESH' ? 'Reliable' : 'Needs review',
      reliabilityColor: t.quality === 'FRESH' ? 'var(--success)' : 'var(--warning)',
      badgeText: 'Approaching Boundary',
      badgeColor: 'var(--warning)',
      badgeBg: 'var(--warning-surface)',
      badgeBorder: 'var(--warning-border)',
      dotColor: 'var(--warning)',
    };
  }

  // Kinematic position inconsistency
  if (t.quality === 'INCONSISTENT') {
    return {
      hasObservation: true,
      statusLabel: 'Position inconsistent',
      positionText: `${t.displayX.toFixed(0)}, ${t.displayY.toFixed(0)}`,
      altitudeText: `${t.altitudeM} m`,
      speedText: `${t.speedMps} m/s`,
      headingText: `${t.headingDeg}°`,
      reliabilityLabel: 'Needs review',
      reliabilityColor: 'var(--error)',
      badgeText: 'Position Inconsistent',
      badgeColor: 'var(--error)',
      badgeBg: 'var(--error-surface)',
      badgeBorder: 'var(--error-border)',
      dotColor: 'var(--error)',
    };
  }

  // Delayed / degraded updates
  if (t.quality === 'DEGRADED') {
    return {
      hasObservation: true,
      statusLabel: 'Updates delayed',
      positionText: `${t.displayX.toFixed(0)}, ${t.displayY.toFixed(0)}`,
      altitudeText: `${t.altitudeM} m`,
      speedText: `${t.speedMps} m/s`,
      headingText: `${t.headingDeg}°`,
      reliabilityLabel: 'Needs review',
      reliabilityColor: 'var(--warning)',
      badgeText: 'Updates Delayed',
      badgeColor: 'var(--warning)',
      badgeBg: 'var(--warning-surface)',
      badgeBorder: 'var(--warning-border)',
      dotColor: 'var(--warning)',
    };
  }

  // Normal fresh track
  return {
    hasObservation: true,
    statusLabel: 'Recent data',
    positionText: `${t.displayX.toFixed(0)}, ${t.displayY.toFixed(0)}`,
    altitudeText: `${t.altitudeM} m`,
    speedText: `${t.speedMps} m/s`,
    headingText: `${t.headingDeg}°`,
    reliabilityLabel: 'Reliable',
    reliabilityColor: 'var(--success)',
    badgeText: 'Airspace Normal',
    badgeColor: 'var(--success)',
    badgeBg: 'var(--success-surface)',
    badgeBorder: 'var(--success-border)',
    dotColor: 'var(--success)',
  };
}
