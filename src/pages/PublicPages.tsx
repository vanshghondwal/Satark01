import type { ReactNode } from 'react';
import { ThemeSwitcher } from '../components/ThemeSwitcher';

export type PublicRoute = 'problem' | 'features' | 'demo' | 'docs' | 'privacy' | 'terms';

function TopNav({
  onHome,
  onLogin,
  onNavigate,
  hasSession,
  active,
}: {
  onHome: () => void;
  onLogin: () => void;
  onNavigate?: (r: PublicRoute) => void;
  hasSession: boolean;
  active: PublicRoute;
}) {
  const nav = onNavigate || (() => {});
  return (
    <header
      className="topnav"
      style={{
        borderBottom: '1px solid var(--border)',
        padding: '12px 24px',
        background: 'var(--surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <button
        type="button"
        onClick={onHome}
        style={{
          background: 'none',
          border: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: 0,
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--canvas)',
            border: '1px solid var(--border)',
            color: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: 14,
          }}
        >
          S
        </span>
        <strong className="brand-serif" style={{ fontSize: 18, color: 'var(--text-primary)' }}>SATARK</strong>
        <span className="chip" style={{ fontSize: 10, marginLeft: 4, background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent-border)' }}>
          AIRSPACE MONITORING · DEMO DATA
        </span>
      </button>

      <nav style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button
          type="button"
          className={`btn-ghost ${active === 'problem' ? 'active' : ''}`}
          onClick={() => nav('problem')}
          style={{ color: active === 'problem' ? 'var(--accent)' : 'var(--text-secondary)' }}
        >
          Problem
        </button>
        <button
          type="button"
          className={`btn-ghost ${active === 'features' ? 'active' : ''}`}
          onClick={() => nav('features')}
          style={{ color: active === 'features' ? 'var(--accent)' : 'var(--text-secondary)' }}
        >
          Features
        </button>
        <button
          type="button"
          className={`btn-ghost ${active === 'demo' ? 'active' : ''}`}
          onClick={() => nav('demo')}
          style={{ color: active === 'demo' ? 'var(--accent)' : 'var(--text-secondary)' }}
        >
          Judge Demo
        </button>
        <button
          type="button"
          className={`btn-ghost ${active === 'docs' ? 'active' : ''}`}
          onClick={() => nav('docs')}
          style={{ color: active === 'docs' ? 'var(--accent)' : 'var(--text-secondary)' }}
        >
          Docs
        </button>
        <ThemeSwitcher />
        <button
          type="button"
          className="btn-coral"
          style={{ marginLeft: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600 }}
          onClick={onLogin}
        >
          {hasSession ? 'Open Command Center' : 'Open Demo'}
        </button>
      </nav>
    </header>
  );
}

function Shell({
  title,
  eyebrow,
  children,
  onHome,
  onLogin,
  onNavigate,
  hasSession,
  active,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
  onHome: () => void;
  onLogin: () => void;
  onNavigate?: (r: PublicRoute) => void;
  hasSession: boolean;
  active: PublicRoute;
}) {
  const nav = onNavigate || (() => {});
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--canvas)' }}>
      <TopNav onHome={onHome} onLogin={onLogin} onNavigate={onNavigate} hasSession={hasSession} active={active} />
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px 80px', flex: 1, width: '100%' }}>
        <p className="eyebrow" style={{ color: 'var(--cyan)', marginBottom: 8 }}>
          {eyebrow}
        </p>
        <h1
          style={{
            fontSize: 32,
            letterSpacing: '-0.5px',
            fontWeight: 700,
            margin: '0 0 24px',
            color: 'var(--text-primary)',
          }}
        >
          {title}
        </h1>
        {children}
        <footer
          style={{
            borderTop: '1px solid var(--border)',
            marginTop: 48,
            paddingTop: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            color: 'var(--text-muted)',
            fontSize: 12,
          }}
        >
          <span>SATARK: Unofficial Simulated Drone-Monitoring &amp; Evidence-Review Platform.</span>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => nav('privacy')}
              style={{ background: 'none', border: 0, color: 'var(--text-secondary)', cursor: 'pointer', padding: 0, fontSize: 12 }}
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => nav('terms')}
              style={{ background: 'none', border: 0, color: 'var(--text-secondary)', cursor: 'pointer', padding: 0, fontSize: 12 }}
            >
              Terms of Use
            </button>
            <button
              type="button"
              onClick={onHome}
              style={{ background: 'none', border: 0, color: 'var(--cyan)', cursor: 'pointer', padding: 0, fontSize: 12 }}
            >
              Return Home
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}

const P = ({ children, style }: { children: ReactNode; style?: React.CSSProperties }) => (
  <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: '24px', margin: '0 0 16px', ...style }}>
    {children}
  </p>
);

export function ProblemPage(props: { onHome: () => void; onLogin: () => void; hasSession: boolean; onNavigate?: (r: PublicRoute) => void }) {
  return (
    <Shell {...props} active="problem" eyebrow="Problem Analysis" title="Why Drone Monitoring Needs Verifiable AI">
      <P>
        Plotting markers on a dark canvas is trivial. What an operator truly requires during high-tempo monitoring is a reliable basis to trust what appears on screen: distinguishing actual drone movements from sensor transmission delay, inspecting why an algorithm flagged an anomaly, and consolidating repeated warnings.
      </P>

      <div style={{ display: 'grid', gap: 14, marginTop: 20 }}>
        {[
          [
            'The Operator Challenge',
            'Airspace operators must maintain continuous situational awareness without being overwhelmed by noisy, repeated sensor glitches.',
          ],
          [
            'The Data Problem',
            'Packet latency, clock drift, and dropped packets cause drones to appear stale or teleport across boundaries. Operators often cannot distinguish a faulty sensor from a restricted airspace intrusion.',
          ],
          [
            'The Trust Deficit in AI',
            'Generic machine learning dashboards output opaque anomaly percentages without explaining the decision boundary or comparing against deterministic safety rules.',
          ],
          [
            'The SATARK Solution',
            'SATARK bridges this gap with Trust Lens (data freshness and consistency scoring), Mission Focus (grouping repeated warnings without losing underlying records), and Test the AI (side-by-side rule vs ML comparison).',
          ],
        ].map(([title, desc]) => (
          <div className="card" key={title} style={{ padding: 16 }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 15, color: 'var(--text-primary)' }}>{title}</h3>
            <P>{desc}</P>
          </div>
        ))}
      </div>
    </Shell>
  );
}

export function FeaturesPage(props: { onHome: () => void; onLogin: () => void; hasSession: boolean; onNavigate?: (r: PublicRoute) => void }) {
  return (
    <Shell {...props} active="features" eyebrow="Platform Capabilities" title="Features Designed for Ground-Truth Monitoring & Audit">
      <div style={{ display: 'grid', gap: 14, marginTop: 20 }}>
        {[
          [
            'Tactical Map & 2.5D View',
            'Shows where simulated drones are flying with clear zones, headings, and altitude trails.',
            'Wide rectangular tactical monitoring map with coordinate grid, directional UAV airframe markers, historical movement trails, and 5s-15s predicted trajectories. Includes an optional 2.5D Tactical perspective view with vertical altitude stems. Operates 100% offline with zero remote map tile dependencies.',
          ],
          [
            'Coverage Watch',
            'Shows which drones have recent data and which need checking.',
            'Continuous monitoring-data availability matrix categorizing all monitored drones into Current Data (fresh telemetry), Delayed Data, or No Recent Data (stale). Allows instant inspection and direct "View on Map" centering.',
          ],
          [
            'Suggested Review Order',
            'Shows which warning should be reviewed first.',
            'Priority Intelligence queue transparently sequences simultaneous warnings based on safety severity, operational exposure, data validity, and age. Explains the exact reasoning for each position.',
          ],
          [
            'Mission Focus',
            'Consolidates repeated alerts to prevent fatigue without losing raw records.',
            'Aggregates repeated warnings into unified incident cards while preserving the complete chronological event ledger, preventing operator cognitive overload during ongoing incidents.',
          ],
          [
            'Data Reliability / Trust Lens',
            'Shows whether received data is recent and consistent before taking action.',
            'Real-time data quality evaluation that reports observation age, latency, packet loss, and spatial residuals. Drones with stale data have their predictive trajectories suspended to prevent false assumptions.',
          ],
          [
            'Test the AI',
            'Compare how AI and rule checks respond to unusual drone data.',
            'Empowers operators to inject synthetic faults (latency, packet gaps, coordinate jumps) into the live ingestion pipeline, comparing Scikit-Learn Isolation Forest against deterministic rules on identical feature vectors.',
          ],
          [
            'Replay an Incident',
            'See what happened before an alert appeared.',
            'Inspect past temporal snapshots and reconstruct flight corridors before an alert occurred, without interrupting or altering live simulation state.',
          ],
          [
            'Audit Report Generation',
            'Export verifiable mission records for post-flight inspection.',
            'Download verifiable JSON audit packages containing all drone states, telemetry events, ML scores, and review histories for post-mission inspection.',
          ],
        ].map(([title, subtitle, desc]) => (
          <div className="card" key={title} style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>{title}</h3>
              <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 500 }}>{subtitle}</span>
            </div>
            <P style={{ margin: 0 }}>{desc}</P>
          </div>
        ))}
      </div>
    </Shell>
  );
}

export function DemoPage(props: { onHome: () => void; onLogin: () => void; hasSession: boolean; onNavigate?: (r: PublicRoute) => void }) {
  return (
    <Shell {...props} active="demo" eyebrow="Demonstration Guide" title="5-Minute Evaluator Walkthrough Protocol">
      <P>
        SATARK is structured so an evaluator or judge can verify all three core capabilities within five minutes:
      </P>

      <ol style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: '28px', paddingLeft: 20, margin: '16px 0' }}>
        <li>
          <b>1. Start the Live Map:</b> Enter demo credentials, click Start, and observe live drones moving with heading chevrons across the synthetic exercise grid.
        </li>
        <li>
          <b>2. Trigger Restricted Area Warning:</b> Switch scenario to <code>Restricted Area Alert (T-04)</code>. Drone enters Exercise Zone Alpha, generating an Important Review item in the Needs Attention panel. Click Review Evidence, then click <i>Mark Reviewed</i>.
        </li>
        <li>
          <b>3. Verify Data Reliability (Trust Lens):</b> Switch scenario to <code>Missing Updates (T-03)</code>. Observe that T-03 is flagged as Data Unreliable, and its predicted trajectory is safely suspended.
        </li>
        <li>
          <b>4. Test the AI:</b> Open <i>Test the AI</i>, inject a delayed update or position error, inspect the 10-step pipeline trace, and compare deterministic rules with Isolation Forest.
        </li>
        <li>
          <b>5. Replay and Persist:</b> Open Replay to inspect past snapshots without affecting live state. Reload the page to verify your review dispositions remain saved in local storage.
        </li>
      </ol>
    </Shell>
  );
}

export function DocsPage(props: { onHome: () => void; onLogin: () => void; hasSession: boolean; onNavigate?: (r: PublicRoute) => void }) {
  return (
    <Shell {...props} active="docs" eyebrow="Technical Architecture" title="System Documentation & Operational Limitations">
      <h2 style={{ fontSize: 18, color: 'var(--text-primary)', margin: '16px 0 8px' }}>Local Verification Commands</h2>
      <pre className="card mono" style={{ fontSize: 12, padding: 12, overflowX: 'auto', background: 'var(--canvas)' }}>
{`# 1. Run all unit & parity tests (19 tests)
npm test

# 2. Typecheck & build production bundle
npm run build

# 3. Start local development server
npm run dev`}
      </pre>

      <h2 style={{ fontSize: 18, color: 'var(--text-primary)', margin: '20px 0 8px' }}>Machine Learning Model Details</h2>
      <P>
        SATARK uses an Isolation Forest model trained with scikit-learn on synthetic telemetry vectors. The client evaluator executes the decision function in pure JavaScript with verified numerical parity against Python (max difference &lt; 0.0001).
      </P>
      <P>
        <b>Feature Order:</b> <code>[gap_s, age_at_receipt_s, missing_recent, speed_change_mps, residual_units]</code>. The model flags anomalous data patterns for human review; it does not assign hostile military classifications.
      </P>

      <h2 style={{ fontSize: 18, color: 'var(--text-primary)', margin: '20px 0 8px' }}>Explicit System Limitations</h2>
      <ul style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: '22px', paddingLeft: 18 }}>
        <li><b>Simulation Scope:</b> All coordinates and flight tracks are synthetic training data. No connection to real radar systems or live military airspace feeds exists.</li>
        <li><b>Demonstration Authentication:</b> The login interface is client-side demo gating for evaluation workflows. It does not provide government or military identity authorization.</li>
        <li><b>Data Privacy:</b> All review actions and telemetry calculations remain entirely in browser local storage. Nothing is transmitted to external servers.</li>
        <li><b>Offline Architecture:</b> Operates completely without remote tile servers, external CDNs, or web fonts.</li>
      </ul>
    </Shell>
  );
}

export function PrivacyPage(props: { onHome: () => void; onLogin: () => void; hasSession: boolean; onNavigate?: (r: PublicRoute) => void }) {
  return (
    <Shell {...props} active="privacy" eyebrow="Legal & Privacy Disclosures" title="Privacy Policy">
      <div className="card" style={{ padding: 16, marginBottom: 16, background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
        <b style={{ color: 'var(--cyan)' }}>Notice:</b> SATARK is an unofficial simulated training and demonstration platform. It does not monitor real-world airspace and collects no classified or military intelligence data.
      </div>

      <h2 style={{ fontSize: 16, color: 'var(--text-primary)', margin: '16px 0 8px' }}>1. Local Storage Usage</h2>
      <P>
        SATARK operates primarily client-side. The application utilizes the browser&apos;s <code>sessionStorage</code> to manage demo session state and <code>localStorage</code> to persist operator review dispositions and interface preferences. No personal tracking cookies, marketing beacons, or third-party analytics scripts are embedded or executed.
      </P>

      <h2 style={{ fontSize: 16, color: 'var(--text-primary)', margin: '16px 0 8px' }}>2. Data Collection and Retention</h2>
      <P>
        No telemetry, coordinates, drone updates, or operator notes leave your device. All calculations, including Scikit-Learn Isolation Forest anomaly evaluation, are executed locally within the browser JavaScript runtime. Generated JSON reports are downloaded directly to your local file system via browser memory blobs.
      </P>

      <h2 style={{ fontSize: 16, color: 'var(--text-primary)', margin: '16px 0 8px' }}>3. Data Deletion</h2>
      <P>
        Operators may erase all stored review dispositions and session records at any time by clearing their browser cache/storage or using the browser developer tools to clear <code>localStorage.removeItem(&apos;satark-reviews-v1&apos;)</code>.
      </P>

      <h2 style={{ fontSize: 16, color: 'var(--text-primary)', margin: '16px 0 8px' }}>4. Operator Contact Information</h2>
      <P style={{ color: 'var(--text-muted)' }}>
        [TODO: Operator / Maintainer legal entity name, jurisdiction, and official contact email to be supplied by the repository owner prior to public production release. This is a launch blocker for public compliance.]
      </P>
    </Shell>
  );
}

export function TermsPage(props: { onHome: () => void; onLogin: () => void; hasSession: boolean; onNavigate?: (r: PublicRoute) => void }) {
  return (
    <Shell {...props} active="terms" eyebrow="Permitted Use & Terms" title="Terms of Use">
      <div className="card" style={{ padding: 16, marginBottom: 16, background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
        <b style={{ color: 'var(--warning)' }}>Simulation & Demonstration Use Only:</b> This software is provided exclusively for evaluation, research, and technical demonstrations.
      </div>

      <h2 style={{ fontSize: 16, color: 'var(--text-primary)', margin: '16px 0 8px' }}>1. Unofficial Demonstration Platform</h2>
      <P>
        SATARK is not affiliated with, endorsed by, or authorized by the Indian Army, the Ministry of Defence, or any governmental or defense agency. The public demonstration credentials provide evaluation access to simulated scenarios only and do not convey any official authority or security clearance.
      </P>

      <h2 style={{ fontSize: 16, color: 'var(--text-primary)', margin: '16px 0 8px' }}>2. Synthetic Airspace Data</h2>
      <P>
        All radar tracks, flight trajectories, and restricted zones are synthetic mathematical models generated locally via pseudo-random number generators. They must not be utilized for real-world navigation, air traffic management, or tactical defense decision-making.
      </P>

      <h2 style={{ fontSize: 16, color: 'var(--text-primary)', margin: '16px 0 8px' }}>3. Disclaimer of Warranty</h2>
      <P>
        The software is provided &quot;as is&quot;, without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement.
      </P>

      <h2 style={{ fontSize: 16, color: 'var(--text-primary)', margin: '16px 0 8px' }}>4. Ownership and Attributions</h2>
      <P style={{ color: 'var(--text-muted)' }}>
        [TODO: Registered copyright owner details, license designation (e.g. MIT / Apache 2.0 / Proprietary Hackathon Evaluation), and custom domain configuration to be designated by repository owner.]
      </P>
    </Shell>
  );
}
