import type { TrackView, Quality } from './engine';

/**
 * Standardized relative simulation time formatter.
 * Consistent policy across all panels, drone lists, alert cards, and Coverage Watch.
 * 
 * Rules:
 * - Negative, NaN, or non-finite -> 'Awaiting data'
 * - Less than 1 second -> 'Just now'
 * - 1 to 59 seconds -> '<N>s ago'
 * - 60+ seconds -> '<M>m ago' or '<M>m <S>s ago'
 */
export function formatRelativeSimTime(ageSec: number | null | undefined): string {
  if (ageSec === null || ageSec === undefined || !Number.isFinite(ageSec) || ageSec < 0) {
    return 'Awaiting data';
  }
  if (ageSec < 1) {
    return 'Just now';
  }
  const s = Math.round(ageSec);
  if (s < 60) {
    return `${s}s ago`;
  }
  const m = Math.floor(s / 60);
  const remS = s % 60;
  if (m < 60) {
    return remS === 0 ? `${m}m ago` : `${m}m ${remS}s ago`;
  }
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export type CoverageCategory = 'RECENT' | 'NEEDS_VERIFICATION' | 'NO_RECENT_DATA';

export interface TrackCoverageDetail {
  id: string;
  category: CoverageCategory;
  quality: Quality;
  ageSec: number;
  ageLabel: string;
  lastConfirmedPos: { x: number; y: number } | null;
  lastConfirmedAltitudeM: number | null;
  lastConfirmedSpeedMps: number | null;
  isCurrentPositionKnown: boolean;
  isPredictionAvailable: boolean;
  explanation: string;
  lastObservedTimeLabel: string;
}

export interface CoverageWatchSummary {
  totalTracks: number;
  recentCount: number;
  needsVerificationCount: number;
  noRecentDataCount: number;
  needsAttentionTotal: number;
  tracks: TrackCoverageDetail[];
}

/**
 * Derives Coverage Watch metrics directly from live TrackView state.
 * Reuses the validated Trust Lens freshness rules:
 * - FRESH: age <= 2s (Recent Data)
 * - DEGRADED: age > 2s && <= 4s (Needs Verification - Latency)
 * - INCONSISTENT: residual > 60 && age <= 4s (Needs Verification - Kinematic mismatch)
 * - STALE: age > 4s (No Recent Data - Updates halted)
 * - NEW: no accepted observations yet (No Recent Data)
 */
export function getCoverageWatchSummary(tracks: TrackView[]): CoverageWatchSummary {
  let recentCount = 0;
  let needsVerificationCount = 0;
  let noRecentDataCount = 0;

  const trackDetails: TrackCoverageDetail[] = tracks.map((t) => {
    let category: CoverageCategory = 'RECENT';
    let isCurrentPositionKnown = true;
    let isPredictionAvailable = true;
    let explanation = 'Recent valid observations received within nominal transmission window.';

    if (!t.hasObservation || t.quality === 'NEW') {
      category = 'NO_RECENT_DATA';
      isCurrentPositionKnown = false;
      isPredictionAvailable = false;
      explanation = 'No valid observation packets received yet for this transponder.';
      noRecentDataCount++;
    } else if (t.quality === 'STALE') {
      category = 'NO_RECENT_DATA';
      isCurrentPositionKnown = false;
      isPredictionAvailable = false;
      explanation = 'Observation stream stopped for over 4 seconds. Current location is unknown; display shows last confirmed position.';
      noRecentDataCount++;
    } else if (t.quality === 'INCONSISTENT') {
      category = 'NEEDS_VERIFICATION';
      isCurrentPositionKnown = false;
      isPredictionAvailable = false;
      explanation = 'Reported position jumped outside kinematic physics model. Sensor verification required before trusting track coordinates.';
      needsVerificationCount++;
    } else if (t.quality === 'DEGRADED') {
      category = 'NEEDS_VERIFICATION';
      isCurrentPositionKnown = true;
      isPredictionAvailable = true;
      explanation = 'Observations are arriving with latency exceeding the 2-second transmission threshold.';
      needsVerificationCount++;
    } else {
      category = 'RECENT';
      isCurrentPositionKnown = true;
      isPredictionAvailable = true;
      recentCount++;
    }

    const ageLabel = t.hasObservation ? formatRelativeSimTime(t.ageSec) : 'Awaiting data';
    const lastConfirmedPos = t.hasObservation ? { x: Math.round(t.x), y: Math.round(t.y) } : null;
    const lastObservedTimeLabel = t.lastObservedMs !== null
      ? `T+${(t.lastObservedMs / 1000).toFixed(0)}s`
      : 'No observations';

    return {
      id: t.id,
      category,
      quality: t.quality,
      ageSec: t.ageSec,
      ageLabel,
      lastConfirmedPos,
      lastConfirmedAltitudeM: t.hasObservation ? t.altitudeM : null,
      lastConfirmedSpeedMps: t.hasObservation ? t.speedMps : null,
      isCurrentPositionKnown,
      isPredictionAvailable,
      explanation,
      lastObservedTimeLabel,
    };
  });

  return {
    totalTracks: tracks.length,
    recentCount,
    needsVerificationCount,
    noRecentDataCount,
    needsAttentionTotal: needsVerificationCount + noRecentDataCount,
    tracks: trackDetails,
  };
}
