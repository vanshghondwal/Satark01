import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { TrackView } from '../lib/engine';
import { ZONE_INFO } from '../lib/engine';
import { useTheme } from '../lib/theme';
import { getTrackDerivedStatus } from '../lib/trackStatus';
import {
  Compass,
  Crosshair,
  Layers,
  Maximize2,
  ZoomIn,
  ZoomOut,
  X,
  Eye,
  Sliders,
} from 'lucide-react';

export type MapProjection = '2D' | '2.5D';

export interface MapFocusTarget {
  trackId: string;
  nonce: number;
  alertContext?: 'ZONE' | 'DATA';
}

export interface MapViewProps {
  tracks: TrackView[];
  selected: string | null;
  onSelect: (id: string) => void;
  showTrails: boolean;
  setShowTrails: (val: boolean) => void;
  showPrediction: boolean;
  setShowPrediction: (val: boolean) => void;
  showLabels: boolean;
  setShowLabels: (val: boolean) => void;
  showZone: boolean;
  setShowZone: (val: boolean) => void;
  replayPos?: Record<string, { x: number; y: number; quality: string }> | null;
  onClearSelection?: () => void;
  focusTarget?: MapFocusTarget | null;
  onExitFocus?: () => void;
}

export function MapView({
  tracks,
  selected,
  onSelect,
  showTrails,
  setShowTrails,
  showPrediction,
  setShowPrediction,
  showLabels,
  setShowLabels,
  showZone,
  setShowZone,
  replayPos,
  onClearSelection,
  focusTarget,
  onExitFocus,
}: MapViewProps) {
  const { effectiveTheme } = useTheme();
  const isLight = effectiveTheme === 'light';

  // Projection: 2D Tactical (default) or 2.5D Oblique Air-Situation Display
  const [projection, setProjection] = useState<MapProjection>('2D');

  // View state: scale (k) and translation (x, y)
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [drag, setDrag] = useState<{ sx: number; sy: number; vx: number; vy: number } | null>(null);

  // Active tracking / follow mode
  const [followSelected, setFollowSelected] = useState<boolean>(false);
  const [lastFocusNonce, setLastFocusNonce] = useState<number>(0);

  // Layer visibility & overlay states
  const [showGrid, setShowGrid] = useState(true);
  const [showContours, setShowContours] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false);
  const [hoveredTrack, setHoveredTrack] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [containerDim, setContainerDim] = useState({ width: 880, height: 520 });

  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // ResizeObserver for dynamic landscape viewBox computation
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setContainerDim({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Compute landscape viewBox that fills container without letterboxing
  const aspect = Math.max(0.5, containerDim.width / Math.max(1, containerDim.height));
  const vbWidth = aspect >= 1 ? 1000 * aspect : 1000;
  const vbHeight = aspect >= 1 ? 1000 : 1000 / aspect;
  const vbMinX = 500 - vbWidth / 2;
  const vbMinY = 500 - vbHeight / 2;

  // Fit all active tracks and exercise zone neatly into landscape viewport
  const fitAll = useCallback(() => {
    setFollowSelected(false);
    const active = tracks.filter((t) => t.hasObservation || replayPos?.[t.id]);
    const xs = active.map((t) => (replayPos?.[t.id] ? replayPos[t.id].x : t.displayX));
    const ys = active.map((t) => (replayPos?.[t.id] ? replayPos[t.id].y : t.displayY));

    // Include zone alpha
    xs.push(ZONE_INFO.cx - ZONE_INFO.r - 40, ZONE_INFO.cx + ZONE_INFO.r + 40);
    ys.push(ZONE_INFO.cy - ZONE_INFO.r - 40, ZONE_INFO.cy + ZONE_INFO.r + 40);

    const minX = Math.max(0, Math.min(...xs));
    const maxX = Math.min(1000, Math.max(...xs));
    const minY = Math.max(0, Math.min(...ys));
    const maxY = Math.min(1000, Math.max(...ys));

    const spanX = Math.max(320, maxX - minX);
    const spanY = Math.max(320, maxY - minY);
    const margin = 70;

    const scaleX = vbWidth / (spanX + margin * 2);
    const scaleY = vbHeight / (spanY + margin * 2);
    const scale = Math.min(2.2, Math.max(0.7, Math.min(scaleX, scaleY)));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setView({
      k: scale,
      x: 500 - centerX * scale,
      y: 500 - centerY * scale,
    });
  }, [tracks, replayPos, vbWidth, vbHeight]);

  // Center on selected track
  const centerSelected = useCallback((targetZoom?: number) => {
    if (!selected) return;
    const t = tracks.find((x) => x.id === selected);
    if (!t || (!t.hasObservation && !replayPos?.[t.id])) return;
    const posX = replayPos?.[t.id] ? replayPos[t.id].x : t.displayX;
    const posY = replayPos?.[t.id] ? replayPos[t.id].y : t.displayY;
    const targetK = targetZoom || Math.max(view.k, 1.8);

    setView({
      k: targetK,
      x: 500 - posX * targetK,
      y: 500 - posY * targetK,
    });
  }, [tracks, selected, view.k, replayPos]);

  // Handle incoming focusTarget from "View on Map" triggers
  useEffect(() => {
    if (focusTarget && focusTarget.nonce !== lastFocusNonce) {
      setLastFocusNonce(focusTarget.nonce);
      setFollowSelected(true);
      const t = tracks.find((x) => x.id === focusTarget.trackId);
      if (t) {
        const posX = replayPos?.[t.id] ? replayPos[t.id].x : t.displayX;
        const posY = replayPos?.[t.id] ? replayPos[t.id].y : t.displayY;
        const targetK = 1.85;
        setView({
          k: targetK,
          x: 500 - posX * targetK,
          y: 500 - posY * targetK,
        });
      }
    }
  }, [focusTarget, lastFocusNonce, tracks, replayPos]);

  // Dynamic Follow Selected mode: keep centered if drone moves
  useEffect(() => {
    if (!followSelected || !selected || drag) return;
    const t = tracks.find((x) => x.id === selected);
    if (!t) return;
    const posX = replayPos?.[t.id] ? replayPos[t.id].x : t.displayX;
    const posY = replayPos?.[t.id] ? replayPos[t.id].y : t.displayY;

    setView((v) => {
      const targetX = 500 - posX * v.k;
      const targetY = 500 - posY * v.k;
      // Smooth interpolation to avoid abrupt jitter
      return {
        k: v.k,
        x: v.x + (targetX - v.x) * 0.4,
        y: v.y + (targetY - v.y) * 0.4,
      };
    });
  }, [tracks, selected, followSelected, drag, replayPos]);

  // Zoom handler
  const zoom = useCallback((factor: number) => {
    setView((v) => {
      const nextK = Math.max(0.6, Math.min(3.5, v.k * factor));
      const cx = 500;
      const cy = 500;
      const nx = cx - (cx - v.x) * (nextK / v.k);
      const ny = cy - (cy - v.y) * (nextK / v.k);
      return { k: nextK, x: nx, y: ny };
    });
  }, []);

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    if (!svgRef.current) {
      zoom(factor);
      return;
    }
    const rect = svgRef.current.getBoundingClientRect();
    const cursorSvgX = vbMinX + ((e.clientX - rect.left) / rect.width) * vbWidth;
    const cursorSvgY = vbMinY + ((e.clientY - rect.top) / rect.height) * vbHeight;
    setView((v) => {
      const nextK = Math.max(0.6, Math.min(3.5, v.k * factor));
      const nx = cursorSvgX - (cursorSvgX - v.x) * (nextK / v.k);
      const ny = cursorSvgY - (cursorSvgY - v.y) * (nextK / v.k);
      return { k: nextK, x: nx, y: ny };
    });
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    setDrag({
      sx: e.clientX,
      sy: e.clientY,
      vx: view.x,
      vy: view.y,
    });
    // Manual pan disengages follow mode without losing selection
    if (followSelected) {
      setFollowSelected(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (drag) {
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      setView((v) => ({ ...v, x: drag.vx + dx, y: drag.vy + dy }));
    }
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setTooltipPos({
        x: e.clientX - rect.left + 14,
        y: e.clientY - rect.top + 14,
      });
    }
  };

  const handleMouseUp = () => setDrag(null);

  // Status colors based on theme
  const getTrackColor = (t: TrackView) => {
    if (t.inZone) return isLight ? '#B32626' : '#C64545';
    if (t.nearZone || t.quality === 'DEGRADED') return isLight ? '#986400' : '#D4A017';
    if (t.quality === 'INCONSISTENT') return isLight ? '#B32626' : '#C64545';
    if (t.quality === 'STALE' || !t.hasObservation) return isLight ? '#8E8B82' : '#6C6A64';
    return isLight ? '#287F4B' : '#5DB872'; // Normal / Reliable
  };

  const selectedTrackObj = selected ? tracks.find((t) => t.id === selected) : null;
  const hoveredTrackObj = hoveredTrack ? tracks.find((t) => t.id === hoveredTrack) : null;
  const hoveredStatus = hoveredTrackObj ? getTrackDerivedStatus(hoveredTrackObj) : null;

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        width: '100%',
      }}
    >
      {/* Top Map Controls Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderBottom: 'none',
          borderTopLeftRadius: 'var(--radius-md)',
          borderTopRightRadius: 'var(--radius-md)',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        {/* Left: Title & Sector Chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.2px' }}>
            Airspace Map
          </span>
          <span
            className="chip mono"
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--elevated)',
              color: 'var(--text-secondary)',
            }}
          >
            Exercise Zone Alpha · 1000m x 1000m
          </span>

          {/* 2D Tactical vs 2.5D Terrain Mode Toggle */}
          <div
            role="group"
            aria-label="Map projection mode"
            style={{
              display: 'flex',
              padding: 2,
              background: 'var(--elevated)',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--border)',
            }}
          >
            <button
              type="button"
              className={`btn-ghost ${projection === '2D' ? 'active' : ''}`}
              style={{
                height: 26,
                padding: '0 8px',
                fontSize: 11,
                fontWeight: projection === '2D' ? 700 : 500,
                border: 'none',
                background: projection === '2D' ? 'var(--surface)' : 'transparent',
                color: projection === '2D' ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
              onClick={() => setProjection('2D')}
              title="Tactical 2D: standard top-down monitoring view with terrain hillshading"
            >
              2D Tactical
            </button>
            <button
              type="button"
              className={`btn-ghost ${projection === '2.5D' ? 'active' : ''}`}
              style={{
                height: 26,
                padding: '0 8px',
                fontSize: 11,
                fontWeight: projection === '2.5D' ? 700 : 500,
                border: 'none',
                background: projection === '2.5D' ? 'var(--surface)' : 'transparent',
                color: projection === '2.5D' ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
              onClick={() => setProjection('2.5D')}
              title="2.5D Terrain: subtle perspective with vertical altitude drop-lines"
            >
              2.5D Terrain
            </button>
          </div>
        </div>

        {/* Right: Map Actions Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {/* Fit All */}
          <button
            type="button"
            className="btn-ghost"
            style={{ height: 32, padding: '0 10px', fontSize: 12, gap: 5 }}
            onClick={fitAll}
            title="Fit All: reset view to show all active tracks and exercise zone"
          >
            <Maximize2 size={13} />
            <span>Fit All</span>
          </button>

          {/* Center Selected */}
          <button
            type="button"
            className="btn-ghost"
            style={{ height: 32, padding: '0 10px', fontSize: 12, gap: 5 }}
            onClick={() => {
              setFollowSelected(true);
              centerSelected(1.85);
            }}
            disabled={!selected}
            title={selected ? `Center & track Drone ${selected}` : 'Select a drone to center'}
          >
            <Crosshair size={13} />
            <span>Center Selected</span>
          </button>

          {/* Zoom Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              type="button"
              className="btn-ghost"
              style={{ height: 32, width: 32, padding: 0 }}
              onClick={() => zoom(1.2)}
              title="Zoom in"
            >
              <ZoomIn size={14} />
            </button>
            <button
              type="button"
              className="btn-ghost"
              style={{ height: 32, width: 32, padding: 0 }}
              onClick={() => zoom(0.8)}
              title="Zoom out"
            >
              <ZoomOut size={14} />
            </button>
          </div>

          {/* Layer visibility toggle menu */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className={`btn-ghost ${layersOpen ? 'active' : ''}`}
              style={{ height: 32, padding: '0 10px', fontSize: 12, gap: 5 }}
              onClick={() => setLayersOpen(!layersOpen)}
              title="Toggle map layers and annotations"
            >
              <Layers size={13} />
              <span>Layers</span>
              <span style={{ fontSize: 9 }}>{layersOpen ? '▲' : '▼'}</span>
            </button>

            {layersOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 6,
                  width: 200,
                  background: 'var(--surface)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: 'var(--shadow-md)',
                  zIndex: 40,
                  padding: '8px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                }}
              >
                {[
                  { label: 'Past Trails', val: showTrails, set: setShowTrails },
                  { label: 'Future Predictions', val: showPrediction, set: setShowPrediction },
                  { label: 'Callsign Labels', val: showLabels, set: setShowLabels },
                  { label: 'Restricted Area', val: showZone, set: setShowZone },
                  { label: 'Coordinate Grid', val: showGrid, set: setShowGrid },
                  { label: 'Terrain Contours', val: showContours, set: setShowContours },
                ].map((item) => (
                  <label
                    key={item.label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 6px',
                      fontSize: 12,
                      cursor: 'pointer',
                      borderRadius: 4,
                      color: 'var(--text-primary)',
                    }}
                  >
                    <span>{item.label}</span>
                    <input
                      type="checkbox"
                      checked={item.val}
                      onChange={(e) => item.set(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SVG Canvas Map Surface Container */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          borderBottomLeftRadius: 'var(--radius-md)',
          borderBottomRightRadius: 'var(--radius-md)',
          background: isLight ? '#FAF9F5' : '#141413',
          height: 'clamp(460px, calc(100vh - 240px), 620px)',
          width: '100%',
          perspective: projection === '2.5D' ? 1100 : 'none',
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`${vbMinX} ${vbMinY} ${vbWidth} ${vbHeight}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Live Drone Monitoring Map"
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            cursor: drag ? 'grabbing' : 'crosshair',
            touchAction: 'none',
            transform: projection === '2.5D' ? 'rotateX(12deg)' : 'none',
            transformOrigin: '50% 50%',
            transition: 'transform 0.35s ease-out',
          }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={fitAll}
        >
          <defs>
            {/* Zone Alpha Radial Glow */}
            <radialGradient id="zoneAlphaGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={isLight ? '#B32626' : '#C64545'} stopOpacity={isLight ? '0.14' : '0.22'} />
              <stop offset="65%" stopColor={isLight ? '#B32626' : '#C64545'} stopOpacity={isLight ? '0.06' : '0.10'} />
              <stop offset="100%" stopColor={isLight ? '#B32626' : '#C64545'} stopOpacity="0.01" />
            </radialGradient>

            {/* Tactical Minor Grid (Dots / Subtle Intersections) */}
            <pattern id="tacticalMinorGrid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke={isLight ? '#EAE3D9' : '#1C1A17'} strokeWidth="0.6" />
              <circle cx="50" cy="50" r="1" fill={isLight ? '#DDD4C7' : '#282521'} />
            </pattern>

            {/* Tactical Major Grid (200m Coordinate Spacing) */}
            <pattern id="tacticalMajorGrid" width="200" height="200" patternUnits="userSpaceOnUse">
              <rect width="200" height="200" fill="url(#tacticalMinorGrid)" />
              <path d="M 200 0 L 0 0 0 200" fill="none" stroke={isLight ? '#DDD4C7' : '#26231F'} strokeWidth="1" />
              {/* Precision Crosshairs at major intersections */}
              <path d="M 195 200 L 205 200 M 200 195 L 200 205" stroke={isLight ? '#C5BCB0' : '#3A3630'} strokeWidth="1.2" />
            </pattern>

            {/* Drone Selection Target Halo Glow */}
            <radialGradient id="selDroneGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={isLight ? '#CC785C' : '#CC785C'} stopOpacity="0.25" />
              <stop offset="70%" stopColor={isLight ? '#CC785C' : '#CC785C'} stopOpacity="0.08" />
              <stop offset="100%" stopColor={isLight ? '#CC785C' : '#CC785C'} stopOpacity="0.0" />
            </radialGradient>
          </defs>

          {/* Pan & Zoom Transform Group */}
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {/* Base Canvas Floor extending across landscape field */}
            <rect x="-3000" y="-3000" width="7000" height="7000" fill={isLight ? '#FAF9F5' : '#141413'} />

            {/* Synthetic GIS Terrain Relief Layer with Hillshading & Landforms */}
            {showContours && (
              <g id="gis-terrain-relief">
                {/* 1. Lowland Valley Floor Base Fill */}
                <rect x="-500" y="-500" width="2000" height="1800" fill={isLight ? '#EFECE5' : '#14181B'} />

                {/* 2. Foothill Forest & Vegetation Zones (Muted Organic Tints) */}
                <g id="vegetation-woodlands" opacity={isLight ? 0.6 : 0.35}>
                  {/* Northwest Pine Grove */}
                  <path
                    d="M 110,130 Q 180,110 240,150 T 260,240 T 170,270 T 90,210 Z"
                    fill={isLight ? '#D5DDD2' : '#17241E'}
                  />
                  {/* East Woods Reserve */}
                  <path
                    d="M 670,170 Q 770,150 840,210 T 820,310 T 710,330 T 640,250 Z"
                    fill={isLight ? '#D5DDD2' : '#17241E'}
                  />
                  {/* South Ridge Woods */}
                  <path
                    d="M 280,450 Q 360,420 410,470 T 390,560 T 300,570 T 250,510 Z"
                    fill={isLight ? '#D5DDD2' : '#17241E'}
                  />
                </g>

                {/* 3. Fictional Mountain Ranges & Highland Masses with Directional Shading */}
                {/* Northwest Highlands: Kestrel Ridge (Elev ~380m) */}
                <g id="range-kestrel">
                  {/* Base Highland Mass */}
                  <path
                    d="M 40,30 Q 180,20 320,80 T 370,190 T 250,250 T 80,210 Z"
                    fill={isLight ? '#E3DDD0' : '#1A2228'}
                  />
                  {/* Southeast Slope Shading (Sun azimuth 315 NW -> Shadow on SE) */}
                  <path
                    d="M 90,75 Q 210,65 315,115 T 370,190 T 250,250 T 80,210 Z"
                    fill={isLight ? '#000000' : '#000000'}
                    opacity={isLight ? 0.05 : 0.22}
                  />
                  {/* Northwest Slope Illumination */}
                  <path
                    d="M 40,30 Q 180,20 320,80 T 315,115 T 210,65 T 90,75 Z"
                    fill="#FFFFFF"
                    opacity={isLight ? 0.18 : 0.05}
                  />
                  {/* Ridge Crest Line */}
                  <path
                    d="M 60,65 Q 190,45 315,115 T 330,175"
                    fill="none"
                    stroke={isLight ? '#C5BCAC' : '#2A3842'}
                    strokeWidth="1.2"
                  />
                  <text x="210" y="55" fontSize="10" fontFamily="monospace" fontWeight="600" fill={isLight ? '#8E8576' : '#5E6F7A'}>
                    KESTREL RIDGE 380m
                  </text>
                </g>

                {/* Northeast Highlands: Blackwood Crest (Elev ~350m) */}
                <g id="range-blackwood">
                  {/* Base Highland Mass */}
                  <path
                    d="M 630,40 Q 790,30 940,90 T 970,230 T 840,270 T 650,200 Z"
                    fill={isLight ? '#E3DDD0' : '#1A2228'}
                  />
                  {/* Southeast Slope Shading */}
                  <path
                    d="M 660,70 Q 800,60 920,115 T 970,230 T 840,270 T 650,200 Z"
                    fill="#000000"
                    opacity={isLight ? 0.05 : 0.22}
                  />
                  {/* Northwest Slope Illumination */}
                  <path
                    d="M 630,40 Q 790,30 940,90 T 920,115 T 800,60 T 660,70 Z"
                    fill="#FFFFFF"
                    opacity={isLight ? 0.18 : 0.05}
                  />
                  {/* Ridge Crest Line */}
                  <path
                    d="M 645,60 Q 795,50 920,115 T 935,195"
                    fill="none"
                    stroke={isLight ? '#C5BCAC' : '#2A3842'}
                    strokeWidth="1.2"
                  />
                  <text x="760" y="52" fontSize="10" fontFamily="monospace" fontWeight="600" fill={isLight ? '#8E8576' : '#5E6F7A'}>
                    BLACKWOOD CREST 350m
                  </text>
                </g>

                {/* Southwest Highlands: Eagle Hill (Elev ~290m) */}
                <g id="range-eagle">
                  {/* Base Mass */}
                  <path
                    d="M 60,400 Q 180,380 270,450 T 260,570 T 140,590 T 50,510 Z"
                    fill={isLight ? '#E3DDD0' : '#1A2228'}
                  />
                  {/* Southeast Slope Shading */}
                  <path
                    d="M 80,430 Q 190,410 255,470 T 260,570 T 140,590 T 50,510 Z"
                    fill="#000000"
                    opacity={isLight ? 0.05 : 0.22}
                  />
                  {/* Northwest Slope Illumination */}
                  <path
                    d="M 60,400 Q 180,380 270,450 T 255,470 T 190,410 T 80,430 Z"
                    fill="#FFFFFF"
                    opacity={isLight ? 0.18 : 0.05}
                  />
                  {/* Ridge Crest */}
                  <path
                    d="M 70,420 Q 185,400 255,470"
                    fill="none"
                    stroke={isLight ? '#C5BCAC' : '#2A3842'}
                    strokeWidth="1.2"
                  />
                  <text x="135" y="425" fontSize="10" fontFamily="monospace" fontWeight="600" fill={isLight ? '#8E8576' : '#5E6F7A'}>
                    EAGLE HILL 290m
                  </text>
                </g>

                {/* Southeast Highlands: Ironwood Escarpment (Elev ~310m) */}
                <g id="range-ironwood">
                  {/* Base Mass */}
                  <path
                    d="M 710,390 Q 850,370 950,440 T 960,570 T 810,590 T 680,510 Z"
                    fill={isLight ? '#E3DDD0' : '#1A2228'}
                  />
                  {/* Southeast Slope Shading */}
                  <path
                    d="M 735,415 Q 860,395 935,460 T 960,570 T 810,590 T 680,510 Z"
                    fill="#000000"
                    opacity={isLight ? 0.05 : 0.22}
                  />
                  {/* Northwest Slope Illumination */}
                  <path
                    d="M 710,390 Q 850,370 950,440 T 935,460 T 860,395 T 735,415 Z"
                    fill="#FFFFFF"
                    opacity={isLight ? 0.18 : 0.05}
                  />
                  {/* Ridge Crest */}
                  <path
                    d="M 725,405 Q 855,385 935,460"
                    fill="none"
                    stroke={isLight ? '#C5BCAC' : '#2A3842'}
                    strokeWidth="1.2"
                  />
                  <text x="780" y="405" fontSize="10" fontFamily="monospace" fontWeight="600" fill={isLight ? '#8E8576' : '#5E6F7A'}>
                    IRONWOOD ESCARPMENT 310m
                  </text>
                </g>

                {/* 4. Topographic Contour Elevation Rings (Crisp Aeronautical GIS Styling) */}
                <g id="contour-lines" opacity={isLight ? 0.65 : 0.4}>
                  {/* 100m Contour Loop (Valley Rim) */}
                  <path
                    d="M 280,180 Q 420,130 580,170 T 720,280 T 620,440 T 360,450 T 260,310 Z"
                    fill="none"
                    stroke={isLight ? '#D7CEBE' : '#232E35'}
                    strokeWidth="1"
                    strokeDasharray="4 2"
                  />
                  <text x="440" y="155" fontSize="9" fontFamily="monospace" fill={isLight ? '#9E9484' : '#4E5E69'}>100m</text>

                  {/* 150m Contour Loop */}
                  <path
                    d="M 240,150 Q 400,100 620,140 T 760,250 T 660,480 T 320,490 T 220,280 Z"
                    fill="none"
                    stroke={isLight ? '#D2C8B8' : '#28363F'}
                    strokeWidth="1"
                  />
                  <text x="490" y="125" fontSize="9" fontFamily="monospace" fill={isLight ? '#9E9484' : '#4E5E69'}>150m</text>

                  {/* 200m Contour Loop */}
                  <path
                    d="M 180,120 Q 380,70 660,110 T 820,220 T 710,520 T 270,530 T 160,250 Z"
                    fill="none"
                    stroke={isLight ? '#CCC1B0' : '#2F3F4A'}
                    strokeWidth="1.2"
                  />
                  <text x="530" y="95" fontSize="9" fontFamily="monospace" fill={isLight ? '#9E9484' : '#4E5E69'}>200m</text>

                  {/* 250m Contour Loop */}
                  <path
                    d="M 120,90 Q 360,40 700,80 T 870,190 T 760,560 T 220,570 T 110,220 Z"
                    fill="none"
                    stroke={isLight ? '#C5B9A6' : '#364955'}
                    strokeWidth="1"
                    strokeDasharray="5 3"
                  />
                  <text x="580" y="70" fontSize="9" fontFamily="monospace" fill={isLight ? '#9E9484' : '#4E5E69'}>250m</text>
                </g>

                {/* 5. Natural Waterways: River Bravo & Lake Echo Reservoir */}
                <g id="waterways">
                  {/* Lake Echo (Sector Charlie Water Body) */}
                  <path
                    d="M 160,320 C 220,310 250,335 240,375 C 230,405 180,425 140,395 C 115,375 130,330 160,320 Z"
                    fill={isLight ? '#DCE7EE' : '#14222E'}
                    stroke={isLight ? '#BDD1DE' : '#1D3040'}
                    strokeWidth="1.5"
                  />
                  <text x="180" y="370" textAnchor="middle" fontSize="9" fontFamily="monospace" fill={isLight ? '#7A91A0' : '#3E5669'}>
                    LAKE ECHO
                  </text>

                  {/* River Bravo Sand / Wetland Shore Buffer */}
                  <path
                    d="M 430,-500 Q 405,120 440,240 T 415,360 T 445,490 T 420,620 T 435,1500"
                    fill="none"
                    stroke={isLight ? '#E5DED1' : '#1A2329'}
                    strokeWidth="28"
                    strokeLinecap="round"
                  />
                  {/* River Bravo Main Water Channel */}
                  <path
                    d="M 430,-500 Q 405,120 440,240 T 415,360 T 445,490 T 420,620 T 435,1500"
                    fill="none"
                    stroke={isLight ? '#C8D9E6' : '#152432'}
                    strokeWidth="16"
                    strokeLinecap="round"
                  />
                  {/* River Bravo Label */}
                  <text x="450" y="220" fontSize="9" fontFamily="monospace" fontWeight="600" fill={isLight ? '#6A879A' : '#395368'}>
                    RIVER BRAVO
                  </text>

                  {/* East Tributary Creek */}
                  <path
                    d="M 760,110 Q 640,150 540,210 T 430,245"
                    fill="none"
                    stroke={isLight ? '#C8D9E6' : '#152432'}
                    strokeWidth="4"
                    strokeLinecap="round"
                    opacity={isLight ? 0.8 : 0.6}
                  />
                </g>

                {/* 6. Soft Transportation Roads & Strategic Crossing */}
                <g id="transportation-network">
                  {/* Sector Route 10 Arterial Road Casing */}
                  <path
                    d="M -500,310 L 400,305 L 450,305 L 1500,295"
                    fill="none"
                    stroke={isLight ? '#E5DDD0' : '#1F2428'}
                    strokeWidth="4"
                  />
                  {/* Route 10 Surface */}
                  <path
                    d="M -500,310 L 400,305 L 450,305 L 1500,295"
                    fill="none"
                    stroke={isLight ? '#CDC3B2' : '#2D353C'}
                    strokeWidth="2"
                  />
                  {/* Bridge over River Bravo */}
                  <rect
                    x="410"
                    y="298"
                    width="26"
                    height="14"
                    rx="2"
                    fill={isLight ? '#B5AB9B' : '#3D4750'}
                    stroke={isLight ? '#FAF9F5' : '#141413'}
                    strokeWidth="1"
                  />
                  <text x="320" y="300" fontSize="9" fontFamily="monospace" fill={isLight ? '#8E8576' : '#5E6F7A'}>
                    ROUTE 10
                  </text>

                  {/* Secondary Ridge Patrol Trail */}
                  <path
                    d="M 80,180 Q 200,220 310,260 T 410,305 T 520,350 T 680,380 T 860,390"
                    fill="none"
                    stroke={isLight ? '#DDD4C5' : '#272E34'}
                    strokeWidth="1.2"
                    strokeDasharray="4 3"
                  />
                </g>
              </g>
            )}

            {/* Tactical Grid & Operating Sectors Overlay */}
            {showGrid && (
              <g id="map-grid-layer">
                <rect x="-3000" y="-3000" width="7000" height="7000" fill="url(#tacticalMajorGrid)" />

                {/* Major Axis Lines */}
                <line x1="500" y1="-3000" x2="500" y2="4000" stroke={isLight ? '#D5CCC0' : '#262D33'} strokeWidth="1" strokeDasharray="4 4" />
                <line x1="-3000" y1="300" x2="4000" y2="300" stroke={isLight ? '#D5CCC0' : '#262D33'} strokeWidth="1" strokeDasharray="4 4" />

                {/* Tactical Radar Range Rings centered on Exercise Zone center (500, 300) */}
                <circle cx={ZONE_INFO.cx} cy={ZONE_INFO.cy} r="200" fill="none" stroke={isLight ? '#D8D0C2' : '#242D33'} strokeWidth="1" strokeDasharray="4 4" />
                <circle cx={ZONE_INFO.cx} cy={ZONE_INFO.cy} r="400" fill="none" stroke={isLight ? '#D8D0C2' : '#242D33'} strokeWidth="1" strokeDasharray="6 6" />

                {/* Range ring readouts */}
                <text x={ZONE_INFO.cx + 6} y={ZONE_INFO.cy - 204} fill={isLight ? '#948D80' : '#55636D'} fontSize="10" fontFamily="monospace">RANGE 200m</text>
                <text x={ZONE_INFO.cx + 6} y={ZONE_INFO.cy - 404} fill={isLight ? '#948D80' : '#55636D'} fontSize="10" fontFamily="monospace">RANGE 400m</text>

                {/* Operating Sector Demarcations (Fictional Sectors) */}
                <text x="210" y="190" fill={isLight ? '#8E8678' : '#55646E'} fontSize="13" fontFamily="monospace" fontWeight="700" letterSpacing="2px">
                  SECTOR ALPHA (NW)
                </text>
                <text x="730" y="190" fill={isLight ? '#8E8678' : '#55646E'} fontSize="13" fontFamily="monospace" fontWeight="700" letterSpacing="2px">
                  SECTOR BRAVO (NE)
                </text>
                <text x="210" y="490" fill={isLight ? '#8E8678' : '#55646E'} fontSize="13" fontFamily="monospace" fontWeight="700" letterSpacing="2px">
                  SECTOR CHARLIE (SW)
                </text>
                <text x="730" y="490" fill={isLight ? '#8E8678' : '#55646E'} fontSize="13" fontFamily="monospace" fontWeight="700" letterSpacing="2px">
                  SECTOR DELTA (SE)
                </text>
              </g>
            )}

            {/* Exercise Zone Alpha (Restrained Boundaries: Red Perimeter & Amber Review Ring) */}
            {showZone && (
              <g id="zone-alpha">
                {/* Zone Inner Subtle Caution Tint */}
                <circle cx={ZONE_INFO.cx} cy={ZONE_INFO.cy} r={ZONE_INFO.r} fill="url(#zoneAlphaGrad)" />

                {/* Outer Review Boundary (Muted Amber Dashed Ring R=230m: 170 + 60m buffer) */}
                <circle
                  cx={ZONE_INFO.cx}
                  cy={ZONE_INFO.cy}
                  r={ZONE_INFO.r + 60}
                  fill="none"
                  stroke={isLight ? '#986400' : '#D4A017'}
                  strokeWidth="1.4"
                  strokeDasharray="5 4"
                />

                {/* Inner Restricted Perimeter (Restrained Red Dashed Ring R=170m) */}
                <circle
                  cx={ZONE_INFO.cx}
                  cy={ZONE_INFO.cy}
                  r={ZONE_INFO.r}
                  fill="none"
                  stroke={isLight ? '#B32626' : '#C64545'}
                  strokeWidth="1.8"
                  strokeDasharray="6 4"
                />

                {/* Zone Alpha Labels */}
                <text
                  x={ZONE_INFO.cx}
                  y={ZONE_INFO.cy - 8}
                  textAnchor="middle"
                  fontSize="13"
                  fontFamily="monospace"
                  fontWeight="700"
                  fill={isLight ? '#B32626' : '#C64545'}
                  letterSpacing="1px"
                >
                  EXERCISE ZONE ALPHA
                </text>
                <text
                  x={ZONE_INFO.cx}
                  y={ZONE_INFO.cy + 12}
                  textAnchor="middle"
                  fontSize="11"
                  fontFamily="monospace"
                  fontWeight="500"
                  fill={isLight ? '#7C7870' : '#8E9A9E'}
                >
                  RESTRICTED R=170m · REVIEW BUFFER 60m
                </text>
              </g>
            )}

            {/* Historical Flight Trails: Thinner, Cleaner, Gently Faded */}
            {showTrails && (
              <g id="flight-trails">
                {tracks.map((t) => {
                  if (!t.history || t.history.length < 2) return null;
                  const pts = t.history.map((p) => `${p.x},${p.y}`).join(' ');
                  const col = getTrackColor(t);
                  const isSel = selected === t.id;

                  return (
                    <g key={`trail-grp-${t.id}`}>
                      {/* Trail Line */}
                      <polyline
                        points={pts}
                        fill="none"
                        stroke={col}
                        strokeWidth={isSel ? 1.8 : 1.1}
                        strokeOpacity={isSel ? 0.85 : 0.45}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* Faint Waypoint Dots for Selected Drone */}
                      {isSel &&
                        t.history.map((p, pIdx) => (
                          <circle
                            key={`pt-${t.id}-${pIdx}`}
                            cx={p.x}
                            cy={p.y}
                            r="1.5"
                            fill={col}
                            opacity="0.6"
                          />
                        ))}
                    </g>
                  );
                })}
              </g>
            )}

            {/* Future Kinematic Predictions: Distinct Dashed Ghost Line */}
            {showPrediction && (
              <g id="future-predictions">
                {tracks.map((t) => {
                  // Only plot forward prediction if telemetry is reliable
                  if (!t.prediction || t.prediction.length < 1 || t.quality === 'STALE' || t.quality === 'INCONSISTENT') {
                    return null;
                  }
                  const cur = replayPos?.[t.id] ? replayPos[t.id] : { x: t.displayX, y: t.displayY };
                  const pts = [`${cur.x},${cur.y}`, ...t.prediction.map((p) => `${p.x},${p.y}`)].join(' ');
                  const col = getTrackColor(t);
                  const lastPt = t.prediction[t.prediction.length - 1];

                  return (
                    <g key={`pred-grp-${t.id}`}>
                      <polyline
                        points={pts}
                        fill="none"
                        stroke={col}
                        strokeWidth={1.3}
                        strokeDasharray="3 3"
                        strokeOpacity={0.7}
                        strokeLinecap="round"
                      />
                      {/* Leading Estimated Waypoint Circle with 'EST' Tag */}
                      <circle
                        cx={lastPt.x}
                        cy={lastPt.y}
                        r="2.5"
                        fill="none"
                        stroke={col}
                        strokeWidth="1.2"
                      />
                    </g>
                  );
                })}
              </g>
            )}

            {/* 2.5D Altitude Stems & Ground Projections */}
            {projection === '2.5D' && (
              <g id="altitude-stems">
                {tracks.map((t) => {
                  if (!t.hasObservation && !replayPos?.[t.id]) return null;
                  const pos = replayPos?.[t.id] ? replayPos[t.id] : { x: t.displayX, y: t.displayY };
                  const alt = t.altitudeM || 100;
                  const altOffset = Math.min(65, Math.max(18, alt / 4.5));
                  const col = getTrackColor(t);
                  const isSel = selected === t.id;

                  return (
                    <g key={`stem-${t.id}`}>
                      {/* Ground Shadow Ellipse */}
                      <ellipse
                        cx={pos.x}
                        cy={pos.y}
                        rx={isSel ? 7 : 5}
                        ry={isSel ? 3.5 : 2.5}
                        fill="rgba(0, 0, 0, 0.35)"
                      />
                      {/* Vertical Drop-line from Ground to Drone */}
                      <line
                        x1={pos.x}
                        y1={pos.y}
                        x2={pos.x}
                        y2={pos.y - altOffset}
                        stroke={isSel ? 'var(--accent)' : col}
                        strokeWidth={isSel ? 1.4 : 0.9}
                        strokeDasharray="2 2"
                        strokeOpacity={isSel ? 0.9 : 0.55}
                      />
                      {/* Altitude Tag on Drop-line */}
                      {isSel && (
                        <text
                          x={pos.x + 5}
                          y={pos.y - altOffset / 2}
                          fontSize="9"
                          fontFamily="monospace"
                          fontWeight="700"
                          fill="var(--accent)"
                        >
                          {Math.round(alt)}m
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            )}

            {/* Redesigned Precision Tactical UAV / Drone Markers */}
            <g id="drone-markers">
              {tracks.map((t) => {
                if (!t.hasObservation && !replayPos?.[t.id]) return null;
                const groundPos = replayPos?.[t.id] ? replayPos[t.id] : { x: t.displayX, y: t.displayY };
                const alt = t.altitudeM || 100;
                const altOffset = projection === '2.5D' ? Math.min(65, Math.max(18, alt / 4.5)) : 0;
                const markerY = groundPos.y - altOffset;

                const col = getTrackColor(t);
                const isSel = selected === t.id;
                const heading = t.headingDeg || 0;
                const isStale = t.quality === 'STALE' || !t.hasObservation;

                return (
                  <g
                    key={`marker-${t.id}`}
                    transform={`translate(${groundPos.x}, ${markerY})`}
                    onClick={() => {
                      onSelect(t.id);
                      setFollowSelected(true);
                    }}
                    onMouseEnter={() => setHoveredTrack(t.id)}
                    onMouseLeave={() => setHoveredTrack(null)}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Selected State: Thin Circular Focus Ring & Directional Heading Ray */}
                    {isSel && (
                      <g id={`sel-ring-${t.id}`}>
                        {/* Thin circular focus ring with subtle pulse */}
                        <circle
                          r="18"
                          fill="none"
                          stroke="var(--accent)"
                          strokeWidth="1.5"
                          style={{
                            animation: 'focusPulse 2s infinite ease-in-out',
                          }}
                        />

                        {/* Heading vector ray projecting along flight vector */}
                        <g transform={`rotate(${heading})`}>
                          <line
                            x1="0"
                            y1="-14"
                            x2="0"
                            y2="-30"
                            stroke="var(--accent)"
                            strokeWidth="1.3"
                            strokeDasharray="3 2"
                          />
                        </g>
                      </g>
                    )}

                    {/* Stale / No-Recent-Data Ghost Radar Ring */}
                    {isStale && (
                      <circle
                        r="14"
                        fill="none"
                        stroke={isLight ? '#8E8B82' : '#6C6A64'}
                        strokeWidth="1.2"
                        strokeDasharray="2 2"
                        opacity="0.8"
                      />
                    )}

                    {/* Inside-Zone Hazard Warning Halo */}
                    {t.inZone && (
                      <circle
                        r="18"
                        fill="none"
                        stroke={isLight ? '#B32626' : '#C64545'}
                        strokeWidth="1.8"
                        strokeDasharray="4 3"
                        opacity="0.9"
                      />
                    )}

                    {/* Authentic Tactical UAV Airframe Silhouette */}
                    <g transform={`rotate(${heading})`}>
                      {/* Swept UAV Wings and Airframe Body */}
                      <path
                        d="M 0,-14
                           L 2.5,-6
                           L 14,2
                           L 14,5
                           L 3,3.5
                           L 2.5,9
                           L 7,13
                           L 5.5,14
                           L 0,11.5
                           L -5.5,14
                           L -7,13
                           L -2.5,9
                           L -3,3.5
                           L -14,5
                           L -14,2
                           L -2.5,-6
                           Z"
                        fill={isStale ? (isLight ? 'rgba(142,139,130,0.5)' : 'rgba(108,106,100,0.5)') : col}
                        stroke={isStale ? (isLight ? '#8E8B82' : '#6C6A64') : (isLight ? '#FFFFFF' : '#141413')}
                        strokeWidth="1.3"
                        strokeDasharray={isStale ? '2 2' : 'none'}
                        strokeLinejoin="round"
                      />

                      {/* Center Fuselage Targeting Core Dot */}
                      <circle cx="0" cy="0" r="1.8" fill={isLight ? '#FFFFFF' : '#141413'} />
                    </g>

                    {/* Callsign and Status Tag */}
                    {showLabels && (
                      <g transform="translate(16, -8)">
                        {/* Label Pill Box */}
                        <rect
                          x="-2"
                          y="-10"
                          width={isSel ? 74 : 36}
                          height={isSel ? 18 : 17}
                          rx="3"
                          fill={isLight ? 'rgba(255,255,255,0.94)' : 'rgba(24,23,21,0.94)'}
                          stroke={isSel ? (isLight ? '#CC785C' : '#CC785C') : isLight ? '#DDD4C7' : '#383530'}
                          strokeWidth={isSel ? '1.5' : '1'}
                        />

                        {/* Callsign & Altitude / Speed (Expanded if Selected) */}
                        <text
                          x={isSel ? 35 : 16}
                          y="3"
                          textAnchor="middle"
                          fontSize="11"
                          fontFamily="monospace"
                          fontWeight={isSel ? 800 : 700}
                          fill={isSel ? (isLight ? '#CC785C' : '#FAF9F5') : isLight ? '#141413' : '#FAF9F5'}
                        >
                          {isSel ? `${t.id} ${Math.round(alt)}m` : t.id}
                        </text>

                        {/* Stale / Last Known Position Banner */}
                        {isStale && !isSel && (
                          <text
                            x="16"
                            y="14"
                            textAnchor="middle"
                            fontSize="8"
                            fontFamily="monospace"
                            fontWeight="600"
                            fill={isLight ? '#8E8B82' : '#A09D96'}
                          >
                            STALE
                          </text>
                        )}
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          </g>
        </svg>

        {/* Top-Left: Tactical North & Grid Scale Indicator */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              padding: '4px 8px',
              background: isLight ? 'rgba(255,255,255,0.92)' : 'rgba(24,23,21,0.92)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-xs)',
              fontSize: 11,
              fontFamily: 'monospace',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <Compass size={13} style={{ color: 'var(--accent)' }} />
            <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>GRID NORTH</span>
            <span>· 1000m² Ops Grid</span>
          </div>
        </div>

        {/* Top-Right: Smart Follow Track Status Chip */}
        {selectedTrackObj && (
          <div
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              background: isLight ? 'rgba(255,255,255,0.96)' : 'rgba(24,23,21,0.96)',
              border: '1px solid var(--border-focus)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: 'var(--shadow-md)',
              fontSize: 12,
              fontFamily: 'monospace',
              color: 'var(--text-primary)',
              zIndex: 30,
            }}
          >
            <Crosshair size={13} style={{ color: 'var(--accent)' }} />

            {/* Contextual Follow Status: Following / Stale / Location Unavailable / Panned */}
            {!selectedTrackObj.hasObservation && !replayPos?.[selectedTrackObj.id] ? (
              <span style={{ color: 'var(--text-muted)' }}>
                Location unavailable for <strong>{selectedTrackObj.id}</strong>
              </span>
            ) : selectedTrackObj.quality === 'STALE' ? (
              <span>
                <span style={{ color: 'var(--warning)', fontWeight: 600 }}>Current position unavailable</span> · <strong>{selectedTrackObj.id}</strong>
              </span>
            ) : followSelected ? (
              <span>
                <strong>Following {selectedTrackObj.id}</strong>
              </span>
            ) : (
              <span>
                Focused: <strong>{selectedTrackObj.id}</strong>{' '}
                <span style={{ color: 'var(--text-muted)' }}>(Panned)</span>
              </span>
            )}

            {/* Follow Track Action Button */}
            {followSelected ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setFollowSelected(false)}
                style={{
                  height: 24,
                  padding: '0 8px',
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                }}
                title="Stop camera follow"
              >
                Stop Following
              </button>
            ) : (
              selectedTrackObj.hasObservation &&
              selectedTrackObj.quality !== 'STALE' && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setFollowSelected(true);
                    centerSelected(1.85);
                  }}
                  style={{
                    height: 24,
                    padding: '0 8px',
                    fontSize: 11,
                    color: 'var(--accent)',
                    borderColor: 'var(--accent)',
                  }}
                  title="Resume following drone updates"
                >
                  Follow Track
                </button>
              )
            )}

            {/* Exit Focus Button */}
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setFollowSelected(false);
                if (onClearSelection) onClearSelection();
                if (onExitFocus) onExitFocus();
              }}
              style={{
                height: 24,
                width: 24,
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Deselect and clear focus"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Bottom-Right: Tactical Scale Bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 2,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              padding: '3px 8px',
              background: isLight ? 'rgba(255,255,255,0.85)' : 'rgba(24,23,21,0.85)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-xs)',
              fontSize: 10,
              fontFamily: 'monospace',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>Scale: 100m</span>
            <div
              style={{
                width: 40 * view.k,
                height: 3,
                background: 'var(--text-secondary)',
                borderRadius: 1,
              }}
            />
          </div>
        </div>

        {/* Hover Tooltip */}
        {hoveredTrackObj && hoveredStatus && tooltipPos && (
          <div
            className="map-tooltip"
            style={{
              left: tooltipPos.x,
              top: tooltipPos.y,
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Drone {hoveredTrackObj.id}</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '1px 5px',
                  borderRadius: 4,
                  background: hoveredStatus.badgeBg,
                  color: hoveredStatus.badgeColor,
                  border: `1px solid ${hoveredStatus.badgeBorder}`,
                }}
              >
                {hoveredStatus.badgeText}
              </span>
            </div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Pos: {hoveredStatus.positionText}
            </div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Alt: {hoveredStatus.altitudeText} | Spd: {hoveredStatus.speedText}
            </div>
            <div style={{ fontSize: 11, color: hoveredStatus.reliabilityColor, marginTop: 3 }}>
              Reliability: {hoveredStatus.reliabilityLabel}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
