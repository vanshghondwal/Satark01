import React, { useState, useEffect, useRef } from 'react';
import type { PublicRoute } from './PublicPages';
import { ThemeSwitcher } from '../components/ThemeSwitcher';
import './website.css';

interface HomePageProps {
  onEnter: () => void;
  hasSession: boolean;
  onNavigate?: (r: PublicRoute) => void;
}

export function HomePage({ onEnter, hasSession, onNavigate }: HomePageProps) {
  const nav = onNavigate || (() => {});

  // Showcase Active Tab
  const [activeShowcaseTab, setActiveShowcaseTab] = useState<'tab-map' | 'tab-tracks' | 'tab-attention' | 'tab-reliability' | 'tab-evidence'>('tab-map');

  // AI Demonstration Scenario
  const [activeScenario, setActiveScenario] = useState<'nominal' | 'dropout' | 'incursion'>('nominal');

  // Mobile Menu Drawer
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Access / Demo Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [accessMode, setAccessMode] = useState<'demo' | 'custom'>('demo');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Canvas Frame Sequence State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const heroContainerRef = useRef<HTMLElement | null>(null);
  const [loaderProgress, setLoaderProgress] = useState(0);
  const [loaderHidden, setLoaderHidden] = useState(false);
  const [activeStoryPhase, setActiveStoryPhase] = useState(1);
  const [hudReadout, setHudReadout] = useState({
    frame: 'FRAME: 001/220',
    mode: 'MODE: ATMOSPHERIC',
    elevation: 'ELEV: HIGH STRATOSPHERE',
    status: 'SIGNAL: SCANNING',
  });

  const TOTAL_FRAMES = 220;
  const FRAME_PREFIX = '/Defense_tech_website_background___20261026144628_gwr_video_mvp_frames/frame_';

  // Format frame number to 3 digits (1 -> "001")
  const getFrameFilename = (index: number) => {
    const num = (index + 1).toString().padStart(3, '0');
    return `${FRAME_PREFIX}${num}.jpg`;
  };

  // Canvas Animation & Scroll Tracking
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const frameImages: HTMLImageElement[] = new Array(TOTAL_FRAMES);
    const frameLoaded: boolean[] = new Array(TOTAL_FRAMES).fill(false);
    let loadedCount = 0;
    let currentDrawnIndex = -1;
    let targetFrameIndex = 0;
    let lerpedFrameIndex = 0;
    let isTicking = false;
    let animationFrameId: number;

    const resizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      if (currentDrawnIndex >= 0) {
        drawFrameToCanvas(currentDrawnIndex);
      }
    };

    const drawFrameToCanvas = (index: number) => {
      const img = frameImages[index];
      if (!img || !canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      const canvasWidth = rect.width;
      const canvasHeight = rect.height;
      if (canvasWidth === 0 || canvasHeight === 0) return;

      const imgRatio = img.naturalWidth / img.naturalHeight || 16 / 9;
      const canvasRatio = canvasWidth / canvasHeight;
      let renderW: number, renderH: number, offsetX: number, offsetY: number;

      if (canvasRatio > imgRatio) {
        renderW = canvasWidth;
        renderH = canvasWidth / imgRatio;
        offsetX = 0;
        offsetY = (canvasHeight - renderH) / 2;
      } else {
        renderH = canvasHeight;
        renderW = canvasHeight * imgRatio;
        offsetX = (canvasWidth - renderW) / 2;
        offsetY = 0;
      }

      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      ctx.drawImage(img, offsetX, offsetY, renderW, renderH);
    };

    const getNearestLoadedFrame = (targetIdx: number) => {
      if (frameLoaded[targetIdx]) return targetIdx;
      for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
        const prev = targetIdx - offset;
        if (prev >= 0 && frameLoaded[prev]) return prev;
        const next = targetIdx + offset;
        if (next < TOTAL_FRAMES && frameLoaded[next]) return next;
      }
      return 0;
    };

    const renderFrame = (frameIdx: number) => {
      const actualIdx = getNearestLoadedFrame(frameIdx);
      if (actualIdx !== currentDrawnIndex) {
        drawFrameToCanvas(actualIdx);
        currentDrawnIndex = actualIdx;
      }
    };

    const updateHUD = (frameIdx: number) => {
      let mode = 'MODE: ATMOSPHERIC';
      let elevation = 'ELEV: HIGH STRATOSPHERE';
      let trackStatus = 'SIGNAL: SCANNING';

      if (frameIdx < 55) {
        mode = 'MODE: ATMOSPHERIC';
        elevation = 'ELEV: HIGH STRATOSPHERE';
        trackStatus = 'SIGNAL: SCANNING';
      } else if (frameIdx < 110) {
        mode = 'MODE: TERRAIN DESCENT';
        elevation = 'ELEV: 8,400m MSL · HIMALAYAN SECTOR';
        trackStatus = 'SIGNAL: TERRAIN LOCKED';
      } else if (frameIdx < 165) {
        mode = 'MODE: TELEMETRY OVERLAY';
        elevation = 'ELEV: 3,200m MSL · AIRSPACE CORRIDOR';
        trackStatus = 'SIGNAL: MULTI-TRACK CORRELATING';
      } else {
        mode = 'MODE: TARGET IDENTIFIED';
        elevation = 'ELEV: 2,850m MSL · VECTOR ACQUIRED';
        trackStatus = 'SIGNAL: ACTIONABLE ANOMALY';
      }

      setHudReadout({
        frame: `FRAME: ${(frameIdx + 1).toString().padStart(3, '0')}/${TOTAL_FRAMES}`,
        mode,
        elevation,
        status: trackStatus,
      });
    };

    const tickAnimation = () => {
      const delta = targetFrameIndex - lerpedFrameIndex;
      if (Math.abs(delta) < 0.2) {
        lerpedFrameIndex = targetFrameIndex;
        isTicking = false;
      } else {
        lerpedFrameIndex += delta * 0.25;
        animationFrameId = requestAnimationFrame(tickAnimation);
      }
      const currentIntFrame = Math.round(lerpedFrameIndex);
      renderFrame(currentIntFrame);
      updateHUD(currentIntFrame);
    };

    const onScroll = () => {
      const hero = heroContainerRef.current;
      if (!hero) return;
      const rect = hero.getBoundingClientRect();
      const heroTop = window.scrollY + rect.top;
      const heroHeight = rect.height;
      const maxScroll = heroHeight - window.innerHeight;
      if (maxScroll <= 0) return;

      const scrollFraction = Math.min(1, Math.max(0, (window.scrollY - heroTop) / maxScroll));
      targetFrameIndex = Math.min(TOTAL_FRAMES - 1, Math.floor(scrollFraction * (TOTAL_FRAMES - 1)));

      if (scrollFraction >= 0.74) {
        setActiveStoryPhase(4);
      } else if (scrollFraction >= 0.48) {
        setActiveStoryPhase(3);
      } else if (scrollFraction >= 0.23) {
        setActiveStoryPhase(2);
      } else {
        setActiveStoryPhase(1);
      }

      if (!isTicking) {
        isTicking = true;
        animationFrameId = requestAnimationFrame(tickAnimation);
      }
    };

    const loadSingleFrame = (index: number) => {
      const img = new Image();
      img.src = getFrameFilename(index);
      img.onload = () => {
        frameImages[index] = img;
        frameLoaded[index] = true;
        loadedCount++;
        const pct = Math.min(100, Math.round((loadedCount / TOTAL_FRAMES) * 100));
        setLoaderProgress(pct);
        if (loadedCount >= 20) setLoaderHidden(true);
        if (Math.round(lerpedFrameIndex) === index) {
          renderFrame(index);
        }
      };
    };

    // 1. First frame
    const firstImg = new Image();
    firstImg.src = getFrameFilename(0);
    firstImg.onload = () => {
      frameImages[0] = firstImg;
      frameLoaded[0] = true;
      loadedCount++;
      renderFrame(0);
      setLoaderProgress(Math.round((loadedCount / TOTAL_FRAMES) * 100));
    };

    // 2. Initial burst
    const INITIAL_BURST = 25;
    for (let i = 1; i < INITIAL_BURST; i++) {
      loadSingleFrame(i);
    }

    // 3. Lazy chunk load
    let nextIndex = INITIAL_BURST;
    const loadRemainingChunk = () => {
      const CHUNK_SIZE = 12;
      const endIndex = Math.min(TOTAL_FRAMES, nextIndex + CHUNK_SIZE);
      for (let i = nextIndex; i < endIndex; i++) {
        loadSingleFrame(i);
      }
      nextIndex = endIndex;
      if (nextIndex < TOTAL_FRAMES) {
        setTimeout(loadRemainingChunk, 40);
      }
    };
    const chunkTimer = setTimeout(loadRemainingChunk, 200);

    resizeCanvas();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameId);
      clearTimeout(chunkTimer);
    };
  }, []);

  // AI Demonstration Data Scenarios
  const scenarioData = {
    nominal: {
      score: '0.14',
      rating: 'LOW / NOMINAL',
      barWidth: '14%',
      barColor: 'var(--nominal-green)',
      trackId: 'SK-102',
      vspeed: '+0.8 m/s',
      trust: '98% High',
      trustClass: 'font-green',
      age: '0.2s',
      ruleGeoPassed: true,
      ruleGeoDesc: 'Clear of all restricted buffer zones (> 2.4 km).',
      ruleRatePassed: true,
      ruleRateDesc: 'Turn rate and acceleration are within nominal drone flight envelope.',
      ruleFreshnessPassed: true,
      ruleFreshnessDesc: 'Continuous sensor packet stream corroborated across 3 receivers.',
      recommendation: 'No Action Required — Routine Flight',
      recBorder: 'var(--nominal-green)',
    },
    dropout: {
      score: '0.62',
      rating: 'MODERATE VARIANCE',
      barWidth: '62%',
      barColor: 'var(--warning-amber)',
      trackId: 'TK-480',
      vspeed: '0.0 m/s (Frozen)',
      trust: '48% Degraded',
      trustClass: 'font-amber',
      age: '4.8s (Delayed)',
      ruleGeoPassed: true,
      ruleGeoDesc: 'Operating within assigned flight corridor.',
      ruleRatePassed: true,
      ruleRateDesc: 'Dead-reckoning extrapolation matches last known velocity vector.',
      ruleFreshnessPassed: false,
      ruleFreshnessDesc: 'Signal packet cadence interrupted; 4 consecutive pings dropped.',
      recommendation: 'Flag for Data Verification — Sensor Delay',
      recBorder: 'var(--warning-amber)',
    },
    incursion: {
      score: '0.88',
      rating: 'CRITICAL ANOMALY',
      barWidth: '88%',
      barColor: 'var(--coral)',
      trackId: 'TK-482',
      vspeed: '-8.4 m/s (Rapid Descent)',
      trust: '94% Confirmed',
      trustClass: 'font-green',
      age: '0.3s (Fresh)',
      ruleGeoPassed: false,
      ruleGeoDesc: 'Approaching Restricted Sector B-4 boundary (< 650m remaining).',
      ruleRatePassed: false,
      ruleRateDesc: 'Abrupt 64° heading shift accompanied by uncharacteristic vertical descent.',
      ruleFreshnessPassed: true,
      ruleFreshnessDesc: 'Telemetry verified via dual receiver corroboration with low latency.',
      recommendation: 'Priority 1 Review — Urgent Human Evaluation',
      recBorder: 'var(--coral)',
    },
  };

  const currentScen = scenarioData[activeScenario];

  const handleLaunchSession = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setTimeout(() => {
      setIsLoggingIn(false);
      setModalOpen(false);
      onEnter();
    }, 400);
  };

  return (
    <div className="website-root">
      {/* Top Global Navigation Bar */}
      <header className="navbar" id="site-header">
        <div className="nav-container">
          <a href="#hero" className="nav-brand" aria-label="SATARK Home">
            <div className="brand-symbol">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" strokeOpacity="0.4" strokeDasharray="3 3" />
                <circle cx="12" cy="12" r="4" stroke="var(--coral)" />
                <line x1="12" y1="3" x2="12" y2="7" />
                <line x1="12" y1="17" x2="12" y2="21" />
                <line x1="3" y1="12" x2="7" y2="12" />
                <line x1="17" y1="12" x2="21" y2="12" />
              </svg>
            </div>
            <span className="brand-text">SATARK</span>
            <span className="brand-status" aria-label="System status nominal">
              <span className="status-dot"></span>
              SYS: ACTIVE
            </span>
          </a>

          {/* Desktop Nav Links */}
          <nav className="nav-menu" id="nav-links">
            <a href="#problem" className="nav-link">Platform</a>
            <a href="#capabilities" className="nav-link">Capabilities</a>
            <a href="#command-center" className="nav-link">Command Center</a>
            <a href="#how-it-works" className="nav-link">How It Works</a>
            <a href="#ai-test" className="nav-link">AI Test</a>
            <button type="button" className="nav-link" onClick={() => nav('docs')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
              Docs
            </button>
          </nav>

          {/* Action Buttons */}
          <div className="nav-actions">
            <ThemeSwitcher />
            <button
              type="button"
              className="btn-ghost"
              id="nav-login-btn"
              onClick={() => setModalOpen(true)}
            >
              {hasSession ? 'Session Active' : 'Login'}
            </button>
            <button
              type="button"
              className="btn-primary"
              id="nav-access-btn"
              onClick={onEnter}
            >
              <span>{hasSession ? 'Open Command Center' : 'Command Center'}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
            {/* Mobile Toggle Button */}
            <button
              type="button"
              className="mobile-toggle"
              id="mobile-menu-toggle"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <span className="bar"></span>
              <span className="bar"></span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        <div className={`mobile-nav ${mobileMenuOpen ? 'open' : ''}`} id="mobile-nav-drawer">
          <nav className="mobile-nav-links">
            <a href="#problem" className="mobile-link" onClick={() => setMobileMenuOpen(false)}>Platform</a>
            <a href="#capabilities" className="mobile-link" onClick={() => setMobileMenuOpen(false)}>Capabilities</a>
            <a href="#command-center" className="mobile-link" onClick={() => setMobileMenuOpen(false)}>Command Center</a>
            <a href="#how-it-works" className="mobile-link" onClick={() => setMobileMenuOpen(false)}>How It Works</a>
            <a href="#ai-test" className="mobile-link" onClick={() => setMobileMenuOpen(false)}>AI Test</a>
          </nav>
          <div className="mobile-nav-actions">
            <button
              type="button"
              className="btn-ghost full-width"
              onClick={() => {
                setMobileMenuOpen(false);
                setModalOpen(true);
              }}
            >
              Login
            </button>
            <button
              type="button"
              className="btn-primary full-width"
              onClick={() => {
                setMobileMenuOpen(false);
                onEnter();
              }}
            >
              Access Command Center
            </button>
          </div>
        </div>
      </header>

      {/* Section 1: Full-Screen Animated Hero: "FROM SKY TO SIGNAL" */}
      <section className="hero-scroll-container" id="hero" ref={heroContainerRef}>
        <div className="hero-sticky-stage" id="hero-stage">
          <canvas id="hero-canvas" ref={canvasRef} className="hero-canvas" width="1280" height="720" aria-hidden="true"></canvas>

          {/* Ambient overlay gradients for text readability */}
          <div className="canvas-overlay"></div>

          {/* Telemetry HUD elements on canvas */}
          <div className="hero-telemetry-overlay" aria-hidden="true">
            <div className="telemetry-corner top-left">
              <span className="coord-tag">LAT 34°12'44"N · LON 77°35'10"E</span>
              <span className="alt-tag" id="hud-elevation">{hudReadout.elevation}</span>
            </div>
            <div className="telemetry-corner top-right">
              <span className="hud-mode" id="hud-phase-label">{hudReadout.mode}</span>
              <span className="hud-frame" id="hud-frame-indicator">{hudReadout.frame}</span>
            </div>
            <div className="telemetry-corner bottom-left">
              <span className="sys-code">SATARK SENSOR INGEST // SYNTH-DATA</span>
            </div>
            <div className="telemetry-corner bottom-right">
              <div className="reticle-status">
                <span className="pulse-indicator"></span>
                <span id="hud-tracking-status">{hudReadout.status}</span>
              </div>
            </div>
          </div>

          {/* Preload indicator / Progress bar */}
          <div className={`sequence-loader ${loaderHidden ? 'hidden' : ''}`} id="sequence-loader" aria-hidden="true">
            <div className="loader-track">
              <div className="loader-bar" id="loader-progress" style={{ width: `${loaderProgress}%` }}></div>
            </div>
            <span className="loader-text" id="loader-text">
              {loaderProgress >= 100 ? 'READY' : 'INITIALIZING CINEMATIC SEQUENCE...'}
            </span>
          </div>

          {/* Hero Story Floating Text Panels */}
          <div className="hero-story-layer" id="hero-story-layer">
            {/* Story Phase 1: Atmosphere */}
            <div className={`hero-story-phase ${activeStoryPhase === 1 ? 'phase-active' : ''}`} id="phase-1">
              <div className="hero-phase-content">
                <div className="phase-badge">
                  <span className="badge-index">PHASE 01</span>
                  <span className="badge-sep">/</span>
                  <span className="badge-title">ATMOSPHERE</span>
                </div>
                <h1 className="hero-headline">See the sky.<br /><span className="highlight-coral">Verify the signal.</span></h1>
                <p className="hero-subtitle">
                  An intelligent airspace-monitoring platform that transforms incoming drone data into clear, reviewable information.
                </p>
                <div className="hero-cta-group">
                  <a href="#problem" className="btn-primary hero-btn">Explore SATARK</a>
                  <button type="button" className="btn-secondary hero-btn" onClick={() => setModalOpen(true)}>
                    Access Command Center
                  </button>
                </div>
              </div>
            </div>

            {/* Story Phase 2: Geographic Terrain */}
            <div className={`hero-story-phase ${activeStoryPhase === 2 ? 'phase-active' : ''}`} id="phase-2">
              <div className="hero-phase-content">
                <div className="phase-badge">
                  <span className="badge-index">PHASE 02</span>
                  <span className="badge-sep">/</span>
                  <span className="badge-title">GEOGRAPHIC TERRAIN</span>
                </div>
                <h2 className="hero-headline">Every movement<br /><span className="highlight-coral">has context.</span></h2>
                <p className="hero-subtitle">
                  Geographic coordinates without verification are just points on a map. Genuine airspace awareness demands temporal and terrain correlation.
                </p>
                <div className="hero-phase-metrics">
                  <div className="metric-pill"><span>RADAR SECTOR:</span> 04-NORTH</div>
                  <div className="metric-pill"><span>RESOLUTION:</span> 10m GRID</div>
                </div>
              </div>
            </div>

            {/* Story Phase 3: Telemetry & Overlays */}
            <div className={`hero-story-phase ${activeStoryPhase === 3 ? 'phase-active' : ''}`} id="phase-3">
              <div className="hero-phase-content">
                <div className="phase-badge">
                  <span className="badge-index">PHASE 03</span>
                  <span className="badge-sep">/</span>
                  <span className="badge-title">TELEMETRY &amp; OVERLAYS</span>
                </div>
                <h2 className="hero-headline">Not every signal<br /><span className="highlight-coral">tells the whole story.</span></h2>
                <p className="hero-subtitle">
                  Sensor packet loss, duplicate transponder pings, and telemetry drift can obscure genuine airspace events. We test data reliability before ringing alarms.
                </p>
                <div className="hero-phase-metrics">
                  <div className="metric-pill"><span>RAW OBS:</span> 128 PINGS/SEC</div>
                  <div className="metric-pill"><span>REDUNDANCY:</span> CLUSTERED</div>
                </div>
              </div>
            </div>

            {/* Story Phase 4: Actionable Intelligence */}
            <div className={`hero-story-phase ${activeStoryPhase === 4 ? 'phase-active' : ''}`} id="phase-4">
              <div className="hero-phase-content">
                <div className="phase-badge">
                  <span className="badge-index">PHASE 04</span>
                  <span className="badge-sep">/</span>
                  <span className="badge-title">ACTIONABLE INTELLIGENCE</span>
                </div>
                <h2 className="hero-headline">Know what needs<br /><span className="highlight-coral">human attention.</span></h2>
                <p className="hero-subtitle">
                  Machine-learning anomaly detection and transparent review rules consolidate redundant signals into high-confidence, prioritized review dossiers.
                </p>
                <div className="hero-cta-group">
                  <button type="button" className="btn-primary hero-btn" onClick={onEnter}>
                    Launch Command Center
                  </button>
                  <a href="#capabilities" className="btn-secondary hero-btn">Explore Capabilities</a>
                </div>
              </div>
            </div>
          </div>

          {/* Subtle Hero Scroll Prompt */}
          <div className="hero-scroll-prompt" id="hero-scroll-indicator" aria-hidden="true">
            <span className="scroll-label">SCROLL TO ADVANCE SEQUENCE</span>
            <div className="scroll-mouse">
              <div className="scroll-wheel"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: The Problem */}
      <section className="section section-problem" id="problem">
        <div className="container">
          <div className="section-header">
            <span className="section-tag">THE PROBLEM</span>
            <h2 className="section-title">More data doesn't always mean<br />more clarity.</h2>
            <p className="section-lead">
              Monitoring multiple aerial tracks can produce repeated warnings, delayed observations and conflicting information. Understanding what happened and which information can be trusted matters as much as displaying movement.
            </p>
          </div>

          <div className="grid-3 problem-grid">
            {/* Card 1 */}
            <article className="problem-card">
              <div className="card-num-badge">01</div>
              <div className="card-icon-wrap">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <h3 className="card-title">Too many repeated warnings</h3>
              <p className="card-desc">
                High-frequency sensors create dozens of redundant alerts for the same underlying track variation. Operators suffer from alert fatigue while genuine anomalies get lost in the noise.
              </p>
              <div className="card-telemetry-tag">
                <span className="tag-label">CONSEQUENCE:</span> Operational distraction &amp; missed incidents
              </div>
            </article>

            {/* Card 2 */}
            <article className="problem-card">
              <div className="card-num-badge">02</div>
              <div className="card-icon-wrap">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.58 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" />
                </svg>
              </div>
              <h3 className="card-title">Missing or inconsistent observations</h3>
              <p className="card-desc">
                Sensor dropouts, timestamp mismatches, and delayed telemetry packets make tracks appear erratic. Without observation reliability checks, systems display false vectors.
              </p>
              <div className="card-telemetry-tag">
                <span className="tag-label">CONSEQUENCE:</span> Unverified tracks treated as confirmed targets
              </div>
            </article>

            {/* Card 3 */}
            <article className="problem-card">
              <div className="card-num-badge">03</div>
              <div className="card-icon-wrap">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </div>
              <h3 className="card-title">Limited visibility into why warnings appear</h3>
              <p className="card-desc">
                Opaque threat scores offer no breakdown of underlying telemetry faults versus kinetic flight violations. Operators are forced to make decisions without clear evidentiary audit trails.
              </p>
              <div className="card-telemetry-tag">
                <span className="tag-label">CONSEQUENCE:</span> Slower verification and lack of audit confidence
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* Section 3: Core Architecture */}
      <section className="section section-capabilities" id="capabilities">
        <div className="container">
          <div className="section-header">
            <span className="section-tag">CORE ARCHITECTURE</span>
            <h2 className="section-title">Built for clarity, not just tracking.</h2>
            <p className="section-lead">
              SATARK goes beyond simple map dots. It combines deterministic rule validation, data reliability diagnostics, and locally executable machine learning to make aerial intelligence reviewable.
            </p>
          </div>

          <div className="capabilities-grid">
            {/* Capability 1: Trust Lens */}
            <div className="capability-card">
              <div className="cap-header">
                <div className="cap-badge">CAPABILITY 01</div>
                <span className="cap-tag">RELIABILITY ANALYSIS</span>
              </div>
              <h3 className="cap-title">Data Reliability — Trust Lens</h3>
              <p className="cap-desc">
                Understand whether the latest drone observations are recent and consistent. The Trust Lens evaluates sensor latency, packet cadence, and spatial continuity before generating any alert.
              </p>
              <div className="cap-visual-box">
                <div className="hud-mini-header">
                  <span>LIVE TELEMETRY AUDIT</span>
                  <span className="hud-status-chip nominal">CONFIRMED TRUST</span>
                </div>
                <div className="reliability-meters">
                  <div className="meter-row">
                    <span className="meter-label">Telemetry Freshness</span>
                    <div className="meter-track"><div className="meter-fill" style={{ width: '96%' }}></div></div>
                    <span className="meter-val">0.3s ago</span>
                  </div>
                  <div className="meter-row">
                    <span className="meter-label">Kinematic Consistency</span>
                    <div className="meter-track"><div className="meter-fill" style={{ width: '92%' }}></div></div>
                    <span className="meter-val">92%</span>
                  </div>
                  <div className="meter-row">
                    <span className="meter-label">Sensor Corroboration</span>
                    <div className="meter-track"><div className="meter-fill" style={{ width: '88%' }}></div></div>
                    <span className="meter-val">3 Sensors</span>
                  </div>
                </div>
                <div className="hud-mini-footer">
                  <span>TRUST SCORE: <strong>94 / 100</strong></span>
                  <span className="mono-code">STATUS: HIGH_FIDELITY</span>
                </div>
              </div>
            </div>

            {/* Capability 2: Mission Focus */}
            <div className="capability-card">
              <div className="cap-header">
                <div className="cap-badge">CAPABILITY 02</div>
                <span className="cap-tag">EVENT GROUPING</span>
              </div>
              <h3 className="cap-title">Organized Warnings — Mission Focus</h3>
              <p className="cap-desc">
                Turn repeated events into manageable review groups without deleting original evidence. Repeated telemetry deviations coalesce into a single chronological case dossier.
              </p>
              <div className="cap-visual-box">
                <div className="hud-mini-header">
                  <span>ALERT DE-DUPLICATION ENGINE</span>
                  <span className="hud-status-chip coral">1 DOSSIER (8 PINGS)</span>
                </div>
                <div className="event-cluster-visual">
                  <div className="cluster-summary-bar">
                    <div className="cluster-id">CASE #EV-482 · DRONE-ALPHA</div>
                    <div className="cluster-time">14:48:10 — 14:49:02</div>
                  </div>
                  <div className="cluster-timeline">
                    <div className="time-node active"><span className="dot"></span>0s</div>
                    <div className="time-line"></div>
                    <div className="time-node"><span className="dot"></span>+12s</div>
                    <div className="time-line"></div>
                    <div className="time-node"><span className="dot"></span>+28s</div>
                    <div className="time-line"></div>
                    <div className="time-node"><span className="dot"></span>+52s</div>
                  </div>
                  <div className="cluster-tagline">
                    Raw events preserved · Human operator reviews 1 comprehensive dossier
                  </div>
                </div>
              </div>
            </div>

            {/* Capability 3: Priority Intelligence */}
            <div className="capability-card">
              <div className="cap-header">
                <div className="cap-badge">CAPABILITY 03</div>
                <span className="cap-tag">TRIAGE INTELLIGENCE</span>
              </div>
              <h3 className="cap-title">Suggested Review Order — Priority Intelligence</h3>
              <p className="cap-desc">
                Help operators decide which unresolved issue to inspect next using transparent review rules and AI-assisted evidence. No black boxes: every rank details its exact rule triggers.
              </p>
              <div className="cap-visual-box">
                <div className="hud-mini-header">
                  <span>PRIORITY QUEUE</span>
                  <span className="hud-status-chip warning">RULE-BASED RANKING</span>
                </div>
                <div className="priority-list-mini">
                  <div className="priority-item p1">
                    <span className="p-rank">P1</span>
                    <div className="p-info">
                      <div className="p-title">Track TK-482 · Corridor Breach</div>
                      <div className="p-rules">Rule: Proximity to Restricted Zone &lt; 800m</div>
                    </div>
                    <span className="p-action">INSPECT</span>
                  </div>
                  <div className="priority-item p2">
                    <span className="p-rank">P2</span>
                    <div className="p-info">
                      <div className="p-title">Track SK-901 · Telemetry Dropout</div>
                      <div className="p-rules">Rule: Observation Gap &gt; 12s</div>
                    </div>
                    <span className="p-action">MONITOR</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Capability 4: AI Anomaly Detection */}
            <div className="capability-card">
              <div className="cap-header">
                <div className="cap-badge">CAPABILITY 04</div>
                <span className="cap-tag">MACHINE LEARNING</span>
              </div>
              <h3 className="cap-title">AI Anomaly Detection</h3>
              <p className="cap-desc">
                Use a locally executable machine-learning model to identify unusual telemetry patterns — such as uncharacteristic altitude drops, erratic turn rates, and velocity discontinuities.
              </p>
              <div className="cap-visual-box">
                <div className="hud-mini-header">
                  <span>ISOLATION ANOMALY MODEL</span>
                  <span className="hud-status-chip coral">EVALUATION ACTIVE</span>
                </div>
                <div className="anomaly-hud-mini">
                  <div className="anomaly-chart-sim">
                    <svg viewBox="0 0 280 60" className="mini-chart-svg" preserveAspectRatio="none">
                      <path d="M0,45 Q35,42 70,40 T140,38 T180,48 T210,12 T240,15 T280,30" fill="none" stroke="var(--coral)" strokeWidth="2" />
                      <circle cx="210" cy="12" r="4" fill="var(--coral)" className="pulse-point" />
                      <line x1="210" y1="12" x2="210" y2="55" stroke="var(--coral)" strokeDasharray="2 2" strokeOpacity="0.6" />
                    </svg>
                  </div>
                  <div className="anomaly-meta-bar">
                    <span>PEAK DEVIATION: <strong>0.89 SCORE</strong></span>
                    <span>FEATURE: <strong>VERTICAL SPEED ACCEL</strong></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Command Center Showcase */}
      <section className="section section-showcase" id="command-center">
        <div className="container">
          <div className="section-header">
            <span className="section-tag">INTERACTIVE SHOWCASE</span>
            <h2 className="section-title">One workspace. A clearer picture.</h2>
            <p className="section-lead">
              Explore the five core functional modules of the SATARK Command Center. Designed for high-clarity aerial evaluation without sensory overload.
            </p>
          </div>

          {/* Command Center Showcase Window */}
          <div className="command-showcase-window">
            <div className="terminal-bar">
              <div className="terminal-dots">
                <span className="dot-red"></span>
                <span className="dot-amber"></span>
                <span className="dot-green"></span>
              </div>
              <div className="terminal-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
                SATARK COMMAND CENTER v2.4 // WORKSPACE PREVIEW
              </div>
              <div className="terminal-right-status">
                <span className="env-badge">DEMO ENVIRONMENT</span>
              </div>
            </div>

            {/* Showcase Tab Controls */}
            <div className="showcase-tabs" role="tablist" aria-label="Command Center Regions">
              {(
                [
                  { id: 'tab-map', num: '01', label: 'Airspace Map' },
                  { id: 'tab-tracks', num: '02', label: 'Drone Tracks' },
                  { id: 'tab-attention', num: '03', label: 'Needs Attention' },
                  { id: 'tab-reliability', num: '04', label: 'Data Reliability' },
                  { id: 'tab-evidence', num: '05', label: 'Evidence / AI Test' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`tab-btn ${activeShowcaseTab === tab.id ? 'active' : ''}`}
                  role="tab"
                  aria-selected={activeShowcaseTab === tab.id}
                  onClick={() => setActiveShowcaseTab(tab.id)}
                >
                  <span className="tab-index">{tab.num}</span> {tab.label}
                </button>
              ))}
            </div>

            {/* Showcase Panes */}
            <div className="showcase-panes">
              {/* Tab 1: Airspace Map */}
              {activeShowcaseTab === 'tab-map' && (
                <div className="showcase-pane active" id="tab-map" role="tabpanel">
                  <div className="mockup-map-layout">
                    <div className="mock-map-canvas">
                      <svg className="tactical-grid-svg" viewBox="0 0 800 420" preserveAspectRatio="none">
                        <defs>
                          <pattern id="grid-pattern-show" width="40" height="40" patternUnits="userSpaceOnUse">
                            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                          </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#grid-pattern-show)" />

                        <circle cx="400" cy="210" r="180" fill="none" stroke="rgba(204,120,92,0.12)" strokeWidth="1" strokeDasharray="4 4" />
                        <circle cx="400" cy="210" r="100" fill="none" stroke="rgba(204,120,92,0.2)" strokeWidth="1" />
                        <circle cx="400" cy="210" r="3" fill="var(--coral)" />

                        {/* Restricted Airspace Polygon */}
                        <polygon points="480,110 620,130 670,240 540,260" fill="rgba(204,120,92,0.08)" stroke="rgba(204,120,92,0.5)" strokeWidth="1.5" strokeDasharray="5 3" />
                        <text x="530" y="180" fill="rgba(204,120,92,0.7)" fontFamily="JetBrains Mono" fontSize="11">RESTRICTED ZONE ALPHA</text>

                        {/* Drone Track 1 (Nominal) */}
                        <path d="M 120,320 Q 240,290 320,200" fill="none" stroke="rgba(74,222,128,0.7)" strokeWidth="2" strokeDasharray="4 2" />
                        <circle cx="320" cy="200" r="5" fill="#4ade80" />
                        <text x="330" y="196" fill="#f4f4f2" fontFamily="JetBrains Mono" fontSize="11">SK-102 [FL095 · 142kt]</text>

                        {/* Drone Track 2 (Under Inspection) */}
                        <path d="M 280,80 Q 380,130 460,180" fill="none" stroke="var(--coral)" strokeWidth="2.5" />
                        <circle cx="460" cy="180" r="6" fill="var(--coral)" className="radar-ping" />
                        <line x1="460" y1="180" x2="520" y2="210" stroke="var(--coral)" strokeDasharray="2 2" strokeWidth="1.5" />
                        <text x="472" y="172" fill="var(--coral)" fontFamily="JetBrains Mono" fontWeight="600" fontSize="12">TK-482 [ATTENTION REQUIRED]</text>

                        {/* Drone Track 3 (Transit) */}
                        <path d="M 600,340 L 490,290" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
                        <circle cx="490" cy="290" r="4" fill="rgba(255,255,255,0.7)" />
                        <text x="500" y="294" fill="rgba(255,255,255,0.6)" fontFamily="JetBrains Mono" fontSize="10">VX-204 [FL140]</text>
                      </svg>

                      <div className="map-hud-readouts">
                        <div className="readout-box">
                          <span className="label">ACTIVE SECTOR</span>
                          <span className="val">HIMALAYAN FOOTHILLS / GRID 7B</span>
                        </div>
                        <div className="readout-box">
                          <span className="label">AIRSPACE STATUS</span>
                          <span className="val coral-text">1 ISSUE UNRESOLVED</span>
                        </div>
                      </div>
                    </div>

                    {/* Map Sidebar Details */}
                    <div className="mock-sidebar">
                      <div className="sidebar-sec-title">SELECTED TRACK: TK-482</div>
                      <div className="sidebar-detail-card">
                        <div className="detail-row">
                          <span>CALLSIGN</span>
                          <span className="mono">TK-482</span>
                        </div>
                        <div className="detail-row">
                          <span>TRANSPONDER</span>
                          <span className="mono">SQ 4721 (MODE S)</span>
                        </div>
                        <div className="detail-row">
                          <span>ALTITUDE</span>
                          <span className="mono">2,850 m MSL</span>
                        </div>
                        <div className="detail-row">
                          <span>GROUNDSPEED</span>
                          <span className="mono">118 km/h</span>
                        </div>
                        <div className="detail-row">
                          <span>TRUST STATUS</span>
                          <span className="tag-badge nominal">CONFIRMED (94%)</span>
                        </div>
                        <div className="detail-row">
                          <span>AI ANOMALY</span>
                          <span className="tag-badge coral">0.82 (ELEVATED)</span>
                        </div>
                      </div>
                      <button type="button" className="btn-primary full-width" onClick={onEnter}>
                        Inspect Full Track Telemetry
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Drone Tracks */}
              {activeShowcaseTab === 'tab-tracks' && (
                <div className="showcase-pane active" id="tab-tracks" role="tabpanel">
                  <div className="mock-table-wrap">
                    <table className="mock-table">
                      <thead>
                        <tr>
                          <th>TRACK ID</th>
                          <th>TYPE</th>
                          <th>ALTITUDE</th>
                          <th>SPEED</th>
                          <th>HEADING</th>
                          <th>FRESHNESS</th>
                          <th>TRUST</th>
                          <th>STATUS</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="row-alert">
                          <td className="mono font-bold">TK-482</td>
                          <td>UAV Quad-Rotor</td>
                          <td className="mono">2,850 m</td>
                          <td className="mono">118 km/h</td>
                          <td className="mono">142° SE</td>
                          <td className="mono">0.2s</td>
                          <td><span className="tag-badge nominal">94% High</span></td>
                          <td><span className="tag-badge coral">Needs Review</span></td>
                        </tr>
                        <tr>
                          <td className="mono font-bold">SK-102</td>
                          <td>Fixed-Wing Recon</td>
                          <td className="mono">4,120 m</td>
                          <td className="mono">210 km/h</td>
                          <td className="mono">088° E</td>
                          <td className="mono">0.4s</td>
                          <td><span className="tag-badge nominal">98% High</span></td>
                          <td><span className="tag-badge green">Nominal</span></td>
                        </tr>
                        <tr>
                          <td className="mono font-bold">VX-204</td>
                          <td>Survey VTOL</td>
                          <td className="mono">1,450 m</td>
                          <td className="mono">84 km/h</td>
                          <td className="mono">260° W</td>
                          <td className="mono">0.6s</td>
                          <td><span className="tag-badge warning">82% Med</span></td>
                          <td><span className="tag-badge green">Nominal</span></td>
                        </tr>
                        <tr>
                          <td className="mono font-bold">DR-718</td>
                          <td>Cargo Drone</td>
                          <td className="mono">1,100 m</td>
                          <td className="mono">92 km/h</td>
                          <td className="mono">315° NW</td>
                          <td className="mono">1.1s</td>
                          <td><span className="tag-badge nominal">91% High</span></td>
                          <td><span className="tag-badge green">Nominal</span></td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="table-legend-footer">
                      <span>Displaying 4 active aerial tracks · Synthetic exercise data</span>
                      <span className="mono">Auto-refreshed: 100ms cycle</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Needs Attention */}
              {activeShowcaseTab === 'tab-attention' && (
                <div className="showcase-pane active" id="tab-attention" role="tabpanel">
                  <div className="mock-attention-layout">
                    <div className="attention-card urgent">
                      <div className="att-head">
                        <div className="att-priority p1">PRIORITY 1</div>
                        <div className="att-id">EVENT #EV-482 · TK-482</div>
                        <div className="att-time">14:48:10 UTC</div>
                      </div>
                      <div className="att-body">
                        <div className="att-title">Proximity Alert: Approach to Restricted Airspace Perimeter</div>
                        <p className="att-desc">
                          Combined trigger: Altitude descent rate exceeds normal corridor pattern (-8.4 m/s) while bearing directly towards Restricted Sector Alpha boundary (650m remaining).
                        </p>
                        <div className="att-evidence-tags">
                          <span className="tag">RULE #R-04: BOUNDARY PROXIMITY</span>
                          <span className="tag">AI ANOMALY SCORE: 0.82</span>
                          <span className="tag">CONSOLIDATED: 6 REDUNDANT PINGS MERGED</span>
                        </div>
                      </div>
                      <div className="att-actions">
                        <button type="button" className="btn-primary btn-sm" onClick={onEnter}>
                          Review Evidence &amp; Decide
                        </button>
                        <button type="button" className="btn-ghost btn-sm" onClick={onEnter}>
                          Defer (5m)
                        </button>
                      </div>
                    </div>

                    <div className="attention-card">
                      <div className="att-head">
                        <div className="att-priority p3">PRIORITY 3</div>
                        <div className="att-id">EVENT #EV-390 · VX-204</div>
                        <div className="att-time">14:46:25 UTC</div>
                      </div>
                      <div className="att-body">
                        <div className="att-title">Single Observation Dropout (Recovered)</div>
                        <p className="att-desc">
                          Telemetry gap of 4.2 seconds detected across ground receiver #02. Track has since re-established continuous beacon feed with low kinematic variance.
                        </p>
                        <div className="att-evidence-tags">
                          <span className="tag">TRUST STATUS: DEGRADED → RECOVERED</span>
                          <span className="tag">CATEGORY: SENSOR RELIABILITY</span>
                        </div>
                      </div>
                      <div className="att-actions">
                        <button type="button" className="btn-secondary btn-sm" onClick={onEnter}>
                          Dismiss Alert
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: Data Reliability */}
              {activeShowcaseTab === 'tab-reliability' && (
                <div className="showcase-pane active" id="tab-reliability" role="tabpanel">
                  <div className="mock-reliability-layout">
                    <div className="rel-card">
                      <div className="rel-head">
                        <span className="rel-track-title">DRONE TELEMETRY INTEGRITY AUDIT // TK-482</span>
                        <span className="rel-overall-badge font-green">94% TRUST SCORE</span>
                      </div>
                      <div className="rel-grid">
                        <div className="rel-item">
                          <div className="rel-item-title">Observation Freshness</div>
                          <div className="rel-val font-green">0.2s</div>
                          <div className="rel-sub">Age is well within the 1-second transmission window. Current telemetry accepted as active.</div>
                        </div>
                        <div className="rel-item">
                          <div className="rel-item-title">Kinematic Continuity</div>
                          <div className="rel-val font-green">3.4m Residual</div>
                          <div className="rel-sub">Low extrapolated coordinate divergence. Position curve matches physical physics model.</div>
                        </div>
                        <div className="rel-item">
                          <div className="rel-item-title">Packet Dropout History</div>
                          <div className="rel-val font-green">0 Dropped (60s)</div>
                          <div className="rel-sub">Unbroken observation stream received across primary receiver gateway.</div>
                        </div>
                        <div className="rel-item">
                          <div className="rel-item-title">Multi-Source Corroboration</div>
                          <div className="rel-val font-green">3 Receivers</div>
                          <div className="rel-sub">Independent spatial triangulation corroborates transponder reported altitude and course.</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 5: Evidence / AI Test */}
              {activeShowcaseTab === 'tab-evidence' && (
                <div className="showcase-pane active" id="tab-evidence" role="tabpanel">
                  <div className="mock-evidence-layout">
                    <div className="evidence-left">
                      <div className="evidence-header-block">
                        <span className="evidence-subtitle">ISOLATION FOREST FEATURE IMPORTANCE</span>
                        <h4>Model Telemetry Attribution</h4>
                      </div>
                      <div className="feature-waterfall">
                        <div className="f-row">
                          <span className="f-name">Vertical Velocity (Descent)</span>
                          <div className="f-bar-wrap"><div className="f-bar alert" style={{ width: '84%' }}></div></div>
                          <span className="f-pct">+0.38 impact</span>
                        </div>
                        <div className="f-row">
                          <span className="f-name">Turn Rate Variance</span>
                          <div className="f-bar-wrap"><div className="f-bar alert" style={{ width: '64%' }}></div></div>
                          <span className="f-pct">+0.22 impact</span>
                        </div>
                        <div className="f-row">
                          <span className="f-name">Groundspeed Acceleration</span>
                          <div className="f-bar-wrap"><div className="f-bar" style={{ width: '25%' }}></div></div>
                          <span className="f-pct">+0.07 impact</span>
                        </div>
                        <div className="f-row">
                          <span className="f-name">Altitude-to-Sector Envelope</span>
                          <div className="f-bar-wrap"><div className="f-bar alert" style={{ width: '70%' }}></div></div>
                          <span className="f-pct">+0.23 impact</span>
                        </div>
                      </div>
                    </div>

                    <div className="evidence-right">
                      <div className="evidence-header-block">
                        <span className="evidence-subtitle">RULE VS MODEL VERIFICATION</span>
                        <h4>Dual-Layer Validation Result</h4>
                      </div>
                      <div className="dual-check-card">
                        <div className="check-box rule">
                          <span className="check-type">DETERMINISTIC RULE LAYER</span>
                          <span className="check-status triggered">TRIGGERED</span>
                          <p className="check-explanation">Track breached Sector Alpha safety buffer (distance: 650m &lt; 800m threshold).</p>
                        </div>
                        <div className="check-box model">
                          <span className="check-type">LOCAL ML ANOMALY LAYER</span>
                          <span className="check-status scored">0.82 ANOMALY SCORE</span>
                          <p className="check-explanation">Descent trajectory matches non-standard rapid approach profile.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Terminal Footer Call-to-Action */}
            <div className="terminal-footer">
              <div className="tf-left">
                <span className="status-indicator"></span>
                <span>SATARK Interactive Simulation Workspace · Local Inference Ready</span>
              </div>
              <button type="button" className="btn-primary btn-sm" onClick={onEnter}>
                <span>Open Command Center</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Section 5: The Operational Pipeline */}
      <section className="section section-pipeline" id="how-it-works">
        <div className="container">
          <div className="section-header">
            <span className="section-tag">THE PIPELINE</span>
            <h2 className="section-title">From observation to informed review.</h2>
            <p className="section-lead">
              A four-stage operational sequence that moves raw radar, ADS-B, and drone telemetry through validation, clustering, and human review.
            </p>
          </div>

          <div className="pipeline-flow">
            {/* Step 1 */}
            <div className="pipeline-step">
              <div className="step-badge"><span className="step-num">01</span></div>
              <div className="step-connector"></div>
              <div className="step-body">
                <h3 className="step-title">Observe</h3>
                <p className="step-desc">
                  Monitor aerial tracks and incoming telemetry across distributed sensor streams. Ingest high-rate spatial and kinematic coordinates.
                </p>
                <div className="step-footer-tag">SENSOR INGESTION</div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="pipeline-step">
              <div className="step-badge"><span className="step-num">02</span></div>
              <div className="step-connector"></div>
              <div className="step-body">
                <h3 className="step-title">Verify</h3>
                <p className="step-desc">
                  Examine observation freshness, sensor consistency, and unusual kinematic anomalies before accepting positional updates as ground truth.
                </p>
                <div className="step-footer-tag">TRUST LENS AUDIT</div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="pipeline-step">
              <div className="step-badge"><span className="step-num">03</span></div>
              <div className="step-connector"></div>
              <div className="step-body">
                <h3 className="step-title">Organize</h3>
                <p className="step-desc">
                  Consolidate repeated alert bursts into structured, reviewable event dossiers without discarding underlying raw telemetry evidence.
                </p>
                <div className="step-footer-tag">EVENT DEDUPLICATION</div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="pipeline-step">
              <div className="step-badge"><span className="step-num">04</span></div>
              <div className="step-body">
                <h3 className="step-title">Review</h3>
                <p className="step-desc">
                  Inspect explainable evidence packages and execute human-in-the-loop decisions with transparent priority guidance.
                </p>
                <div className="step-footer-tag">HUMAN DECISION</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 6: AI Demonstration Micro-Bench */}
      <section className="section section-ai" id="ai-test">
        <div className="container">
          <div className="section-header">
            <span className="section-tag">EVALUATION BENCH</span>
            <h2 className="section-title">Don't just trust the AI. Test it.</h2>
            <p className="section-lead">
              SATARK allows controlled testing of unusual telemetry against a trained anomaly-detection model and rule-based checks. Test three synthetic scenarios below.
            </p>
          </div>

          <div className="ai-demo-card">
            <div className="ai-demo-nav">
              <div className="scenario-selector-label">SELECT TELEMETRY SCENARIO:</div>
              <div className="scenario-buttons">
                {(
                  [
                    { id: 'nominal', title: 'Scenario A: Nominal Patrol', badge: 'Standard Flight' },
                    { id: 'dropout', title: 'Scenario B: Telemetry Packet Glitch', badge: 'Data Issue' },
                    { id: 'incursion', title: 'Scenario C: Rapid Trajectory Divergence', badge: 'Anomaly' },
                  ] as const
                ).map((scen) => (
                  <button
                    key={scen.id}
                    type="button"
                    className={`scenario-btn ${activeScenario === scen.id ? 'active' : ''}`}
                    onClick={() => setActiveScenario(scen.id)}
                  >
                    <span className="scen-title">{scen.title}</span>
                    <span className="scen-badge">{scen.badge}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="ai-demo-body">
              {/* Left Column: Gauge & Telemetry */}
              <div className="ai-gauge-column">
                <div className="ai-card-heading">
                  <span>ISOLATION FOREST ANOMALY SCORE</span>
                  <span className="mono text-muted">LOCAL INFERENCE</span>
                </div>

                <div className="gauge-score-display">
                  <div className="score-num-wrap">
                    <span className="big-score" id="sim-score-val">{currentScen.score}</span>
                    <span className="score-max">/ 1.00</span>
                  </div>
                  <div className="score-interpretation font-bold" id="sim-score-rating">
                    {currentScen.rating}
                  </div>
                </div>

                <div className="score-bar-track">
                  <div
                    className="score-bar-fill"
                    id="sim-score-bar"
                    style={{ width: currentScen.barWidth, backgroundColor: currentScen.barColor }}
                  ></div>
                  <div className="score-threshold-marker" title="Anomaly Threshold (0.65)"></div>
                </div>
                <div className="score-scale">
                  <span>0.0 (Nominal)</span>
                  <span className="thresh-label">Threshold 0.65</span>
                  <span>1.0 (Severe)</span>
                </div>

                <div className="sim-attributes-grid">
                  <div className="sim-attr">
                    <span className="attr-name">TRACK ID</span>
                    <span className="attr-val mono">{currentScen.trackId}</span>
                  </div>
                  <div className="sim-attr">
                    <span className="attr-name">VERT SPEED</span>
                    <span className="attr-val mono">{currentScen.vspeed}</span>
                  </div>
                  <div className="sim-attr">
                    <span className="attr-name">TRUST SCORE</span>
                    <span className={`attr-val mono ${currentScen.trustClass}`}>{currentScen.trust}</span>
                  </div>
                  <div className="sim-attr">
                    <span className="attr-name">SENSOR AGE</span>
                    <span className="attr-val mono">{currentScen.age}</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Rule Comparison */}
              <div className="ai-logic-column">
                <div className="ai-card-heading">
                  <span>RULE-VERSUS-MODEL COMPARISON</span>
                  <span className="mono text-muted">DETERMINISTIC VERIFICATION</span>
                </div>

                <div className="rules-eval-box" id="sim-rules-box">
                  <div className={`rule-eval-row ${currentScen.ruleGeoPassed ? 'passed' : 'failed'}`}>
                    <div className="rule-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        {currentScen.ruleGeoPassed ? (
                          <polyline points="20 6 9 17 4 12" />
                        ) : (
                          <line x1="18" y1="6" x2="6" y2="18" />
                        )}
                      </svg>
                    </div>
                    <div className="rule-text">
                      <strong>Rule #R-01 — Airspace Clearance:</strong>
                      <span className="rule-desc">{currentScen.ruleGeoDesc}</span>
                    </div>
                  </div>

                  <div className={`rule-eval-row ${currentScen.ruleRatePassed ? 'passed' : 'failed'}`}>
                    <div className="rule-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        {currentScen.ruleRatePassed ? (
                          <polyline points="20 6 9 17 4 12" />
                        ) : (
                          <line x1="18" y1="6" x2="6" y2="18" />
                        )}
                      </svg>
                    </div>
                    <div className="rule-text">
                      <strong>Rule #R-02 — Kinematic Envelope:</strong>
                      <span className="rule-desc">{currentScen.ruleRateDesc}</span>
                    </div>
                  </div>

                  <div className={`rule-eval-row ${currentScen.ruleFreshnessPassed ? 'passed' : 'failed'}`}>
                    <div className="rule-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        {currentScen.ruleFreshnessPassed ? (
                          <polyline points="20 6 9 17 4 12" />
                        ) : (
                          <line x1="18" y1="6" x2="6" y2="18" />
                        )}
                      </svg>
                    </div>
                    <div className="rule-text">
                      <strong>Rule #R-03 — Telemetry Cadence:</strong>
                      <span className="rule-desc">{currentScen.ruleFreshnessDesc}</span>
                    </div>
                  </div>
                </div>

                {/* Review Recommendation */}
                <div className="review-recommendation-box" style={{ borderLeftColor: currentScen.recBorder }}>
                  <span className="rec-label">RECOMMENDED REVIEW ORDER:</span>
                  <span className="rec-value">{currentScen.recommendation}</span>
                </div>
              </div>
            </div>

            <div className="ai-demo-footer">
              <div className="ai-footer-note">
                <span>Local machine-learning inference executes in-browser / on-edge without sending raw video or telemetry off-premise.</span>
              </div>
              <button type="button" className="btn-primary" onClick={onEnter}>
                Explore AI Testing in Command Center
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Section 7: Final CTA */}
      <section className="section section-cta">
        <div className="container text-center">
          <div className="cta-box">
            <span className="section-tag">ACCESSIBLE DEMONSTRATION</span>
            <h2 className="cta-heading">A clearer view of the airspace starts here.</h2>
            <p className="cta-subtitle">
              Explore how SATARK helps turn incoming observations into understandable, reviewable information.
            </p>
            <div className="cta-buttons">
              <button type="button" className="btn-primary btn-large" onClick={onEnter}>
                <span>Access Command Center</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
              <a href="#capabilities" className="btn-secondary btn-large">Explore Capabilities</a>
            </div>
          </div>
        </div>
      </section>

      {/* Section 8: Footer */}
      <footer className="site-footer">
        <div className="container">
          <div className="footer-top">
            <div className="footer-brand">
              <div className="f-brand-title">
                <span className="brand-text">SATARK</span>
              </div>
              <p className="f-tagline">Airspace Monitoring &amp; Data Intelligence</p>
              <p className="f-desc">
                A technology demonstration platform built for telemetry validation, signal reliability assessment, and human-in-the-loop aerial event triage.
              </p>
            </div>

            <div className="footer-nav-col">
              <div className="f-col-title">Navigation</div>
              <ul className="f-links">
                <li><a href="#hero">Sky to Signal Hero</a></li>
                <li><a href="#problem">The Problem</a></li>
                <li><a href="#capabilities">Core Architecture</a></li>
                <li><a href="#command-center">Command Center</a></li>
                <li><a href="#how-it-works">Pipeline Stages</a></li>
                <li><a href="#ai-test">AI Testing Bench</a></li>
              </ul>
            </div>

            <div className="footer-nav-col">
              <div className="f-col-title">Platform Documentation</div>
              <ul className="f-links">
                <li><button type="button" onClick={() => nav('problem')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>Problem Statement</button></li>
                <li><button type="button" onClick={() => nav('features')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>Core Features</button></li>
                <li><button type="button" onClick={() => nav('demo')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>Judge Demo Guide</button></li>
                <li><button type="button" onClick={() => nav('docs')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>System Docs</button></li>
              </ul>
            </div>
          </div>

          {/* Transparency Disclosure */}
          <div className="footer-disclosure">
            <div className="disclosure-badge">DEMO DATA DISCLOSURE</div>
            <p>
              SATARK demonstrates airspace monitoring and data intelligence capabilities using synthesized exercise data for technical validation and concept demonstration. It is not connected to active military sensors, official armed forces networks, or live operational defense systems.
            </p>
          </div>

          <div className="footer-bottom">
            <div className="fb-copy">
              &copy; 2026 SATARK Project. Airspace Data Intelligence Platform.
            </div>
            <div className="fb-links">
              <button type="button" className="link-btn" onClick={onEnter}>Launch Console</button>
              <a href="#hero" className="back-to-top" aria-label="Back to top">
                Back to Top &uarr;
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Login & Demo Access Modal */}
      {modalOpen && (
        <div className="modal-backdrop" id="access-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-card">
            <button
              type="button"
              className="modal-close-btn"
              id="modal-close"
              aria-label="Close access modal"
              onClick={() => setModalOpen(false)}
            >
              &times;
            </button>

            <div className="modal-header">
              <div className="modal-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </div>
              <div>
                <h3 id="modal-title" className="modal-title">SATARK Command Center Access</h3>
                <p className="modal-subtitle">Authorized demonstration and evaluation environment</p>
              </div>
            </div>

            <div className="modal-body">
              <div className="access-mode-selector">
                <button
                  type="button"
                  className={`mode-btn ${accessMode === 'demo' ? 'active' : ''}`}
                  onClick={() => setAccessMode('demo')}
                >
                  <strong>Analyst Demo Access</strong>
                  <span>One-click launch with exercise telemetry</span>
                </button>
                <button
                  type="button"
                  className={`mode-btn ${accessMode === 'custom' ? 'active' : ''}`}
                  onClick={() => setAccessMode('custom')}
                >
                  <strong>Custom Endpoint</strong>
                  <span>Connect to standalone repository instance</span>
                </button>
              </div>

              <form id="access-form" className="modal-form" onSubmit={handleLaunchSession}>
                {accessMode === 'demo' ? (
                  <div className="form-group" id="demo-creds-group">
                    <label htmlFor="demo-role" className="form-label">OPERATOR PROFILE</label>
                    <input type="text" id="demo-role" className="form-input" value="AIRSPACE-ANALYST // TIER-1 DEMO" readOnly />
                    <span className="form-hint">Session initialized with simulated high-altitude drone scenario.</span>
                  </div>
                ) : (
                  <div className="form-group" id="custom-url-group">
                    <label htmlFor="custom-endpoint" className="form-label">COMMAND CENTER URL</label>
                    <input type="url" id="custom-endpoint" className="form-input" placeholder="http://localhost:5173" defaultValue="http://localhost:5173" />
                    <span className="form-hint">Provide existing SATARK Command Center host if running locally.</span>
                  </div>
                )}

                {isLoggingIn && (
                  <div className="auth-status-box" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: 'var(--bg-surface)', borderRadius: 6, margin: '10px 0' }}>
                    <span className="status-indicator"></span>
                    <span style={{ fontSize: 11, color: 'var(--coral)' }}>INITIALIZING OPERATIONAL CONSOLE...</span>
                  </div>
                )}

                <div className="modal-actions" style={{ marginTop: 14 }}>
                  <button type="submit" className="btn-primary full-width" id="launch-session-btn" disabled={isLoggingIn}>
                    <span>Launch Command Center Session</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </form>

              <div className="modal-notice">
                <strong>Notice:</strong> Launched sessions connect directly to the active SATARK Command Center runtime.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
