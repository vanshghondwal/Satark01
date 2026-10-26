import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Engine,
  SCENARIOS,
  fmtSim,
  ZONE_INFO,
  type Scenario,
  type ReviewStatus,
  type Group,
  type TrackView,
  type PipelineTrace,
} from '../lib/engine';
import { MapView, type MapFocusTarget } from '../components/MapView';
import { ThemeSwitcher } from '../components/ThemeSwitcher';
import { AlertInbox, type AlertViewMode } from '../components/AlertInbox';
import { Crosshair } from 'lucide-react';
import { computeRecommendedReviewOrder } from '../lib/priorityIntelligence';
import { CoverageWatchModal } from '../components/CoverageWatchModal';
import { getCoverageWatchSummary, formatRelativeSimTime } from '../lib/coverageWatch';
import { getAlertInboxItem } from '../lib/alertInbox';
import { getTrackDerivedStatus } from '../lib/trackStatus';
import { AlertToastManager } from '../components/AlertToastManager';
import {
  evaluateMl,
  ruleCheck,
  runBenchmark,
  MODEL,
  FEATURE_ORDER,
  type Benchmark,
} from '../lib/ml';
import { DEMO_USER } from './LoginPage';

const PRI_LABEL: Record<string, string> = {
  HIGH_REVIEW: 'IMPORTANT REVIEW',
  MEDIUM_REVIEW: 'CAUTION REVIEW',
  LOW_REVIEW: 'ROUTINE CHECK',
  VERIFY_DATA: 'VERIFY DATA',
};

const PRI_CLASS: Record<string, string> = {
  HIGH_REVIEW: 'badge-high',
  MEDIUM_REVIEW: 'badge-med',
  LOW_REVIEW: 'badge-low',
  VERIFY_DATA: 'badge-low',
};

// Trust Lens human-readable explanations
function getTrustLensExplanation(quality: string): { label: string; text: string; color: string } {
  switch (quality) {
    case 'FRESH':
      return { label: 'Current Data', text: 'Recent and consistent updates received within expected interval.', color: 'var(--cyan)' };
    case 'DEGRADED':
      return { label: 'Delayed Data', text: 'The last telemetry packet arrived late or experienced transmission latency.', color: 'var(--warning)' };
    case 'STALE':
      return { label: 'No Recent Data', text: 'Current position is unknown. Display shows last confirmed observation.', color: 'var(--text-muted)' };
    case 'INCONSISTENT':
      return { label: 'Inconsistent Data', text: 'Latest reported position conflicts with recent kinematic trajectory.', color: 'var(--error)' };
    default:
      return { label: 'Awaiting Data', text: 'Initial transponder contact pending.', color: 'var(--text-muted)' };
  }
}

// Friendly cause formatting distinguishing boundary approach from confirmed entry
export function formatAlertCause(cause: string): { title: string; explanation: string } {
  const norm = cause.toUpperCase();
  if (norm.includes('BOUNDARY') || norm.includes('APPROACH') || norm.includes('NEAR')) {
    return {
      title: 'Approaching Restricted Boundary',
      explanation: 'Simulated drone observed near Exercise Zone Alpha review buffer (within 60m).',
    };
  }
  if (norm.includes('PREDICTED')) {
    return {
      title: 'Predicted Boundary Crossing',
      explanation: 'Short-term trajectory projection intersects Exercise Zone Alpha.',
    };
  }
  if (norm.includes('ZONE') || norm.includes('RESTRICTED') || norm.includes('ENTERED')) {
    return {
      title: 'Restricted Area Alert (Zone Alpha)',
      explanation: 'Simulated drone crossed into Exercise Zone Alpha perimeter.',
    };
  }
  if (norm.includes('DELAY') || norm.includes('LATENCY')) {
    return {
      title: 'Delayed Telemetry Transmission',
      explanation: 'Packets arriving late; position display may lag behind actual flight path.',
    };
  }
  if (norm.includes('MISSING') || norm.includes('GAP')) {
    return {
      title: 'Telemetry Stream Missing Updates',
      explanation: 'Intermittent telemetry loss detected; updates dropped in transmission.',
    };
  }
  if (norm.includes('POSITION') || norm.includes('JUMP') || norm.includes('RESIDUAL') || norm.includes('INCONSISTENCY')) {
    return {
      title: 'Inconsistent Position Jump',
      explanation: 'Reported coordinate differs significantly from extrapolated flight physics.',
    };
  }
  return {
    title: cause.replace(/_/g, ' '),
    explanation: 'Unusual observation flagged by real-time validation checks.',
  };
}

function getTrackDotColor(t: TrackView | { inZone?: boolean; nearZone?: boolean; quality?: string } | undefined): string {
  if (!t) return 'var(--text-muted)';
  if (t.inZone) return 'var(--error)';
  if (t.nearZone || t.quality === 'DEGRADED') return 'var(--warning)';
  if (t.quality === 'INCONSISTENT') return 'var(--error)';
  if (t.quality === 'STALE') return 'var(--text-muted)';
  return 'var(--success)';
}

function DroneAltitudeSparkline({ track }: { track: TrackView | undefined }) {
  if (!track || !track.history || track.history.length === 0) {
    return (
      <div style={{ width: 170, height: 42, background: 'var(--canvas)', borderRadius: 4, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text-muted)' }}>
        No track history
      </div>
    );
  }
  const pts = track.history.slice(-10);
  const alts = pts.map((p) => p.altitudeM ?? track.altitudeM);
  const minA = Math.min(...alts, 50);
  const maxA = Math.max(...alts, 250);
  const rangeA = Math.max(1, maxA - minA);

  const w = 170;
  const h = 42;
  const coords = pts.map((p, idx) => {
    const x = pts.length > 1 ? (idx / (pts.length - 1)) * (w - 16) + 8 : w / 2;
    const y = h - (((p.altitudeM ?? track.altitudeM) - minA) / rangeA) * (h - 16) - 8;
    return { x, y };
  });

  const polylineStr = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  return (
    <svg width={w} height={h} style={{ background: 'var(--canvas)', borderRadius: 4, border: '1px solid var(--border)', display: 'block' }}>
      <line x1="0" y1="14" x2={w} y2="14" stroke="var(--border-subtle)" strokeWidth="0.8" />
      <line x1="0" y1="28" x2={w} y2="28" stroke="var(--border-subtle)" strokeWidth="0.8" />
      <line x1="56" y1="0" x2="56" y2={h} stroke="var(--border-subtle)" strokeWidth="0.8" />
      <line x1="114" y1="0" x2="114" y2={h} stroke="var(--border-subtle)" strokeWidth="0.8" />
      <polyline points={polylineStr} fill="none" stroke="var(--error)" strokeWidth="1.8" strokeDasharray="3 3" />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r="2.2" fill="var(--error)" />
      ))}
    </svg>
  );
}

export function CommandCenterPage({ onLogout }: { onLogout: () => void }) {
  const engineRef = useRef<Engine | null>(null);
  if (!engineRef.current) engineRef.current = new Engine(42, 'CLEAN');
  const engine = engineRef.current;

  const [, setRender] = useState(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [scenario, setScenario] = useState<Scenario>('CLEAN');
  const [seed, setSeed] = useState(42);
  const [trackCount, setTrackCount] = useState(8);

  const [selected, setSelected] = useState<string | null>('T-01');
  const [query, setQuery] = useState('');
  const [qualityFilter, setQualityFilter] = useState<string>('ALL');
  const [tab, setTab] = useState<'RECOMMENDED' | 'SECURITY_ADVISORY' | 'DATA_QUALITY'>('RECOMMENDED');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Drawers & Modals
  const [drawerGroup, setDrawerGroup] = useState<Group | null>(null);
  const [drawerTrack, setDrawerTrack] = useState<string | null>(null);
  const [proofOpen, setProofOpen] = useState(false);
  const [proofTab, setProofTab] = useState<'LIVE_INJECTION' | 'SANDBOX'>('LIVE_INJECTION');
  const [liveInjectionTrace, setLiveInjectionTrace] = useState<PipelineTrace | null>(null);
  const [coverageWatchOpen, setCoverageWatchOpen] = useState(false);

  const [replayOpen, setReplayOpen] = useState(false);
  const [replayIdx, setReplayIdx] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [guidedOpen, setGuidedOpen] = useState(false);
  const [guidedStep, setGuidedStep] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [inboxViewMode, setInboxViewMode] = useState<AlertViewMode>('ORGANIZED');
  const [inboxInspectedGroupId, setInboxInspectedGroupId] = useState<string | null>(null);

  // Smart View on Map Tracking Focus
  const mapContainerRef = useRef<HTMLElement | null>(null);
  const [mapFocusTarget, setMapFocusTarget] = useState<MapFocusTarget | null>(null);

  const handleViewOnMap = useCallback((trackId: string, alertContext?: 'ZONE' | 'DATA') => {
    setSelected(trackId);
    setDrawerTrack(trackId);
    setMapFocusTarget({ trackId, nonce: Date.now(), alertContext });

    // Smoothly scroll to map area if not currently in view
    if (mapContainerRef.current) {
      mapContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    setNotice(`Focused on Drone ${trackId} on tactical map.`);
  }, []);

  // Onboarding banner state
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    return !localStorage.getItem('satark_onboarding_dismissed');
  });
  const [onboardingStep, setOnboardingStep] = useState(0);

  // Map layer controls
  const [showTrails, setShowTrails] = useState(true);
  const [showPrediction, setShowPrediction] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showZone, setShowZone] = useState(true);

  // Notifications & State
  const [notice, setNotice] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [copyMsg, setCopyMsg] = useState('');

  // Test the AI State
  const [proofTrack, setProofTrack] = useState('T-01');
  const [proofFault, setProofFault] = useState<'DELAY' | 'MISSING' | 'POSITION_ERROR' | 'CLEAN' | 'OUT_OF_ORDER' | 'INVALID'>('DELAY');
  const [sandboxFault, setSandboxFault] = useState<'DELAY' | 'MISSING' | 'POSITION_ERROR' | 'NORMAL'>('DELAY');
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);
  const [showAdvancedModel, setShowAdvancedModel] = useState(false);

  // Settings Temp State
  const [tmpSeed, setTmpSeed] = useState(seed);
  const [tmpScenario, setTmpScenario] = useState<Scenario>(scenario);
  const [tmpTrackCount, setTmpTrackCount] = useState(trackCount);

  // Listeners
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    const kd = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setSettingsOpen(false);
        setProofOpen(false);
        setReplayOpen(false);
        setGuidedOpen(false);
        setToolsMenuOpen(false);
        setDrawerGroup(null);
        setDrawerTrack(null);
      }
    };
    window.addEventListener('keydown', kd);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
      window.removeEventListener('keydown', kd);
    };
  }, []);

  // Live simulation tick
  useEffect(() => {
    if (!running || replayOpen) return;
    const id = window.setInterval(() => {
      engine.tick();
      setRender((r) => r + 1);
    }, 1000 / speed);
    return () => window.clearInterval(id);
  }, [running, speed, replayOpen, engine]);

  // Replay tick
  useEffect(() => {
    if (!replayPlaying || !replayOpen) return;
    const id = window.setInterval(
      () => setReplayIdx((i) => Math.min(engine.snapshots.length - 1, i + 1)),
      1000 / speed
    );
    return () => window.clearInterval(id);
  }, [replayPlaying, replayOpen, speed, engine]);

  const views = engine.views();
  const stats = engine.stats();
  const sel = views.find((v) => v.id === selected) || views[0];

  // Live calculated data problems
  const dataProblemsCount = views.filter((v) => v.quality === 'DEGRADED' || v.quality === 'STALE' || v.quality === 'INCONSISTENT').length;
  const coverageSummary = getCoverageWatchSummary(views);

  // Filtered drones
  const filteredTracks = views.filter((v) => {
    const matchId = v.id.toLowerCase().includes(query.toLowerCase());
    let matchQual = true;
    if (qualityFilter === 'NORMAL') matchQual = v.quality === 'FRESH';
    else if (qualityFilter === 'DATA_UNRELIABLE') matchQual = v.quality === 'DEGRADED' || v.quality === 'INCONSISTENT';
    else if (qualityFilter === 'NO_RECENT_DATA') matchQual = v.quality === 'STALE';
    return matchId && matchQual;
  });

  const groups = engine.groups.filter((g) => tab === 'RECOMMENDED' ? true : g.category === tab);

  const doReset = useCallback((sc?: Scenario, sd?: number, tc?: number) => {
    const useTc = tc ?? trackCount;
    engine.trackCount = useTc;
    engine.reset(sd ?? seed, sc ?? scenario);
    setScenario(sc ?? scenario);
    setSeed(sd ?? seed);
    if (tc !== undefined) setTrackCount(tc);
    setDrawerGroup(null);
    setDrawerTrack(null);
    setLiveInjectionTrace(null);
    setRender((r) => r + 1);
    setNotice(`Simulation reset: Seed: ${sd ?? seed}, Scenario: ${sc ?? scenario}. Baseline ready.`);
  }, [engine, trackCount, seed, scenario]);

  const copyJson = async (obj: unknown, label: string) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
      setCopyMsg(`${label} copied to clipboard.`);
    } catch {
      setCopyMsg('Clipboard write unavailable.');
    }
    window.setTimeout(() => setCopyMsg(''), 3000);
  };

  const downloadReport = () => {
    const report = {
      project: 'SATARK',
      title: 'Simulated Drone Monitoring & Verification Audit Report',
      generatedAt: new Date().toISOString(),
      seed,
      scenario,
      simTimeMs: engine.simTimeMs,
      stats: {
        dronesMonitored: stats.tracks,
        importantWarnings: stats.high,
        dataProblems: dataProblemsCount,
        waitingForReview: stats.unresolved,
        totalRawTelemetry: stats.events,
        groupedWarnings: stats.groups,
      },
      drones: engine.views(),
      groupedWarnings: engine.groups,
      recentAlertEvents: engine.events.slice(0, 300),
      mlModelInfo: {
        version: MODEL.version,
        framework: 'Scikit-Learn IsolationForest',
      },
      disclaimer: 'Unofficial simulated training platform. Contains synthetic data only.',
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `satark-evidence-report-seed${seed}-${scenario}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setNotice('Audit report downloaded successfully.');
  };

  // Guided demo steps
  const guidedSteps = [
    {
      title: '1. Watch Drones on the Live Map',
      text: 'Click Start to begin real-time telemetry updates. Each chevron represents an active drone with heading, altitude, and speed.',
      act: () => {
        doReset('ZONE_ENTRY');
        setRunning(true);
      },
    },
    {
      title: '2. Review Important Warnings',
      text: 'When a drone crosses into Restricted Zone Alpha, an Important Review item appears in the Needs Attention panel on the right. Operators can inspect why it was flagged and verify the signal.',
      act: () => {
        const g = engine.groups.find((x) => x.priority === 'HIGH_REVIEW');
        if (g) setDrawerGroup(g);
        else setNotice('Running scenario... warning appears when the drone reaches the perimeter.');
      },
    },
    {
      title: '3. Verify Data Reliability with Trust Lens',
      text: 'Before assuming a drone has gone rogue, check if its telemetry is degraded or delayed. Trust Lens isolates signal anomalies from genuine security threats.',
      act: () => {
        doReset('MISSING_UPDATES');
        setRunning(true);
        setSelected('T-03');
      },
    },
    {
      title: '4. Test the AI',
      text: 'Open Test the AI to inject a synthetic packet delay or coordinate jump. Compare the Scikit-Learn Isolation Forest against deterministic rules side by side.',
      act: () => setProofOpen(true),
    },
    {
      title: '5. See alerts get organized',
      text: 'Observe how Mission Focus consolidates repeated alerts into reviewable incident groups while preserving every raw event in the underlying ledger.',
      act: () => {
        doReset('ALERT_SURGE');
        for (let i = 0; i < 25; i++) {
          engine.tick();
        }
        setRunning(false);
        setInboxViewMode('ORGANIZED');
        if (engine.groups.length > 0) {
          setInboxInspectedGroupId(engine.groups[0].groupId);
        }
        setRender((r) => r + 1);
      },
    },
  ];

  // Test the AI sandbox calculations
  const proofTrackId = views.some((v) => v.id === proofTrack) ? proofTrack : views[0]?.id ?? 'T-01';
  const targetView = views.find((v) => v.id === proofTrackId);
  const proofBase = targetView?.features || [1, 0.1, 0, 0.5, 5];
  const sandboxAfter = [...proofBase];
  if (sandboxFault === 'DELAY') sandboxAfter[1] = proofBase[1] + 4;
  if (sandboxFault === 'MISSING') {
    sandboxAfter[0] = proofBase[0] + 2;
    sandboxAfter[2] = proofBase[2] + 2;
  }
  if (sandboxFault === 'POSITION_ERROR') sandboxAfter[4] = proofBase[4] + 160;

  const mlSandboxBefore = evaluateMl(proofBase);
  const mlSandboxAfter = evaluateMl(sandboxAfter);
  const ruleSandboxBefore = ruleCheck({
    gap_s: proofBase[0],
    age_s: proofBase[1],
    missing: proofBase[2],
    residual: proofBase[4],
  });
  const ruleSandboxAfter = ruleCheck({
    gap_s: sandboxAfter[0],
    age_s: sandboxAfter[1],
    missing: sandboxAfter[2],
    residual: sandboxAfter[4],
  });

  const sandboxAgreement =
    mlSandboxAfter.status !== 'OK'
      ? 'ML unavailable: baseline rules only'
      : mlSandboxAfter.flagged === ruleSandboxAfter.triggered
      ? 'Consensus: Both AI and Rules Agree'
      : mlSandboxAfter.flagged
      ? 'AI Flagged Only (Sensitivity Anomaly)'
      : 'Rules Triggered Only (Boundary Rule Check)';

  const replaySnap = replayOpen ? engine.snapshots[replayIdx] : null;

  const handleLiveInjection = () => {
    if (!targetView?.hasObservation) {
      setNotice(`Drone ${proofTrackId} has no initial observation yet. Click Start to initialize.`);
      return;
    }
    const trace = engine.injectLivePipelineFault(proofTrackId, proofFault);
    if (trace) {
      setLiveInjectionTrace(trace);
      setRender((r) => r + 1);
      setNotice(`Synthetic packet injected for ${proofTrackId} (${proofFault}) through the full ingestion pipeline.`);
    }
  };

  const handleDismissOnboarding = (forever: boolean) => {
    setShowOnboarding(false);
    if (forever) {
      localStorage.setItem('satark_onboarding_dismissed', 'true');
    }
  };

  const trustLensInfo = sel ? getTrustLensExplanation(sel.quality) : null;

  return (
    <div className="satark-app-root" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--canvas)' }}>
      {/* 1. Header */}
      <header
        className="topnav"
        style={{
          padding: '10px 20px',
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        {/* Left: Brand & Airspace Monitoring Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span
              className="brand-serif"
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
              }}
            >
              SATARK
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
              Airspace Monitoring
            </span>
          </div>

          {/* Persistent Data Source Transparency Indicator */}
          <span
            className="chip"
            title="This environment uses generated exercise data and is not connected to live sensors."
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              padding: '3px 8px',
              borderRadius: 'var(--radius-xs)',
              background: 'var(--elevated)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-secondary)',
              cursor: 'help',
            }}
          >
            DEMO DATA
          </span>

          <span
            className="chip"
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: running ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: running ? 'var(--success)' : 'var(--text-muted)',
                display: 'inline-block',
                marginRight: 6,
              }}
            />
            {running ? (replayOpen ? 'Replay' : 'Monitoring') : 'Paused'}
          </span>

          <span
            className="chip mono"
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            T+ {fmtSim(engine.simTimeMs)}
          </span>
        </div>

        {/* Right: Controls, Test the AI, Theme Switcher, and More */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Scenario:</span>
            <select
              aria-label="Simulation Scenario"
              className="input control-h36"
              style={{ width: 148, padding: '0 8px', borderRadius: 'var(--radius-sm)' }}
              value={scenario}
              onChange={(e) => {
                const sc = e.target.value as Scenario;
                setScenario(sc);
                doReset(sc);
              }}
            >
              <option value="ZONE_ENTRY">ZONE_ENTRY</option>
              <option value="CLEAN">CLEAN</option>
              <option value="ALERT_SURGE">ALERT_SURGE</option>
              <option value="MISSING_UPDATES">MISSING_UPDATES</option>
              <option value="POSITION_JUMP">POSITION_JUMP</option>
              <option value="DELAYED_PACKET">DELAYED_PACKET</option>
            </select>
          </div>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Speed:</span>
            <select
              aria-label="Simulation Speed"
              className="input control-h36"
              style={{ width: 72, padding: '0 8px', borderRadius: 'var(--radius-sm)' }}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value={0.5}>0.5x</option>
              <option value={1}>1.0x</option>
              <option value={2}>2.0x</option>
              <option value={4}>4.0x</option>
            </select>
          </div>

          <button
            type="button"
            className="btn-ghost control-h36"
            style={{ padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={() => setRunning(!running)}
          >
            {running ? 'Pause' : 'Start'}
          </button>

          <button
            type="button"
            className="btn-ghost control-h36"
            style={{ padding: '0 12px' }}
            onClick={() => doReset()}
            title="Reset simulation to scenario baseline"
          >
            Reset
          </button>

          <button
            type="button"
            className="btn-coral control-h36"
            style={{ padding: '0 14px', fontWeight: 600, borderRadius: 'var(--radius-sm)' }}
            onClick={() => setProofOpen(true)}
            title="Open Test the AI workbench"
          >
            Test the AI
          </button>

          <ThemeSwitcher />

          {/* More Actions Dropdown Menu */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="btn-ghost control-h36"
              style={{ padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              onClick={() => setToolsMenuOpen(!toolsMenuOpen)}
              title="More Options"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
              More
            </button>

            {toolsMenuOpen && (
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
                  padding: 4,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ textAlign: 'left', width: '100%', border: 'none', borderRadius: 4, padding: '7px 10px', fontSize: 12 }}
                  onClick={() => {
                    setReplayOpen(true);
                    setReplayIdx(Math.max(0, engine.snapshots.length - 1));
                    setToolsMenuOpen(false);
                  }}
                >
                  Historical Replay
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ textAlign: 'left', width: '100%', border: 'none', borderRadius: 4, padding: '7px 10px', fontSize: 12 }}
                  onClick={() => {
                    downloadReport();
                    setToolsMenuOpen(false);
                  }}
                >
                  Download Audit Report
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ textAlign: 'left', width: '100%', border: 'none', borderRadius: 4, padding: '7px 10px', fontSize: 12 }}
                  onClick={() => {
                    setGuidedOpen(true);
                    setGuidedStep(0);
                    setToolsMenuOpen(false);
                  }}
                >
                  Guided Tour
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ textAlign: 'left', width: '100%', border: 'none', borderRadius: 4, padding: '7px 10px', fontSize: 12 }}
                  onClick={() => {
                    setSettingsOpen(true);
                    setToolsMenuOpen(false);
                  }}
                >
                  Simulation Settings
                </button>
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ textAlign: 'left', width: '100%', border: 'none', borderRadius: 4, padding: '7px 10px', fontSize: 12, color: 'var(--text-muted)' }}
                  onClick={onLogout}
                >
                  Log out ({DEMO_USER})
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Optional First-Visit Onboarding Guide */}
      {showOnboarding && (
        <div
          style={{
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            padding: '10px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className="chip mono" style={{ fontSize: 11, background: 'var(--cyan-soft)', color: 'var(--cyan)', borderColor: 'rgba(0,223,216,0.3)' }}>
              QUICK ONBOARDING {onboardingStep + 1}/4
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
              {onboardingStep === 0 && '1. Watch Drones on the Live Map: Each directional chevron tracks an active drone with heading, altitude, and speed.'}
              {onboardingStep === 1 && '2. Review Important Warnings on the Right: If a drone enters the restricted area or exhibits unusual behavior, inspect it in Needs Attention.'}
              {onboardingStep === 2 && '3. Check Data Reliability First: An unusual jump may simply be delayed or inconsistent telemetry. Use Trust Lens before assuming hostile intent.'}
              {onboardingStep === 3 && '4. Test the AI: Use the Test the AI workbench to inject synthetic faults and compare machine learning with deterministic rules.'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {onboardingStep < 3 ? (
              <button
                type="button"
                className="btn-sm"
                style={{ padding: '3px 10px', fontSize: 12 }}
                onClick={() => setOnboardingStep((s) => s + 1)}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                className="btn-sm"
                style={{ padding: '3px 10px', fontSize: 12 }}
                onClick={() => handleDismissOnboarding(true)}
              >
                Finish Guide
              </button>
            )}

            <button
              type="button"
              className="btn-ghost"
              style={{ padding: '3px 8px', fontSize: 12, color: 'var(--text-muted)' }}
              onClick={() => handleDismissOnboarding(false)}
            >
              Dismiss
            </button>
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: '3px 8px', fontSize: 11, color: 'var(--text-faint)' }}
              onClick={() => handleDismissOnboarding(true)}
              title="Don't show this guide on future visits"
            >
              Don't show again
            </button>
          </div>
        </div>
      )}

      {/* Notice Banner */}
      {notice && (
        <div style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)', padding: '6px 20px', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-primary)' }}>
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice('')}
            style={{ background: 'none', border: 0, color: 'var(--cyan)', cursor: 'pointer', fontSize: 12 }}
          >
            Close
          </button>
        </div>
      )}

      {/* Replay Notice */}
      {replayOpen && (
        <div style={{ background: 'var(--warning-surface)', borderBottom: '1px solid var(--warning-border)', padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--warning)' }}>
            REPLAY MODE ACTIVE: Viewing recorded history. Live simulation is isolated.
          </span>
          <button
            type="button"
            className="btn-ghost"
            style={{ fontSize: 12, padding: '3px 10px' }}
            onClick={() => {
              setReplayOpen(false);
              setReplayPlaying(false);
            }}
          >
            Return to Live Monitoring
          </button>
        </div>
      )}

      {/* Smart, Non-Intrusive Alert Toasts */}
      <AlertToastManager
        groups={engine.groups}
        tracks={views}
        simTimeMs={engine.simTimeMs}
        onOpenEvidence={(g) => setDrawerGroup(g)}
        onSelectTrack={(tId) => handleViewOnMap(tId)}
        onViewOnMap={handleViewOnMap}
      />

      {/* Main Operational Workspace */}
      <main style={{ flex: 1, padding: '10px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Secondary Feature Action Strip making all core capabilities discoverable */}
        <div className="feature-action-strip" role="region" aria-label="Feature quick navigation">
          {/* Test the AI */}
          <button
            type="button"
            className="btn-ghost control-h36"
            onClick={() => setProofOpen(true)}
            style={{
              padding: '0 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
            title="Test the AI: Compare how AI and rule checks respond to unusual drone data"
          >
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Test the AI</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· Compare AI vs Rules</span>
          </button>

          {/* Data Reliability · Trust Lens */}
          <button
            type="button"
            className="btn-ghost control-h36"
            onClick={() => {
              if (selected) {
                setDrawerTrack(selected);
              } else {
                setNotice('Select a drone to inspect its kinematic Trust Lens reliability metrics.');
              }
            }}
            style={{
              padding: '0 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
            title="Data Reliability (Trust Lens): Shows whether received data is recent and consistent before taking action"
          >
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Data Reliability</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· Trust Lens</span>
          </button>

          {/* Coverage Watch */}
          <button
            type="button"
            className="btn-ghost control-h36"
            onClick={() => setCoverageWatchOpen(true)}
            style={{
              padding: '0 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
            title="Coverage Watch: Shows which drones have recent data and which need checking"
          >
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Coverage Watch</span>
            <span
              className="mono"
              style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 'var(--radius-pill)',
                background: coverageSummary.needsAttentionTotal > 0 ? 'var(--warning-surface)' : 'var(--elevated)',
                color: coverageSummary.needsAttentionTotal > 0 ? 'var(--warning)' : 'var(--text-secondary)',
                border: `1px solid ${coverageSummary.needsAttentionTotal > 0 ? 'var(--warning-border)' : 'var(--border)'}`,
              }}
            >
              {coverageSummary.recentCount}/{views.length} fresh
            </span>
          </button>

          {/* Mission Focus */}
          <button
            type="button"
            className="btn-ghost control-h36"
            onClick={() => {
              setInboxViewMode('ORGANIZED');
              setNotice('Viewing Mission Focus consolidated incidents in Needs Attention.');
            }}
            style={{
              padding: '0 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
            title="Mission Focus: Consolidates repeated alerts to prevent fatigue without losing raw records"
          >
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Mission Focus</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· Alert Grouping</span>
          </button>

          {/* Replay an Incident */}
          <button
            type="button"
            className="btn-ghost control-h36"
            onClick={() => {
              setReplayOpen(true);
              setReplayIdx(Math.max(0, engine.snapshots.length - 1));
            }}
            style={{
              padding: '0 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
            title="Replay an Incident: See what happened before an alert appeared"
          >
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Replay an Incident</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· Timeline</span>
          </button>
        </div>

        {/* 3-Column Operational Layout */}
        <div className="operational-workspace" style={{ flex: 1 }}>
          {/* COLUMN 1: Drones Sidebar matching reference screenshot */}
          <aside
            className="card"
            style={{
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              maxHeight: 'calc(100vh - 150px)',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: '-0.2px', color: 'var(--text-primary)' }}>
                  Drone Tracks
                </h3>
                <span
                  className="chip mono"
                  style={{
                    fontSize: 11,
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-pill)',
                    background: 'var(--elevated)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {views.length}
                </span>

                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setCoverageWatchOpen(true)}
                  style={{
                    padding: '2px 7px',
                    fontSize: 11,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    borderRadius: 'var(--radius-pill)',
                    borderColor: coverageSummary.needsAttentionTotal > 0 ? 'var(--warning-border)' : 'var(--border)',
                    color: coverageSummary.needsAttentionTotal > 0 ? 'var(--warning)' : 'var(--text-secondary)',
                    background: coverageSummary.needsAttentionTotal > 0 ? 'var(--warning-surface)' : 'transparent',
                  }}
                  title="Coverage Watch: inspect monitoring-data availability"
                >
                  <span>Coverage</span>
                  {coverageSummary.needsAttentionTotal > 0 ? (
                    <span style={{ fontSize: 10, fontWeight: 700 }}>
                      · {coverageSummary.needsAttentionTotal} check
                    </span>
                  ) : (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
                  )}
                </button>
              </div>

              {selected && (
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ padding: '2px 6px', fontSize: 11, border: 'none', color: 'var(--text-muted)' }}
                  onClick={() => setSelected(null)}
                  title="Clear selection"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Drone Search */}
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                style={{ fontSize: 12, padding: '6px 8px 6px 26px', borderRadius: 'var(--radius-sm)' }}
                placeholder="Search drone ID..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-muted)"
                strokeWidth="2"
                style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>

            {/* Drone Cards List with non-contradictory status and quick View on Map */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filteredTracks.map((t) => {
                const isSel = selected === t.id;
                const status = getTrackDerivedStatus(t);

                return (
                  <div
                    key={t.id}
                    onClick={() => {
                      setSelected(t.id);
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-sm)',
                      border: isSel ? '1px solid var(--selected-border)' : '1px solid var(--border)',
                      background: isSel ? 'var(--selected-bg)' : 'var(--surface)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'border-color 0.15s ease, background-color 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: status.dotColor }} />
                        <span className="mono" style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                          {t.id}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          {t.hasObservation ? formatRelativeSimTime(t.ageSec) : 'Awaiting data'}
                        </span>
                      </div>

                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewOnMap(t.id);
                        }}
                        style={{
                          height: 24,
                          padding: '0 7px',
                          fontSize: 11,
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          color: isSel ? 'var(--accent)' : 'var(--text-secondary)',
                        }}
                        title={`View Drone ${t.id} on tactical map`}
                      >
                        <Crosshair size={11} />
                        <span>View</span>
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace', paddingLeft: 16 }}>
                      <span>ALT {status.altitudeText}</span>
                      <span>SPD {status.speedText}</span>
                      <span style={{ color: status.badgeColor, marginLeft: 'auto', fontWeight: 600 }}>{status.badgeText}</span>
                    </div>
                  </div>
                );
              })}

              {filteredTracks.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>
                  No drones match query.
                </p>
              )}
            </div>
          </aside>

          {/* COLUMN 2: Live Drone Map & Contextual Selected Drone Strip */}
          <section ref={mapContainerRef} style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            {/* Simulation Ready Banner when paused at T+0 */}
            {!running && engine.simTimeMs === 0 && (
              <div
                style={{
                  padding: '8px 14px',
                  background: 'var(--surface)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
                  <span style={{ color: 'var(--text-primary)' }}>
                    <b>Ready to Monitor:</b> Start monitoring to begin streaming telemetry and tracking Zone Alpha airspace.
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-coral"
                  style={{ padding: '0 14px', fontSize: 12, fontWeight: 600, height: 32, whiteSpace: 'nowrap' }}
                  onClick={() => setRunning(true)}
                >
                  Start Monitoring
                </button>
              </div>
            )}

            <MapView
              tracks={views}
              selected={selected}
              onSelect={(id) => {
                setSelected(id);
                setDrawerTrack(id);
              }}
              showTrails={showTrails}
              setShowTrails={setShowTrails}
              showPrediction={showPrediction}
              setShowPrediction={setShowPrediction}
              showLabels={showLabels}
              setShowLabels={setShowLabels}
              showZone={showZone}
              setShowZone={setShowZone}
              replayPos={replaySnap ? replaySnap.pos : null}
              onClearSelection={() => {
                setSelected(null);
                setMapFocusTarget(null);
              }}
              focusTarget={mapFocusTarget}
              onExitFocus={() => setMapFocusTarget(null)}
            />

            {/* Bottom Contextual Details Strip for Selected Drone with unified status */}
            {sel && (() => {
              const selStatus = getTrackDerivedStatus(sel);
              return (
                <div
                  className="card"
                  style={{
                    padding: '10px 14px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 14,
                    flexWrap: 'wrap',
                  }}
                >
                  {/* Left section: Callout and Metrics */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 260 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: selStatus.dotColor }} />
                      <span className="mono" style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>
                        {sel.id}
                      </span>
                      <span
                        className="chip"
                        style={{
                          fontSize: 11,
                          background: selStatus.badgeBg,
                          color: selStatus.badgeColor,
                          borderColor: selStatus.badgeBorder,
                        }}
                      >
                        {selStatus.badgeText}
                      </span>

                      <button
                        type="button"
                        className="btn-coral"
                        style={{ padding: '3px 12px', fontSize: 11, fontWeight: 600, marginLeft: 'auto', height: 26 }}
                        onClick={() => setDrawerTrack(sel.id)}
                      >
                        View Full Evidence
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(95px, 1fr))', gap: 8, fontSize: 12 }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: 10, textTransform: 'uppercase' }}>Altitude</span>
                        <b style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{selStatus.altitudeText}</b>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: 10, textTransform: 'uppercase' }}>Speed</span>
                        <b style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{selStatus.speedText}</b>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: 10, textTransform: 'uppercase' }}>Heading</span>
                        <b style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{selStatus.headingText}</b>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: 10, textTransform: 'uppercase' }}>Position</span>
                        <b style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{selStatus.positionText}</b>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: 10, textTransform: 'uppercase' }}>Last Update</span>
                        <b style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                          {sel.hasObservation ? formatRelativeSimTime(sel.ageSec) : 'Awaiting data'}
                        </b>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: 10, textTransform: 'uppercase' }}>Data Reliability</span>
                        <b style={{ color: selStatus.reliabilityColor }}>
                          {selStatus.reliabilityLabel}
                        </b>
                      </div>
                    </div>
                  </div>

                  {/* Right section: Altitude Sparkline Profile */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', fontSize: 10, color: 'var(--text-muted)' }}>
                      <span>Recent Altitude</span>
                      <span>&gt;</span>
                    </div>
                    <DroneAltitudeSparkline track={sel} />
                  </div>
                </div>
              );
            })()}
          </section>

          {/* COLUMN 3: Needs Attention Panel matching screenshot */}
          <aside
            className="card"
            style={{
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              maxHeight: 'calc(100vh - 150px)',
              overflowY: 'auto',
            }}
          >
            {/* Scannable Alert Inbox (Needs Attention) */}
            <AlertInbox
              groups={engine.groups}
              tracks={views}
              events={engine.events}
              simTimeMs={engine.simTimeMs}
              selectedTrackId={selected}
              activeViewMode={inboxViewMode}
              onViewModeChange={setInboxViewMode}
              inspectedGroupId={inboxInspectedGroupId}
              onInspectedGroupIdChange={setInboxInspectedGroupId}
              onOpenEvidence={(g) => {
                setDrawerGroup(g);
              }}
              onSelectTrack={(tId) => {
                setSelected(tId);
                setDrawerTrack(tId);
                setNotice(`Focused on Drone ${tId} on map.`);
              }}
              onViewOnMap={handleViewOnMap}
              onSetReview={(gId, st) => {
                engine.setReview(gId, st);
                setRender((r) => r + 1);
              }}
            />
          </aside>
        </div>
      </main>

      {/* 2. TEST THE AI MODAL (Proof Mode) */}
      {proofOpen && (
        <div className="overlay" role="dialog" aria-label="Test the AI Workbench">
          <div className="sheet" style={{ maxWidth: 840, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                  Test the AI: Anomaly Detection &amp; Rule Verification
                </h2>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                  Side-by-side comparison: Deterministic Rules Baseline vs Scikit-Learn Isolation Forest on identical features
                </p>
              </div>
              <button type="button" className="btn-ghost" onClick={() => setProofOpen(false)}>
                Close
              </button>
            </div>

            {/* Mode Switcher */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button
                type="button"
                className={`btn-ghost ${proofTab === 'LIVE_INJECTION' ? 'active' : ''}`}
                style={{
                  padding: '8px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  borderColor: proofTab === 'LIVE_INJECTION' ? 'var(--border-focus)' : 'var(--border)',
                  color: proofTab === 'LIVE_INJECTION' ? 'var(--cyan)' : 'var(--text-secondary)',
                }}
                onClick={() => setProofTab('LIVE_INJECTION')}
              >
                1. Live Ingestion Pipeline Test
              </button>

              <button
                type="button"
                className={`btn-ghost ${proofTab === 'SANDBOX' ? 'active' : ''}`}
                style={{
                  padding: '8px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  borderColor: proofTab === 'SANDBOX' ? 'var(--border-focus)' : 'var(--border)',
                  color: proofTab === 'SANDBOX' ? 'var(--cyan)' : 'var(--text-secondary)',
                }}
                onClick={() => setProofTab('SANDBOX')}
              >
                2. Sandbox Sensitivity Test (In-Memory)
              </button>
            </div>

            {/* TAB 1: LIVE INGESTION TEST */}
            {proofTab === 'LIVE_INJECTION' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: 13, color: 'var(--text-primary)' }}>
                  <b>Live Ingestion Pipeline Test:</b> Injects a synthetic telemetry packet directly into the real 10-step ingestion pipeline. You can observe validation, trust analysis, rules check, ML anomaly evaluation, and Mission Focus grouping in sequence.
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Target Drone:
                    <select
                      className="input"
                      style={{ marginLeft: 6, width: 100 }}
                      value={proofTrackId}
                      onChange={(e) => setProofTrack(e.target.value)}
                    >
                      {views.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Fault to Simulate:
                    <select
                      className="input"
                      style={{ marginLeft: 6, width: 230 }}
                      value={proofFault}
                      onChange={(e) => setProofFault(e.target.value as typeof proofFault)}
                    >
                      <option value="DELAY">Delayed Update (+4s Latency)</option>
                      <option value="MISSING">Missing Update (Packet Gap)</option>
                      <option value="POSITION_ERROR">Incorrect Position (+160m Spatial Jump)</option>
                      <option value="OUT_OF_ORDER">Late Arrival (Out of Order)</option>
                      <option value="INVALID">Invalid Packet (Illegal Coords)</option>
                    </select>
                  </label>

                  <button
                    type="button"
                    className="btn-sm"
                    style={{ padding: '8px 14px', fontWeight: 600 }}
                    onClick={handleLiveInjection}
                  >
                    Inject Synthetic Packet
                  </button>
                </div>

                {/* 10-Step Pipeline Audit Trace */}
                {liveInjectionTrace ? (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 14, background: 'var(--canvas)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span className="eyebrow" style={{ margin: 0, color: 'var(--cyan)' }}>
                        Pipeline Audit Trace: Drone {liveInjectionTrace.trackId}
                      </span>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Event: {liveInjectionTrace.packet.eventId}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, fontSize: 12 }}>
                      <div style={{ background: 'var(--surface)', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
                        <b>1. Packet Validation:</b>
                        <br />
                        Status: <span style={{ color: liveInjectionTrace.validation.valid ? 'var(--cyan)' : 'var(--error)' }}>{liveInjectionTrace.validation.valid ? 'VALID' : `REJECTED (${liveInjectionTrace.validation.reason})`}</span>
                        <br />
                        Reported: ({liveInjectionTrace.packet.x}, {liveInjectionTrace.packet.y})
                      </div>

                      <div style={{ background: 'var(--surface)', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
                        <b>2. Trust Lens Analysis:</b>
                        <br />
                        Age: {liveInjectionTrace.trustLens.ageSec.toFixed(1)}s · Gap: {liveInjectionTrace.trustLens.gapSec.toFixed(1)}s
                        <br />
                        Residual: <b style={{ color: liveInjectionTrace.trustLens.residual > 60 ? 'var(--error)' : 'var(--text-primary)' }}>{liveInjectionTrace.trustLens.residual.toFixed(0)}m</b>
                      </div>

                      <div style={{ background: 'var(--surface)', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
                        <b>3. Rules Engine:</b>
                        <br />
                        Triggered: <b style={{ color: liveInjectionTrace.rules.triggered ? 'var(--error)' : 'var(--cyan)' }}>{liveInjectionTrace.rules.triggered ? 'YES' : 'NO'}</b>
                        <br />
                        Checks: {liveInjectionTrace.rules.checks.map((c) => c.id).join(', ') || 'None'}
                      </div>

                      <div style={{ background: 'var(--surface)', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
                        <b>4. AI Isolation Forest:</b>
                        <br />
                        Score: <b className="mono">{isNaN(liveInjectionTrace.ml.decision) ? 'N/A' : liveInjectionTrace.ml.decision.toFixed(3)}</b>
                        <br />
                        Verdict: {liveInjectionTrace.ml.flagged ? <span style={{ color: 'var(--error)' }}>FLAGGED ANOMALY</span> : <span style={{ color: 'var(--cyan)' }}>NORMAL</span>}
                      </div>

                      <div style={{ background: 'var(--surface)', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
                        <b>5. Mission Focus Routing:</b>
                        <br />
                        Alert ID: <span className="mono">{liveInjectionTrace.createdEventId || 'No alert fired'}</span>
                        <br />
                        Group ID: <span className="mono">{liveInjectionTrace.createdGroupId || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '24px 16px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', fontSize: 13 }}>
                    Click &quot;Inject Synthetic Packet&quot; above to trace a simulated fault through the ingestion pipeline.
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: SANDBOX TEST */}
            {proofTab === 'SANDBOX' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: 13, color: 'var(--text-primary)' }}>
                  <b>Sandbox Sensitivity Test:</b> Alters an in-memory feature vector in isolation to test decision boundaries without affecting live telemetry.
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Simulate Feature Distortion:
                    <select
                      className="input"
                      style={{ marginLeft: 6, width: 240 }}
                      value={sandboxFault}
                      onChange={(e) => setSandboxFault(e.target.value as typeof sandboxFault)}
                    >
                      <option value="DELAY">Delayed Update (+4s Packet Age)</option>
                      <option value="MISSING">Missing Update (+2s Gap, +2 Missing)</option>
                      <option value="POSITION_ERROR">Incorrect Position (+160m Spatial Jump)</option>
                      <option value="NORMAL">Normal Telemetry (Clean)</option>
                    </select>
                  </label>

                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setBenchmark(runBenchmark())}
                  >
                    Run Evaluation Benchmark (n=400)
                  </button>
                </div>

                {/* Feature Vector Table */}
                <table>
                  <thead>
                    <tr>
                      <th>Telemetry Feature</th>
                      <th>Before Fault</th>
                      <th>After Fault</th>
                      <th>Feature Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FEATURE_ORDER.map((f, i) => (
                      <tr key={f}>
                        <td>{f}</td>
                        <td className="mono">{proofBase[i].toFixed(2)}</td>
                        <td className="mono">{sandboxAfter[i].toFixed(2)}</td>
                        <td className="mono" style={{ color: proofBase[i] !== sandboxAfter[i] ? 'var(--cyan)' : 'var(--text-muted)' }}>
                          {proofBase[i] !== sandboxAfter[i] ? `+${(sandboxAfter[i] - proofBase[i]).toFixed(2)}` : 'None'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Rules vs ML Side-by-Side Comparison */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="card" style={{ padding: 12 }}>
                    <h3 style={{ margin: '0 0 6px', fontSize: 14 }}>Deterministic Rules Engine</h3>
                    <p style={{ fontSize: 13, margin: '4px 0' }}>
                      Baseline: {ruleSandboxBefore.triggered ? 'TRIGGERED' : 'Normal'} to After:{' '}
                      <b style={{ color: ruleSandboxAfter.triggered ? 'var(--error)' : 'var(--cyan)' }}>
                        {ruleSandboxAfter.triggered ? 'TRIGGERED' : 'Normal'}
                      </b>
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                      Checks: {ruleSandboxAfter.checks.map((c) => `${c.id} (${c.triggered ? 'ALERT' : 'OK'})`).join(' · ')}
                    </p>
                  </div>

                  <div className="card" style={{ padding: 12 }}>
                    <h3 style={{ margin: '0 0 6px', fontSize: 14 }}>ML: Isolation Forest ({MODEL.version})</h3>
                    {mlSandboxAfter.status === 'OK' ? (
                      <p style={{ fontSize: 13, margin: '4px 0' }}>
                        Score: {mlSandboxAfter.score.toFixed(3)} · Decision:{' '}
                        <b style={{ color: mlSandboxAfter.flagged ? 'var(--error)' : 'var(--cyan)' }}>
                          {mlSandboxAfter.decision.toFixed(3)} ({mlSandboxAfter.flagged ? 'FLAGGED' : 'NORMAL'})
                        </b>
                      </p>
                    ) : (
                      <p style={{ fontSize: 13, color: 'var(--error)' }}>MODEL UNAVAILABLE</p>
                    )}
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                      Consensus: <b>{sandboxAgreement}</b>
                    </p>
                  </div>
                </div>

                {/* Advanced Results Toggle */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ fontSize: 12 }}
                    onClick={() => setShowAdvancedModel(!showAdvancedModel)}
                  >
                    {showAdvancedModel ? 'Hide Advanced Results' : 'Show Advanced Results (Model Architecture & Benchmark)'}
                  </button>

                  {showAdvancedModel && (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {benchmark ? (
                        <table>
                          <thead>
                            <tr>
                              <th>Classifier</th>
                              <th>Precision</th>
                              <th>Recall</th>
                              <th>False Positive Rate</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td>ML (Isolation Forest)</td>
                              <td className="mono">{benchmark.mlPrecision?.toFixed(3) ?? 'N/A'}</td>
                              <td className="mono">{benchmark.mlRecall?.toFixed(3) ?? 'N/A'}</td>
                              <td className="mono">{benchmark.mlFpr?.toFixed(3) ?? 'N/A'}</td>
                            </tr>
                            <tr>
                              <td>Rules Baseline</td>
                              <td className="mono">{benchmark.rulePrecision?.toFixed(3) ?? 'N/A'}</td>
                              <td className="mono">{benchmark.ruleRecall?.toFixed(3) ?? 'N/A'}</td>
                              <td className="mono">{benchmark.ruleFpr?.toFixed(3) ?? 'N/A'}</td>
                            </tr>
                          </tbody>
                        </table>
                      ) : (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Click &quot;Run Evaluation Benchmark&quot; above to evaluate on 400 held-out synthetic test vectors.</p>
                      )}

                      <div style={{ background: 'var(--canvas)', padding: 10, borderRadius: 6, fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                        Model: {MODEL.version} · Estimators: {MODEL.n_estimators} · Offset: {MODEL.offset} · Features: [{FEATURE_ORDER.join(', ')}]
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. TRUST LENS EVIDENCE DRAWER */}
      {drawerTrack && (() => {
        const t = views.find((v) => v.id === drawerTrack);
        if (!t) return null;
        const info = getTrustLensExplanation(t.quality);

        return (
          <div className="drawer" role="dialog" aria-label="Drone Trust Lens Evidence">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                  Drone {t.id} · Data Reliability
                </h2>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Trust Lens: Checks whether latest drone information is recent and consistent
                </div>
              </div>
              <button type="button" className="btn-ghost" onClick={() => setDrawerTrack(null)}>
                Close
              </button>
            </div>

            <div style={{ background: 'var(--surface-hover)', padding: '10px 12px', borderRadius: 6, marginBottom: 12, border: '1px solid var(--border)' }}>
              <b style={{ color: info.color }}>{info.label}:</b> {info.text}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                padding: '10px 12px',
                background: 'var(--surface)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                marginBottom: 12,
                fontSize: 12,
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Observation Age:</span>
                <div className="mono" style={{ fontWeight: 600 }}>
                  {t.hasObservation ? `${t.ageSec.toFixed(1)}s` : 'Awaiting data'}
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Missing Updates:</span>
                <div className="mono" style={{ fontWeight: 600, color: t.missing > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>
                  {t.missing} {t.missing === 1 ? 'packet' : 'packets'}
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Position Residual:</span>
                <div className="mono" style={{ fontWeight: 600, color: t.residual > 60 ? 'var(--error)' : 'var(--text-primary)' }}>
                  {t.residual.toFixed(0)}m (threshold &lt; 60m)
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Packet Ingestion:</span>
                <div className="mono" style={{ fontWeight: 600 }}>
                  {t.accepted} accepted / {t.rejected} rejected
                </div>
              </div>
            </div>

            {t.features && (
              <table style={{ marginBottom: 14 }}>
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>Measured Value</th>
                  </tr>
                </thead>
                <tbody>
                  {FEATURE_ORDER.map((f, i) => (
                    <tr key={f}>
                      <td>{f}</td>
                      <td className="mono">{t.features![i].toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td>AI Anomaly Score</td>
                    <td className="mono">
                      {t.ml ? (t.ml.status === 'OK' ? `${t.ml.decision.toFixed(3)} (${t.ml.flagged ? 'FLAGGED' : 'NORMAL'})` : 'MODEL UNAVAILABLE') : 'None'}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}

            <div style={{ marginTop: 10 }}>
              <h4 style={{ margin: '0 0 6px', fontSize: 13 }}>Rejected Telemetry Log</h4>
              {t.rejectedDetail.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No rejected packets for this drone.</p>
              ) : (
                <ul className="mono" style={{ fontSize: 11, paddingLeft: 16, margin: 0 }}>
                  {t.rejectedDetail.map((r) => (
                    <li key={r.eventId}>
                      {r.eventId} · Reason: <b style={{ color: 'var(--error)' }}>{r.reason}</b> · Observed {fmtSim(r.observedAtMs)}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-coral"
                onClick={() => {
                  handleViewOnMap(t.id, 'DATA');
                  setDrawerTrack(null);
                }}
                style={{ fontSize: 13, padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Crosshair size={14} />
                View on Map
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setProofTrack(t.id);
                  setDrawerTrack(null);
                  setProofOpen(true);
                }}
                style={{ fontSize: 13, padding: '8px 14px' }}
              >
                Open in Test the AI
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => copyJson(t, `Drone ${t.id} Telemetry`)}
                style={{ fontSize: 13, padding: '8px 14px' }}
              >
                Copy JSON
              </button>
            </div>
          </div>
        );
      })()}

      {/* 4. INCIDENT REVIEW DRAWER */}
      {drawerGroup && (() => {
        const associatedTrack = views.find((t: TrackView) => t.id === drawerGroup.trackId);
        const inboxItem = getAlertInboxItem(drawerGroup, engine.simTimeMs, associatedTrack);
        const groupEvents = engine.events.filter((e) => drawerGroup.rawEventIds.includes(e.id));
        const firstAgeSec = Math.max(0, (engine.simTimeMs - drawerGroup.firstSeenMs) / 1000);
        const lastAgeSec = Math.max(0, (engine.simTimeMs - drawerGroup.lastSeenMs) / 1000);

        return (
          <div className="drawer" role="dialog" aria-label="Incident Review Drawer">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Warning Review Evidence</h2>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '2px 7px',
                    borderRadius: 'var(--radius-pill)',
                    background:
                      inboxItem.priorityBadge.level === 'high'
                        ? 'var(--error-surface)'
                        : inboxItem.priorityBadge.level === 'medium'
                        ? 'var(--warning-surface)'
                        : 'var(--elevated)',
                    color:
                      inboxItem.priorityBadge.level === 'high'
                        ? 'var(--error)'
                        : inboxItem.priorityBadge.level === 'medium'
                        ? 'var(--warning)'
                        : 'var(--text-muted)',
                    border: `1px solid ${
                      inboxItem.priorityBadge.level === 'high'
                        ? 'var(--error-border)'
                        : inboxItem.priorityBadge.level === 'medium'
                        ? 'var(--warning-border)'
                        : 'var(--border)'
                    }`,
                  }}
                >
                  {inboxItem.priorityBadge.label} Priority
                </span>
              </div>
              <button type="button" className="btn-ghost" onClick={() => setDrawerGroup(null)}>
                Close
              </button>
            </div>

            {/* Drone & Issue Summary */}
            <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span className="mono" style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                  Drone {drawerGroup.trackId}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>·</span>
                <span style={{ fontWeight: 700, letterSpacing: '0.2px' }}>{inboxItem.title}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {inboxItem.contextLine}
              </div>
            </div>

            {/* Detailed Timestamps & Group Identity */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                padding: '10px 12px',
                background: 'var(--surface-soft)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                marginBottom: 14,
                fontSize: 12,
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>First Detected:</span>
                <div className="mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {fmtSim(drawerGroup.firstSeenMs)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {formatRelativeSimTime(firstAgeSec)}
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Latest Update:</span>
                <div className="mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {fmtSim(drawerGroup.lastSeenMs)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {formatRelativeSimTime(lastAgeSec)}
                </div>
              </div>

              <div style={{ gridColumn: 'span 2', paddingTop: 4, borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  Group ID: {drawerGroup.groupId}
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: 10,
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-pill)',
                    background: 'var(--elevated)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {drawerGroup.rawEventIds.length} related {drawerGroup.rawEventIds.length === 1 ? 'event' : 'events'}
                </span>
              </div>
            </div>

            {/* Trust Lens Verification Metrics */}
            <div style={{ marginBottom: 14 }}>
              <h4 style={{ margin: '0 0 6px', fontSize: 13 }}>Trust Lens Kinematic Verification</h4>
              {associatedTrack ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 6,
                    padding: '8px 10px',
                    background: 'var(--surface)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    fontSize: 11,
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Residual:</span>
                    <div className="mono" style={{ fontWeight: 600, color: associatedTrack.residual > 60 ? 'var(--warning)' : 'var(--text-primary)' }}>
                      {associatedTrack.residual.toFixed(0)}m
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Threshold &lt; 60m</div>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Data Age:</span>
                    <div className="mono" style={{ fontWeight: 600, color: associatedTrack.ageSec > 4 ? 'var(--error)' : 'var(--text-primary)' }}>
                      {associatedTrack.ageSec.toFixed(1)}s
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Quality: {associatedTrack.quality}</div>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Packets:</span>
                    <div className="mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {associatedTrack.accepted} ok / {associatedTrack.rejected} rej
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Reliability verification</div>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                  Drone telemetry currently initializing.
                </p>
              )}
            </div>

            {/* AI Isolation Forest Results */}
            <div style={{ marginBottom: 14 }}>
              <h4 style={{ margin: '0 0 6px', fontSize: 13 }}>AI Anomaly Verification (Isolation Forest)</h4>
              {associatedTrack?.ml ? (
                <div
                  style={{
                    padding: '8px 10px',
                    background: 'var(--surface)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    fontSize: 11,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Model Status:</span>
                    <span className="mono" style={{ fontWeight: 600 }}>{associatedTrack.ml.status}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Decision Score:</span>
                    <span className="mono" style={{ fontWeight: 600 }}>
                      {associatedTrack.ml.status === 'OK' ? associatedTrack.ml.decision.toFixed(4) : 'N/A'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>ML Classification:</span>
                    <span
                      className="mono"
                      style={{
                        fontWeight: 600,
                        color: associatedTrack.ml.flagged ? 'var(--warning)' : 'var(--success)',
                      }}
                    >
                      {associatedTrack.ml.flagged ? 'FLAGGED (ANOMALOUS)' : 'NORMAL (EXPECTED)'}
                    </span>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                  Model inference runs continuously on valid telemetry vectors.
                </p>
              )}
            </div>

            {/* Raw Observations / Grouped Events */}
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 6px', fontSize: 13 }}>
                Raw Observations ({drawerGroup.rawEventIds.length})
              </h4>
              <div
                style={{
                  maxHeight: 140,
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface)',
                }}
              >
                {drawerGroup.rawEventIds.map((eventId) => {
                  const ev = groupEvents.find((e) => e.id === eventId);
                  return (
                    <div
                      key={eventId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        borderBottom: '1px solid var(--border-subtle)',
                        fontSize: 11,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="mono" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          {eventId}
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {ev ? ev.cause : drawerGroup.normalizedCause}
                        </span>
                      </div>
                      <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {ev ? fmtSim(ev.simulatedAtMs) : 'Logged'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Operator Review Disposition */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <h4 style={{ margin: '0 0 6px', fontSize: 13 }}>Operator Review Disposition:</h4>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(['REVIEWED', 'ACKNOWLEDGED', 'FOLLOW_UP', 'UNREVIEWED'] as ReviewStatus[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    className={`btn-ghost ${drawerGroup.reviewStatus === st ? 'active' : ''}`}
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      borderColor: drawerGroup.reviewStatus === st ? 'var(--border-focus)' : 'var(--border)',
                      color: drawerGroup.reviewStatus === st ? 'var(--cyan)' : 'var(--text-secondary)',
                    }}
                    onClick={() => {
                      engine.setReview(drawerGroup.groupId, st);
                      setDrawerGroup({ ...drawerGroup, reviewStatus: st });
                      setRender((r) => r + 1);
                    }}
                  >
                    {st === 'REVIEWED' ? 'Mark Reviewed' : st === 'UNREVIEWED' ? 'Reopen' : st}
                  </button>
                ))}
              </div>

              {/* Action shortcuts */}
              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-coral"
                  onClick={() => {
                    handleViewOnMap(drawerGroup.trackId, drawerGroup.category === 'SECURITY_ADVISORY' ? 'ZONE' : 'DATA');
                    setDrawerGroup(null);
                  }}
                  style={{ fontSize: 13, padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Crosshair size={14} />
                  View on Map
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setProofTrack(drawerGroup.trackId);
                    setDrawerGroup(null);
                    setProofOpen(true);
                  }}
                  style={{ fontSize: 13, padding: '8px 14px' }}
                >
                  Test the AI
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => copyJson({ group: drawerGroup, track: associatedTrack, events: groupEvents }, `Alert ${drawerGroup.groupId}`)}
                  style={{ fontSize: 13, padding: '8px 14px' }}
                >
                  Copy JSON
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 5. HISTORICAL REPLAY MODAL */}
      {replayOpen && (
        <div className="overlay" role="dialog" aria-label="Historical Replay Modal">
          <div className="sheet" style={{ maxWidth: 600 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Historical Simulation Replay</h2>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setReplayOpen(false);
                  setReplayPlaying(false);
                }}
              >
                Return to Live
              </button>
            </div>

            {engine.snapshots.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No snapshots recorded yet. Start simulation first.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p className="mono" style={{ fontSize: 13, margin: 0 }}>
                  Snapshot: {replayIdx + 1} / {engine.snapshots.length} · Timestamp: {replaySnap ? fmtSim(replaySnap.t) : ''}
                </p>

                <input
                  type="range"
                  min={0}
                  max={engine.snapshots.length - 1}
                  value={replayIdx}
                  onChange={(e) => setReplayIdx(Number(e.target.value))}
                  style={{ width: '100%' }}
                />

                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn-ghost" onClick={() => setReplayIdx((i) => Math.max(0, i - 1))}>
                    Step Back
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setReplayPlaying(!replayPlaying)}>
                    {replayPlaying ? 'Pause' : 'Play'}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setReplayIdx((i) => Math.min(engine.snapshots.length - 1, i + 1))}>
                    Step Forward
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setReplayIdx(0)}>
                    Reset to T+0
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. GUIDED TOUR MODAL */}
      {guidedOpen && (
        <div className="overlay" role="dialog" aria-label="Guided Tour Modal">
          <div className="sheet" style={{ maxWidth: 580 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>
                Guided Demonstration · Step {guidedStep + 1} of {guidedSteps.length}
              </h2>
              <button type="button" className="btn-ghost" onClick={() => setGuidedOpen(false)}>
                Close
              </button>
            </div>

            <h3 style={{ margin: '0 0 6px', fontSize: 16, color: 'var(--cyan)' }}>
              {guidedSteps[guidedStep].title}
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: '22px' }}>
              {guidedSteps[guidedStep].text}
            </p>

            {/* Interactive "See alerts get organized" Demo Section */}
            {guidedSteps[guidedStep].title.includes('See alerts get organized') && (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-soft)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                    Live Alert Organization Demonstration
                  </strong>
                  <button
                    type="button"
                    className="btn-coral"
                    style={{ padding: '3px 9px', fontSize: 11 }}
                    onClick={() => {
                      guidedSteps[guidedStep].act();
                    }}
                  >
                    Replay ALERT_SURGE
                  </button>
                </div>

                {/* Real-time Factual Counts */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 8,
                    padding: '8px 10px',
                    background: 'var(--elevated)',
                    borderRadius: 'var(--radius-xs)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Raw Events Ingested</div>
                    <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {engine.events.length}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Review Groups</div>
                    <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: 'var(--cyan)' }}>
                      {engine.groups.length}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Consolidated for Review</div>
                    <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)' }}>
                      {Math.max(0, engine.events.length - engine.groups.length)}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {engine.events.length > 0
                    ? `${engine.events.length} original events → ${engine.groups.length} review groups (${Math.max(0, engine.events.length - engine.groups.length)} repeated entries consolidated). Grouped for review, never deleted from the ledger.`
                    : 'Click "Replay ALERT_SURGE" above to load the deterministic scenario.'}
                </div>

                {/* Switch between Organized and All Events right in demo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>View Mode:</span>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{
                      padding: '2px 8px',
                      fontSize: 11,
                      fontWeight: inboxViewMode === 'ORGANIZED' ? 700 : 500,
                      background: inboxViewMode === 'ORGANIZED' ? 'var(--surface)' : 'transparent',
                      color: inboxViewMode === 'ORGANIZED' ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                    onClick={() => setInboxViewMode('ORGANIZED')}
                  >
                    Organized ({engine.groups.length})
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{
                      padding: '2px 8px',
                      fontSize: 11,
                      fontWeight: inboxViewMode === 'ALL_EVENTS' ? 700 : 500,
                      background: inboxViewMode === 'ALL_EVENTS' ? 'var(--surface)' : 'transparent',
                      color: inboxViewMode === 'ALL_EVENTS' ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                    onClick={() => setInboxViewMode('ALL_EVENTS')}
                  >
                    All Events Ledger ({engine.events.length})
                  </button>
                </div>

                {/* Inspect Sample Group and Review Order Policy */}
                {engine.groups.length > 0 && (() => {
                  const sampleGroup = engine.groups[0];
                  const ordered = computeRecommendedReviewOrder(engine.groups, views, engine.events, engine.simTimeMs);
                  const sampleItem = ordered.find((o) => o.group.groupId === sampleGroup.groupId) || ordered[0];

                  return (
                    <div
                      style={{
                        padding: '8px 10px',
                        background: 'var(--surface)',
                        borderRadius: 'var(--radius-xs)',
                        border: '1px solid var(--border)',
                        fontSize: 11,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          Group Sample: Drone {sampleGroup.trackId} ({sampleGroup.normalizedCause})
                        </span>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                          {sampleGroup.rawEventIds.length} original events
                        </span>
                      </div>

                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>Original Event IDs: </span>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--text-primary)' }}>
                          {sampleGroup.rawEventIds.slice(0, 10).join(', ')}
                          {sampleGroup.rawEventIds.length > 10 ? ` ... (+${sampleGroup.rawEventIds.length - 10} more)` : ''}
                        </span>
                      </div>

                      {sampleItem && (
                        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 5 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)' }}>
                            Suggested Review Sequence: Review {sampleItem.queuePosition}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                            <strong>Why this order?</strong> {sampleItem.reasonForPlacement}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                            {sampleItem.detailedExplanation}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                type="button"
                className="btn-sm"
                onClick={() => {
                  guidedSteps[guidedStep].act();
                  setRender((r) => r + 1);
                }}
              >
                Execute This Step
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={guidedStep === 0}
                onClick={() => setGuidedStep((s) => Math.max(0, s - 1))}
              >
                Back
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={guidedStep === guidedSteps.length - 1}
                onClick={() => setGuidedStep((s) => Math.min(guidedSteps.length - 1, s + 1))}
              >
                Next Step
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. SETTINGS MODAL */}
      {settingsOpen && (
        <div className="overlay" role="dialog" aria-label="Simulation Settings Modal">
          <div className="sheet" style={{ maxWidth: 520 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>Simulation Settings</h2>
              <button type="button" className="btn-ghost" onClick={() => setSettingsOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 13 }}>
                PRNG Seed (Deterministic Reproducibility):
                <input
                  className="input"
                  type="number"
                  style={{ marginTop: 4 }}
                  value={tmpSeed}
                  onChange={(e) => setTmpSeed(Number(e.target.value) || 42)}
                />
              </label>

              <label style={{ fontSize: 13 }}>
                Scenario:
                <select
                  className="input"
                  style={{ marginTop: 4 }}
                  value={tmpScenario}
                  onChange={(e) => setTmpScenario(e.target.value as Scenario)}
                >
                  {SCENARIOS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}: {s.desc}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ fontSize: 13 }}>
                Active Drones Count (4 to 10):
                <input
                  className="input"
                  type="number"
                  min={4}
                  max={10}
                  style={{ marginTop: 4 }}
                  value={tmpTrackCount}
                  onChange={(e) => setTmpTrackCount(Math.max(4, Math.min(10, Number(e.target.value) || 8)))}
                />
              </label>

              <button
                type="button"
                className="btn-sm"
                onClick={() => {
                  doReset(tmpScenario, tmpSeed, tmpTrackCount);
                  setSettingsOpen(false);
                }}
              >
                Apply & Reset Simulation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. SEARCH DIALOG (⌘K) */}
      {searchOpen && (
        <div className="overlay" role="dialog" aria-label="Search Drones Dialog">
          <div className="sheet" style={{ maxWidth: 520 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                autoFocus
                className="input"
                placeholder="Search drone ID (e.g. T-01, T-04)..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="button" className="btn-ghost" onClick={() => setSearchOpen(false)}>
                ESC
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
              {views
                .filter((v) => v.id.toLowerCase().includes(query.toLowerCase()))
                .map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className="btn-ghost"
                    style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}
                    onClick={() => {
                      setSelected(v.id);
                      setDrawerTrack(v.id);
                      setSearchOpen(false);
                    }}
                  >
                    <span>{v.id} · {getTrustLensExplanation(v.quality).label}</span>
                    <span className="mono" style={{ color: 'var(--text-muted)' }}>{v.altitudeM}m</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* 9. COVERAGE WATCH MODAL */}
      <CoverageWatchModal
        tracks={views}
        isOpen={coverageWatchOpen}
        onClose={() => setCoverageWatchOpen(false)}
        onSelectTrack={(tId) => {
          setSelected(tId);
          setDrawerTrack(tId);
          setNotice(`Selected Drone ${tId} from Coverage Watch.`);
        }}
        onViewOnMap={handleViewOnMap}
      />

      {/* Toast Notification */}
      {copyMsg && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, background: 'var(--surface)', border: '1px solid var(--border-focus)', color: 'var(--cyan)', padding: '8px 16px', borderRadius: 6, fontSize: 12, zIndex: 1000 }}>
          {copyMsg}
        </div>
      )}
    </div>
  );
}
