import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  Compass,
  RadioOff,
  Navigation,
  Clock,
  Layers,
  List,
  Crosshair,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { Group, TrackView, AlertEvent, ReviewStatus } from '../lib/engine';
import { computeRecommendedReviewOrder } from '../lib/priorityIntelligence';
import { getAlertInboxItem, type AlertIconType } from '../lib/alertInbox';
import { formatRelativeSimTime } from '../lib/coverageWatch';

export type AlertViewMode = 'ORGANIZED' | 'ALL_EVENTS';

interface AlertInboxProps {
  groups: Group[];
  tracks: TrackView[];
  events: AlertEvent[];
  simTimeMs: number;
  selectedTrackId: string | null;
  onOpenEvidence: (group: Group) => void;
  onSelectTrack: (trackId: string) => void;
  onViewOnMap?: (trackId: string, alertContext?: 'ZONE' | 'DATA') => void;
  onSetReview?: (groupId: string, status: ReviewStatus) => void;
  activeViewMode?: AlertViewMode;
  onViewModeChange?: (mode: AlertViewMode) => void;
  inspectedGroupId?: string | null;
  onInspectedGroupIdChange?: (groupId: string | null) => void;
}

export function AlertInbox({
  groups,
  tracks,
  events,
  simTimeMs,
  selectedTrackId,
  onOpenEvidence,
  onSelectTrack,
  onViewOnMap,
  activeViewMode,
  onViewModeChange,
}: AlertInboxProps) {
  // View mode: Organized (default) or All Events
  const [internalViewMode, setInternalViewMode] = useState<AlertViewMode>('ORGANIZED');
  const viewMode = activeViewMode ?? internalViewMode;
  const setViewMode = (mode: AlertViewMode) => {
    if (onViewModeChange) onViewModeChange(mode);
    else setInternalViewMode(mode);
  };

  // Toggle to expand beyond the default 4 cards preview
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);

  // Expanded event ID for All Events view (to inspect raw ID & details)
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Track map for fast lookup
  const trackMap = useMemo(() => {
    const map = new Map<string, TrackView>();
    for (const t of tracks) {
      map.set(t.id, t);
    }
    return map;
  }, [tracks]);

  // Priority Intelligence recommended review ordering (deterministic rule-based queue)
  const recommendedItems = useMemo(() => {
    return computeRecommendedReviewOrder(groups, tracks, events, simTimeMs, {
      categoryFilter: 'ALL',
      sortBy: 'RECOMMENDED',
    });
  }, [groups, tracks, events, simTimeMs]);

  // Derived counts from active event ledger (never fabricated)
  const totalRawEvents = events.length;
  const totalReviewGroups = groups.length;
  const pendingCount = groups.filter((g) => g.reviewStatus === 'UNREVIEWED').length;

  // Pagination limits for compact dashboard preview
  const defaultGroupLimit = 4;
  const visibleReviewItems = showAllGroups
    ? recommendedItems
    : recommendedItems.slice(0, defaultGroupLimit);

  // All Events default sort: newest first
  const sortedRawEvents = useMemo(() => {
    return [...events].sort((a, b) => b.simulatedAtMs - a.simulatedAtMs);
  }, [events]);

  const defaultEventLimit = 10;
  const visibleRawEvents = showAllEvents
    ? sortedRawEvents
    : sortedRawEvents.slice(0, defaultEventLimit);

  // Render meaningful Lucide icon per vocabulary
  const renderIcon = (type: AlertIconType, level: 'high' | 'medium' | 'verify') => {
    const iconColor =
      level === 'high'
        ? 'var(--error)'
        : level === 'medium'
        ? 'var(--warning)'
        : 'var(--text-muted)';

    switch (type) {
      case 'SHIELD':
        return <ShieldAlert size={16} strokeWidth={2.2} style={{ color: iconColor }} aria-hidden="true" />;
      case 'BOUNDARY':
        return <Compass size={16} strokeWidth={2.2} style={{ color: iconColor }} aria-hidden="true" />;
      case 'NO_SIGNAL':
        return <RadioOff size={16} strokeWidth={2.2} style={{ color: iconColor }} aria-hidden="true" />;
      case 'POSITION':
        return <Navigation size={16} strokeWidth={2.2} style={{ color: iconColor }} aria-hidden="true" />;
      case 'CLOCK':
        return <Clock size={16} strokeWidth={2.2} style={{ color: iconColor }} aria-hidden="true" />;
    }
  };

  const handleReviewClick = (g: Group) => {
    onSelectTrack(g.trackId);
    onOpenEvidence(g);
  };

  const handleViewMapClick = (g: Group, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onViewOnMap) {
      onViewOnMap(g.trackId, g.category === 'SECURITY_ADVISORY' ? 'ZONE' : 'DATA');
    } else {
      onSelectTrack(g.trackId);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 1. Panel Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: '-0.2px',
            color: 'var(--text-primary)',
          }}
        >
          Needs Attention
        </h3>
        <span
          className="mono"
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: pendingCount > 0 ? 'var(--warning)' : 'var(--text-muted)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--elevated)',
            border: '1px solid var(--border)',
          }}
        >
          {pendingCount} pending
        </span>
      </div>

      {/* Two Equal-Width Tabs: Organized | All Events */}
      <div
        role="tablist"
        aria-label="Alerts View Mode"
        style={{
          display: 'flex',
          gap: 4,
          padding: 3,
          background: 'var(--elevated)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          width: '100%',
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'ORGANIZED'}
          onClick={() => setViewMode('ORGANIZED')}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '6px 12px',
            fontSize: 13,
            fontWeight: viewMode === 'ORGANIZED' ? 700 : 500,
            borderRadius: 'var(--radius-xs)',
            border: 'none',
            background: viewMode === 'ORGANIZED' ? 'var(--surface)' : 'transparent',
            color: viewMode === 'ORGANIZED' ? 'var(--text-primary)' : 'var(--text-secondary)',
            boxShadow: viewMode === 'ORGANIZED' ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none',
            cursor: 'pointer',
            transition: 'background 0.15s ease, color 0.15s ease',
          }}
        >
          <Layers size={14} />
          <span>Organized</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'ALL_EVENTS'}
          onClick={() => setViewMode('ALL_EVENTS')}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '6px 12px',
            fontSize: 13,
            fontWeight: viewMode === 'ALL_EVENTS' ? 700 : 500,
            borderRadius: 'var(--radius-xs)',
            border: 'none',
            background: viewMode === 'ALL_EVENTS' ? 'var(--surface)' : 'transparent',
            color: viewMode === 'ALL_EVENTS' ? 'var(--text-primary)' : 'var(--text-secondary)',
            boxShadow: viewMode === 'ALL_EVENTS' ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none',
            cursor: 'pointer',
            transition: 'background 0.15s ease, color 0.15s ease',
          }}
        >
          <List size={14} />
          <span>All Events</span>
        </button>
      </div>

      {/* 2. ORGANIZED VIEW */}
      {viewMode === 'ORGANIZED' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Compact Summary Line: e.g. "12 events → 9 groups" */}
          <div
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--radius-xs)',
              background: 'var(--surface-soft)',
              border: '1px solid var(--border-subtle)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>
              <strong style={{ color: 'var(--text-primary)' }}>{totalRawEvents} events</strong> →{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{totalReviewGroups} groups</strong>
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Deterministic grouping
            </span>
          </div>

          {/* Empty State */}
          {recommendedItems.length === 0 && (
            <div
              style={{
                padding: '24px 14px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: 13,
                background: 'var(--surface-soft)',
                borderRadius: 'var(--radius-sm)',
                border: '1px dashed var(--border)',
              }}
            >
              No active alerts. All tracks normal.
            </div>
          )}

          {/* Grouped Alert Cards (Ordered by Priority Intelligence) */}
          {visibleReviewItems.map((item) => {
            const g = item.group;
            const cardInfo = getAlertInboxItem(g, simTimeMs, trackMap.get(g.trackId));
            const isSelected = selectedTrackId === g.trackId;

            // Restrained priority badge styling
            const badgeStyle: React.CSSProperties =
              cardInfo.priorityBadge.level === 'high'
                ? {
                    color: 'var(--error)',
                    border: '1px solid var(--error-border)',
                    background: 'var(--error-surface)',
                  }
                : cardInfo.priorityBadge.level === 'medium'
                ? {
                    color: 'var(--warning)',
                    border: '1px solid var(--warning-border)',
                    background: 'var(--warning-surface)',
                  }
                : {
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                    background: 'var(--elevated)',
                  };

            const cardBorderColor = isSelected
              ? 'var(--accent)'
              : cardInfo.priorityBadge.level === 'high'
              ? 'var(--error-border)'
              : 'var(--border)';

            return (
              <div
                key={g.groupId}
                role="region"
                aria-label={`${cardInfo.title} for ${g.trackId}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${cardBorderColor}`,
                  borderLeft: `3px solid ${
                    cardInfo.priorityBadge.level === 'high'
                      ? 'var(--error)'
                      : cardInfo.priorityBadge.level === 'medium'
                      ? 'var(--warning)'
                      : 'var(--border)'
                  }`,
                  background: isSelected ? 'var(--selected-bg)' : 'var(--surface)',
                  transition: 'background-color 0.15s ease, border-color 0.15s ease',
                }}
              >
                {/* ROW 1: Meaningful issue icon, Short bold title (2–5 words), Priority label: High / Medium / Verify */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 22,
                        height: 22,
                        borderRadius: 'var(--radius-xs)',
                        background: 'var(--elevated)',
                        flexShrink: 0,
                      }}
                    >
                      {renderIcon(cardInfo.iconType, cardInfo.priorityBadge.level)}
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        letterSpacing: '0.2px',
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {cardInfo.title}
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '2px 7px',
                      borderRadius: 'var(--radius-pill)',
                      flexShrink: 0,
                      ...badgeStyle,
                    }}
                  >
                    {cardInfo.priorityBadge.label}
                  </span>
                </div>

                {/* ROW 2: Track ID · Relevant zone or issue context · Original event count */}
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    paddingLeft: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <strong className="mono" style={{ color: 'var(--text-primary)', fontSize: 13 }}>
                    {g.trackId}
                  </strong>
                  <span style={{ color: 'var(--text-muted)' }}>·</span>
                  <span>{cardInfo.shortContext}</span>
                  <span style={{ color: 'var(--text-muted)' }}>·</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {g.rawEventIds.length} {g.rawEventIds.length === 1 ? 'event' : 'events'}
                  </span>
                </div>

                {/* ROW 3: Suggested review position: Review #1, View Map secondary button, Review primary button */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingLeft: 2,
                    marginTop: 2,
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                    }}
                  >
                    Review #{item.queuePosition}
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={(e) => handleViewMapClick(g, e)}
                      style={{
                        padding: '4px 10px',
                        fontSize: 13,
                        fontWeight: 600,
                        height: 32,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                      title={`Focus Drone ${g.trackId} on tactical map`}
                    >
                      <Crosshair size={13} />
                      <span>View Map</span>
                    </button>

                    <button
                      type="button"
                      className="btn-coral"
                      onClick={() => handleReviewClick(g)}
                      style={{
                        padding: '4px 12px',
                        fontSize: 13,
                        fontWeight: 600,
                        height: 32,
                      }}
                    >
                      Review
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* View All Warnings Button (Only limits compact dashboard preview, does not truncate data) */}
          {recommendedItems.length > defaultGroupLimit && (
            <div style={{ paddingTop: 2 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowAllGroups(!showAllGroups)}
                style={{
                  width: '100%',
                  padding: '7px 12px',
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  height: 36,
                }}
              >
                <span>
                  {showAllGroups
                    ? `Collapse to Top ${defaultGroupLimit} Warnings`
                    : `View All Warnings (${recommendedItems.length})`}
                </span>
                <span style={{ fontSize: 11 }}>{showAllGroups ? '▲' : '▼'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* 3. ALL EVENTS VIEW (Underlying Ungrouped Event Ledger) */}
      {viewMode === 'ALL_EVENTS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Header Summary */}
          <div
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--radius-xs)',
              background: 'var(--surface-soft)',
              border: '1px solid var(--border-subtle)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>
              <strong style={{ color: 'var(--text-primary)' }}>{totalRawEvents} Total Events</strong> (Newest First)
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Complete audit ledger
            </span>
          </div>

          {/* Empty State */}
          {sortedRawEvents.length === 0 && (
            <div
              style={{
                padding: '24px 14px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: 13,
                background: 'var(--surface-soft)',
                borderRadius: 'var(--radius-sm)',
                border: '1px dashed var(--border)',
              }}
            >
              No events recorded yet.
            </div>
          )}

          {/* Raw Event Rows */}
          {visibleRawEvents.map((ev) => {
            const ageSec = Math.max(0, (simTimeMs - ev.simulatedAtMs) / 1000);
            const ageLabel = formatRelativeSimTime(ageSec);
            const isSelected = selectedTrackId === ev.trackId;
            const isExpanded = expandedEventId === ev.id;

            // Short human-readable event name
            let eventName = ev.cause;
            if (ev.cause.includes('ZONE_ENTRY') || ev.cause.includes('ENTERED')) {
              eventName = 'Restricted Zone Entry';
            } else if (ev.cause.includes('BOUNDARY') || ev.cause.includes('APPROACH')) {
              eventName = 'Approaching Boundary';
            } else if (ev.cause.includes('POSITION') || ev.cause.includes('JUMP')) {
              eventName = 'Inconsistent Position';
            } else if (ev.cause.includes('MISSING') || ev.cause.includes('GAP')) {
              eventName = 'Missing Telemetry';
            } else if (ev.cause.includes('DELAY')) {
              eventName = 'Delayed Packets';
            }

            return (
              <div
                key={ev.id}
                role="region"
                aria-label={`Event ${ev.id} for ${ev.trackId}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: isSelected ? 'var(--selected-bg)' : 'var(--surface)',
                }}
              >
                {/* Row 1: Track ID, Short event name, Event timestamp, View Map button */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <span
                      className="mono"
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: 'var(--radius-xs)',
                        background: 'var(--elevated)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {ev.trackId}
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {eventName}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span
                      className="mono"
                      style={{ fontSize: 11, color: 'var(--text-muted)' }}
                    >
                      {ageLabel}
                    </span>

                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        if (onViewOnMap) {
                          onViewOnMap(ev.trackId, ev.category === 'SECURITY_ADVISORY' ? 'ZONE' : 'DATA');
                        } else {
                          onSelectTrack(ev.trackId);
                        }
                      }}
                      style={{
                        padding: '2px 7px',
                        fontSize: 11,
                        height: 24,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                      title={`View Drone ${ev.trackId} on map`}
                    >
                      <Crosshair size={11} />
                      <span>Map</span>
                    </button>

                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                      style={{
                        padding: '2px 6px',
                        fontSize: 11,
                        height: 24,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                      }}
                    >
                      <span>Details</span>
                      {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details: Raw Event ID accessible here */}
                {isExpanded && (
                  <div
                    style={{
                      marginTop: 4,
                      padding: '6px 8px',
                      background: 'var(--elevated)',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: 11,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Event ID: </span>
                      <strong className="mono" style={{ color: 'var(--text-primary)' }}>
                        {ev.id}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Category: </span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {ev.category === 'SECURITY_ADVISORY' ? 'Security Advisory' : 'Data Quality'}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Cause: </span>
                      <span className="mono" style={{ color: 'var(--text-secondary)' }}>
                        {ev.cause}
                      </span>
                    </div>
                    {ev.evidence.ruleDetail && (
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Rule Detail: </span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {ev.evidence.ruleDetail}
                        </span>
                      </div>
                    )}
                    {ev.evidence.ml && (
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Isolation Forest AI: </span>
                        <span style={{ color: ev.evidence.ml.flagged ? 'var(--warning)' : 'var(--text-secondary)' }}>
                          Score {ev.evidence.ml.score.toFixed(3)} {ev.evidence.ml.flagged ? '(Anomaly Flagged)' : '(Normal)'}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* View All Events Button */}
          {sortedRawEvents.length > defaultEventLimit && (
            <div style={{ paddingTop: 2 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowAllEvents(!showAllEvents)}
                style={{
                  width: '100%',
                  padding: '7px 12px',
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  height: 36,
                }}
              >
                <span>
                  {showAllEvents
                    ? `Collapse to Top ${defaultEventLimit} Events`
                    : `View All Events (${sortedRawEvents.length})`}
                </span>
                <span style={{ fontSize: 11 }}>{showAllEvents ? '▲' : '▼'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
