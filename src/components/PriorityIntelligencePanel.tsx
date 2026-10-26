import React, { useState } from 'react';
import type { Group, TrackView, AlertEvent, ReviewStatus } from '../lib/engine';
import {
  computeRecommendedReviewOrder,
  type CategoryFilter,
  type SortOption,
} from '../lib/priorityIntelligence';
import { getAlertInboxItem } from '../lib/alertInbox';

interface PriorityIntelligencePanelProps {
  groups: Group[];
  tracks: TrackView[];
  events: AlertEvent[];
  simTimeMs: number;
  selectedTrackId: string | null;
  onSelectTrack: (trackId: string) => void;
  onOpenReview: (group: Group) => void;
  onSetReview: (groupId: string, status: ReviewStatus) => void;
}

export function PriorityIntelligencePanel({
  groups,
  tracks,
  events,
  simTimeMs,
  selectedTrackId,
  onSelectTrack,
  onOpenReview,
  onSetReview,
}: PriorityIntelligencePanelProps) {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [sortOption, setSortOption] = useState<SortOption>('RECOMMENDED');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [expandedReasonId, setExpandedReasonId] = useState<string | null>(null);
  const [showAllQueue, setShowAllQueue] = useState(false);

  // Track map for fast lookup
  const trackMap = new Map<string, TrackView>();
  for (const t of tracks) {
    trackMap.set(t.id, t);
  }

  const reviewItems = computeRecommendedReviewOrder(
    groups,
    tracks,
    events,
    simTimeMs,
    {
      categoryFilter,
      sortBy: sortOption,
    }
  );

  const visibleItems = showAllQueue ? reviewItems : reviewItems.slice(0, 3);
  const totalItems = reviewItems.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <h4
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.1px',
                whiteSpace: 'nowrap',
              }}
            >
              Suggested Review Order
            </h4>
            {totalItems > 0 && (
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '1px 5px',
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--elevated)',
                  color: 'var(--text-secondary)',
                }}
              >
                {totalItems}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
            Which warning should I check next?
          </div>
        </div>

        {/* Compact Filter / Sort Menu Toggle */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setFilterMenuOpen(!filterMenuOpen)}
            style={{
              padding: '2px 7px',
              fontSize: 10,
              height: 22,
              borderRadius: 'var(--radius-xs)',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
            title="Filter and Sort options"
          >
            <span>Options</span>
            <span style={{ fontSize: 9 }}>{filterMenuOpen ? '▲' : '▼'}</span>
          </button>

          {filterMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 4,
                width: 210,
                background: 'var(--surface)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-sm)',
                boxShadow: 'var(--shadow-md)',
                zIndex: 35,
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3, textTransform: 'uppercase' }}>
                  Filter
                </span>
                <select
                  aria-label="Category filter"
                  className="input"
                  style={{ fontSize: 11, padding: '3px 6px', height: 24, width: '100%' }}
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
                >
                  <option value="ALL">All Categories</option>
                  <option value="SECURITY_ADVISORY">Airspace Advisories</option>
                  <option value="DATA_QUALITY">Data Quality</option>
                </select>
              </div>

              <div>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3, textTransform: 'uppercase' }}>
                  Sort
                </span>
                <select
                  aria-label="Sort queue"
                  className="input"
                  style={{ fontSize: 11, padding: '3px 6px', height: 24, width: '100%' }}
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as SortOption)}
                >
                  <option value="RECOMMENDED">Recommended Order</option>
                  <option value="NEWEST">Newest First</option>
                  <option value="OLDEST">Oldest First</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Empty State */}
      {totalItems === 0 && (
        <div
          style={{
            padding: '12px 8px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 11,
            background: 'var(--surface-soft)',
            borderRadius: 'var(--radius-sm)',
            border: '1px dashed var(--border)',
          }}
        >
          No warnings waiting for review.
        </div>
      )}

      {/* Compact Numbered Queue */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {visibleItems.map((item, index) => {
          const inboxItem = getAlertInboxItem(item.group, simTimeMs, trackMap.get(item.group.trackId));
          const isSelected = selectedTrackId === item.group.trackId;
          const isReasonOpen = expandedReasonId === item.group.groupId;

          return (
            <div
              key={item.group.groupId}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                padding: '6px 8px',
                borderRadius: 'var(--radius-sm)',
                border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: isSelected ? 'var(--selected-bg)' : 'var(--surface)',
                transition: 'background-color 0.15s ease',
              }}
            >
              {/* Row 1: Rank, Drone ID, Title, Review Button */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span
                    className="mono"
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--accent)',
                      width: 14,
                    }}
                  >
                    {index + 1}.
                  </span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      background: 'var(--elevated)',
                      padding: '1px 5px',
                      borderRadius: 'var(--radius-xs)',
                    }}
                  >
                    {item.group.trackId}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {inboxItem.title}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn-coral"
                    onClick={() => {
                      onSelectTrack(item.group.trackId);
                      onOpenReview(item.group);
                    }}
                    style={{
                      padding: '2px 8px',
                      fontSize: 10,
                      fontWeight: 600,
                      height: 20,
                    }}
                  >
                    Review
                  </button>
                </div>
              </div>

              {/* Row 2: Rationale Toggle & Preview */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, fontSize: 10 }}>
                <span style={{ color: 'var(--text-muted)' }}>
                  {item.reasonForPlacement}
                </span>

                <button
                  type="button"
                  onClick={() => setExpandedReasonId(isReasonOpen ? null : item.group.groupId)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent)',
                    cursor: 'pointer',
                    fontSize: 10,
                    padding: 0,
                  }}
                >
                  {isReasonOpen ? 'Hide rationale' : 'Why this order?'}
                </button>
              </div>

              {/* Expandable Explanation */}
              {isReasonOpen && (
                <div
                  style={{
                    marginTop: 3,
                    padding: '6px 8px',
                    background: 'var(--elevated)',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: 10,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.35,
                    borderLeft: '2px solid var(--accent)',
                  }}
                >
                  {item.detailedExplanation}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Show more toggle */}
      {totalItems > 3 && (
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setShowAllQueue(!showAllQueue)}
          style={{
            padding: '4px 8px',
            fontSize: 10,
            color: 'var(--text-secondary)',
            width: '100%',
            justifyContent: 'center',
          }}
        >
          {showAllQueue ? 'Collapse queue' : `View all (${totalItems} items)`}
        </button>
      )}
    </div>
  );
}
