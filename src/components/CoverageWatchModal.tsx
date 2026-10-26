import React, { useState } from 'react';
import type { TrackView } from '../lib/engine';
import {
  getCoverageWatchSummary,
  type CoverageCategory,
  type TrackCoverageDetail,
} from '../lib/coverageWatch';

interface CoverageWatchModalProps {
  tracks: TrackView[];
  isOpen: boolean;
  onClose: () => void;
  onSelectTrack: (trackId: string) => void;
  onViewOnMap?: (trackId: string, alertContext?: 'ZONE' | 'DATA') => void;
}

export function CoverageWatchModal({
  tracks,
  isOpen,
  onClose,
  onSelectTrack,
  onViewOnMap,
}: CoverageWatchModalProps) {
  const [filterCategory, setFilterCategory] = useState<'ALL' | CoverageCategory>('ALL');

  if (!isOpen) return null;

  const summary = getCoverageWatchSummary(tracks);

  const filteredTracks = summary.tracks.filter((t) => {
    if (filterCategory === 'ALL') return true;
    return t.category === filterCategory;
  });

  return (
    <div
      className="overlay"
      role="dialog"
      aria-label="Coverage Watch Overview"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 620,
          maxHeight: '85vh',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.36)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--elevated)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                Coverage Watch
              </h3>
              <span
                className="chip mono"
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-pill)',
                  background: summary.needsAttentionTotal > 0 ? 'var(--warning-surface)' : 'var(--success-surface)',
                  color: summary.needsAttentionTotal > 0 ? 'var(--warning)' : 'var(--success)',
                  border: `1px solid ${summary.needsAttentionTotal > 0 ? 'var(--warning-border)' : 'rgba(93, 184, 114, 0.3)'}`,
                }}
              >
                {summary.needsAttentionTotal === 0
                  ? 'All Feeds Current'
                  : `${summary.needsAttentionTotal} Feed${summary.needsAttentionTotal === 1 ? '' : 's'} Need Check`}
              </span>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              Shows which drones have recent data and which need checking.
            </p>
          </div>

          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            style={{ padding: '4px 10px', fontSize: 12 }}
          >
            Close
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Factual Disclaimer */}
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-soft)',
              border: '1px solid var(--border)',
              fontSize: 11,
              color: 'var(--text-secondary)',
              lineHeight: 1.4,
            }}
          >
            <b>Observation-Availability Scope:</b> Evaluates received telemetry recency and kinematic consistency. Does not represent physical radar coverage percentage, military blind spots, or physical drone disappearance.
          </div>

          {/* 3 Overview Categories */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <button
              type="button"
              onClick={() => setFilterCategory(filterCategory === 'RECENT' ? 'ALL' : 'RECENT')}
              style={{
                background: filterCategory === 'RECENT' ? 'var(--elevated)' : 'var(--canvas)',
                border: `1px solid ${filterCategory === 'RECENT' ? 'var(--success)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)',
                padding: '10px 12px',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Recent Data</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--success)', margin: '4px 0 2px' }}>
                {summary.recentCount}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Valid updates within 2s</div>
            </button>

            <button
              type="button"
              onClick={() => setFilterCategory(filterCategory === 'NEEDS_VERIFICATION' ? 'ALL' : 'NEEDS_VERIFICATION')}
              style={{
                background: filterCategory === 'NEEDS_VERIFICATION' ? 'var(--elevated)' : 'var(--canvas)',
                border: `1px solid ${filterCategory === 'NEEDS_VERIFICATION' ? 'var(--warning)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)',
                padding: '10px 12px',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Needs Verification</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--warning)', margin: '4px 0 2px' }}>
                {summary.needsVerificationCount}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Delayed or inconsistent</div>
            </button>

            <button
              type="button"
              onClick={() => setFilterCategory(filterCategory === 'NO_RECENT_DATA' ? 'ALL' : 'NO_RECENT_DATA')}
              style={{
                background: filterCategory === 'NO_RECENT_DATA' ? 'var(--elevated)' : 'var(--canvas)',
                border: `1px solid ${filterCategory === 'NO_RECENT_DATA' ? 'var(--error)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)',
                padding: '10px 12px',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>No Recent Data</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--error)', margin: '4px 0 2px' }}>
                {summary.noRecentDataCount}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Updates halted (&gt; 4s)</div>
            </button>
          </div>

          {/* Filter Subheading */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
              {filterCategory === 'ALL'
                ? `All Tracks (${filteredTracks.length})`
                : filterCategory === 'RECENT'
                ? `Tracks with Recent Data (${filteredTracks.length})`
                : filterCategory === 'NEEDS_VERIFICATION'
                ? `Tracks Needing Verification (${filteredTracks.length})`
                : `Tracks with No Recent Data (${filteredTracks.length})`}
            </span>
            {filterCategory !== 'ALL' && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setFilterCategory('ALL')}
                style={{ padding: '2px 6px', fontSize: 11 }}
              >
                Show All
              </button>
            )}
          </div>

          {/* Track Availability Rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredTracks.map((t) => {
              const badgeColor =
                t.category === 'RECENT'
                  ? 'var(--success)'
                  : t.category === 'NEEDS_VERIFICATION'
                  ? 'var(--warning)'
                  : 'var(--error)';

              const badgeText =
                t.category === 'RECENT'
                  ? 'Recent Data'
                  : t.category === 'NEEDS_VERIFICATION'
                  ? 'Needs Verification'
                  : 'No Recent Data';

              return (
                <div
                  key={t.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    borderLeft: `3px solid ${badgeColor}`,
                    background: 'var(--canvas)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="mono" style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                        {t.id}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: 'var(--radius-pill)',
                          border: `1px solid ${badgeColor}`,
                          color: badgeColor,
                        }}
                      >
                        {badgeText}
                      </span>
                    </div>

                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      Last valid: {t.ageLabel}
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {t.explanation}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 6,
                      fontSize: 10,
                      background: 'var(--surface)',
                      padding: '6px 8px',
                      borderRadius: 'var(--radius-xs)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Current Location: </span>
                      <b style={{ color: t.isCurrentPositionKnown ? 'var(--text-primary)' : 'var(--warning)' }}>
                        {t.isCurrentPositionKnown ? 'Confirmed' : 'Unknown'}
                      </b>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Last Confirmed: </span>
                      <b style={{ color: 'var(--text-primary)' }}>
                        {t.lastConfirmedPos ? `${t.lastConfirmedPos.x}, ${t.lastConfirmedPos.y}` : 'None'}
                      </b>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Trajectory Prediction: </span>
                      <b style={{ color: t.isPredictionAvailable ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {t.isPredictionAvailable ? 'Available' : 'Unavailable'}
                      </b>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                    <button
                      type="button"
                      className="btn-coral"
                      style={{ padding: '0 14px', fontSize: 13, fontWeight: 600, height: 32 }}
                      onClick={() => {
                        if (onViewOnMap) {
                          onViewOnMap(t.id, 'DATA');
                        } else {
                          onSelectTrack(t.id);
                        }
                        onClose();
                      }}
                    >
                      View on Map
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
