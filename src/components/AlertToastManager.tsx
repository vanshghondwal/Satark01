import React, { useState, useEffect, useRef } from 'react';
import type { Group, TrackView } from '../lib/engine';
import { getAlertInboxItem } from '../lib/alertInbox';
import { Crosshair } from 'lucide-react';

export interface AlertToast {
  id: string;
  groupId: string;
  trackId: string;
  title: string;
  priorityLevel: 'high' | 'medium' | 'verify';
  createdAtMs: number;
}

interface AlertToastManagerProps {
  groups: Group[];
  tracks: TrackView[];
  simTimeMs: number;
  onOpenEvidence: (group: Group) => void;
  onSelectTrack: (trackId: string) => void;
  onViewOnMap?: (trackId: string, alertContext?: 'ZONE' | 'DATA') => void;
}

export function AlertToastManager({
  groups,
  tracks,
  simTimeMs,
  onOpenEvidence,
  onSelectTrack,
  onViewOnMap,
}: AlertToastManagerProps) {
  const [toasts, setToasts] = useState<AlertToast[]>([]);
  const seenGroupIdsRef = useRef<Set<string>>(new Set());
  const hoveredToastIdRef = useRef<string | null>(null);

  // Track map for fast lookup
  const trackMap = new Map<string, TrackView>();
  for (const t of tracks) {
    trackMap.set(t.id, t);
  }

  // Detect newly created groups
  useEffect(() => {
    // On initial mount or if no groups, don't spam
    if (groups.length === 0) return;

    const newToasts: AlertToast[] = [];

    for (const g of groups) {
      // If reviewed or acknowledged, do not alert as fresh toast
      if (g.reviewStatus !== 'UNREVIEWED') {
        seenGroupIdsRef.current.add(g.groupId);
        continue;
      }

      if (!seenGroupIdsRef.current.has(g.groupId)) {
        seenGroupIdsRef.current.add(g.groupId);
        const item = getAlertInboxItem(g, simTimeMs, trackMap.get(g.trackId));
        newToasts.push({
          id: `toast-${g.groupId}-${Date.now()}`,
          groupId: g.groupId,
          trackId: g.trackId,
          title: item.title,
          priorityLevel: item.priorityBadge.level,
          createdAtMs: Date.now(),
        });
      }
    }

    if (newToasts.length > 0) {
      setToasts((prev) => {
        // Enforce maximum 2 visible toasts simultaneously
        const combined = [...prev, ...newToasts];
        return combined.slice(-2);
      });
    }
  }, [groups, simTimeMs]);

  // Auto-dismiss timer (5 seconds) with pause on hover
  useEffect(() => {
    if (toasts.length === 0) return;

    const timer = setInterval(() => {
      setToasts((prev) => {
        const now = Date.now();
        return prev.filter((t) => {
          // Pause dismissal if currently hovered
          if (hoveredToastIdRef.current === t.id) return true;
          return now - t.createdAtMs < 5000;
        });
      });
    }, 500);

    return () => clearInterval(timer);
  }, [toasts.length]);

  const handleReview = (toast: AlertToast) => {
    const group = groups.find((g) => g.groupId === toast.groupId);
    onSelectTrack(toast.trackId);
    if (group) {
      onOpenEvidence(group);
    }
    // Dismiss this toast immediately
    setToasts((prev) => prev.filter((t) => t.id !== toast.id));
  };

  const handleDismiss = (toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  };

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Recent Airspace Alerts"
      style={{
        position: 'fixed',
        top: 68,
        right: 20,
        zIndex: 45,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 320,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => {
        const isHigh = toast.priorityLevel === 'high';
        const isMedium = toast.priorityLevel === 'medium';

        const borderColor = isHigh
          ? 'var(--error-border)'
          : isMedium
          ? 'var(--warning-border)'
          : 'var(--border)';

        const accentColor = isHigh
          ? 'var(--error)'
          : isMedium
          ? 'var(--warning)'
          : 'var(--text-muted)';

        return (
          <div
            key={toast.id}
            onMouseEnter={() => {
              hoveredToastIdRef.current = toast.id;
            }}
            onMouseLeave={() => {
              hoveredToastIdRef.current = null;
            }}
            style={{
              pointerEvents: 'auto',
              background: 'var(--surface)',
              border: `1px solid ${borderColor}`,
              borderLeft: `4px solid ${accentColor}`,
              borderRadius: 'var(--radius-sm)',
              boxShadow: 'var(--shadow-md)',
              padding: '9px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              animation: 'toastSlideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  className="mono"
                  style={{
                    fontWeight: 700,
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    background: 'var(--elevated)',
                    padding: '1px 5px',
                    borderRadius: 'var(--radius-xs)',
                  }}
                >
                  {toast.trackId}
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
                  {toast.title}
                </span>
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                New incident awaiting operator review
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  const group = groups.find((g) => g.groupId === toast.groupId);
                  if (onViewOnMap) {
                    onViewOnMap(toast.trackId, group?.category === 'SECURITY_ADVISORY' ? 'ZONE' : 'DATA');
                  } else {
                    onSelectTrack(toast.trackId);
                  }
                }}
                style={{
                  padding: '3px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  height: 24,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                }}
                title={`View Drone ${toast.trackId} on tactical map`}
              >
                <Crosshair size={11} />
                <span>View on Map</span>
              </button>
              <button
                type="button"
                className="btn-coral"
                onClick={() => handleReview(toast)}
                style={{
                  padding: '3px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  height: 24,
                }}
              >
                Review
              </button>
              <button
                type="button"
                onClick={() => handleDismiss(toast.id)}
                aria-label="Dismiss alert toast"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  lineHeight: 1,
                }}
              >
                x
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
