import { useState } from 'react';
import type { PublicRoute } from './PublicPages';
import { ThemeSwitcher } from '../components/ThemeSwitcher';

export const DEMO_USER = 'SATARK-DEMO-001';
export const DEMO_PASS = 'SatarkDemo@2026!';

export function LoginPage({
  onLogin,
  onHome,
  onNavigate,
}: {
  onLogin: () => void;
  onHome: () => void;
  onNavigate?: (r: PublicRoute) => void;
}) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const nav = onNavigate || (() => {});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user.trim() || !pass) {
      setErr('Please enter both User ID and Password.');
      return;
    }

    setLoading(true);
    setErr('');

    setTimeout(() => {
      if (user.trim() === DEMO_USER && pass === DEMO_PASS) {
        sessionStorage.setItem('satark-session', 'demo');
        onLogin();
      } else {
        setLoading(false);
        setErr('Invalid credentials. Please click "Autofill Demo Credentials" below for the evaluation session.');
      }
    }, 200);
  };

  const handleFillDemo = () => {
    setUser(DEMO_USER);
    setPass(DEMO_PASS);
    setErr('');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--canvas)' }}>
      {/* Top Header */}
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
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="chip" style={{ fontSize: 11, background: 'var(--elevated)', color: 'var(--text-muted)' }}>
            DEMO EVALUATION GATE
          </span>
          <ThemeSwitcher />
        </div>
      </header>

      {/* Centered Login Card */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <p className="eyebrow" style={{ margin: 0, color: 'var(--cyan)' }}>DEMO ACCESS</p>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: '6px 0 8px', letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>
              Operator Authentication
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
              Evaluation access for simulated drone-monitoring session
            </p>
          </div>

          <form
            onSubmit={submit}
            className="card"
            style={{
              padding: 24,
              background: 'var(--surface)',
              border: '1px solid var(--border-strong)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', display: 'block', marginBottom: 6 }}>
                Operator ID
              </label>
              <input
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. SATARK-DEMO-001"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  style={{ background: 'none', border: 0, color: 'var(--cyan)', cursor: 'pointer', fontSize: 12 }}
                >
                  {show ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                className="input"
                type={show ? 'text' : 'password'}
                style={{ width: '100%' }}
                placeholder="Enter password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
              />
            </div>

            {err && (
              <div
                role="alert"
                style={{
                  background: 'var(--error-surface)',
                  border: '1px solid var(--error-border)',
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontSize: 12,
                  color: '#F87171',
                }}
              >
                {err}
              </div>
            )}

            <button
              type="submit"
              className="btn-coral"
              disabled={loading}
              style={{ padding: '10px', fontSize: 14, fontWeight: 600, width: '100%' }}
            >
              {loading ? 'Authenticating...' : 'Enter Operational Workspace'}
            </button>

            <button
              type="button"
              className="btn-ghost"
              onClick={handleFillDemo}
              style={{ padding: '8px', fontSize: 13, width: '100%' }}
            >
              Autofill Demo Credentials
            </button>
          </form>

          {/* Demo Credentials Disclaimer Card */}
          <div
            className="card"
            style={{
              marginTop: 16,
              padding: 14,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              fontSize: 12,
              color: 'var(--text-muted)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: 'var(--cyan)' }}>
              <span className="mono" style={{ fontWeight: 600 }}>DEMONSTRATION ACCOUNT CREDENTIALS</span>
            </div>
            <div className="mono" style={{ background: 'var(--canvas)', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              User ID: <b style={{ color: 'var(--text-primary)' }}>{DEMO_USER}</b><br />
              Password: <b style={{ color: 'var(--text-primary)' }}>{DEMO_PASS}</b><br />
              Role: Simulation Operator (Demo Evaluation)
            </div>
            <p style={{ margin: '10px 0 0', lineHeight: 1.5 }}>
              This login provides client-side access to simulated demonstration scenarios. It does not verify or imply military identity or government authorization. All data is processed locally.
            </p>
          </div>
        </div>
      </main>

      {/* Global Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border)',
          background: 'var(--surface)',
          padding: '16px 24px',
          color: 'var(--text-muted)',
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <span>SATARK: Unofficial Simulated Drone-Monitoring &amp; Evidence-Review Platform.</span>
        <div style={{ display: 'flex', gap: 16 }}>
          <button type="button" onClick={() => nav('privacy')} style={{ background: 'none', border: 0, color: 'var(--text-secondary)', cursor: 'pointer', padding: 0, fontSize: 12 }}>
            Privacy Policy
          </button>
          <button type="button" onClick={() => nav('terms')} style={{ background: 'none', border: 0, color: 'var(--text-secondary)', cursor: 'pointer', padding: 0, fontSize: 12 }}>
            Terms of Use
          </button>
          <button type="button" onClick={onHome} style={{ background: 'none', border: 0, color: 'var(--cyan)', cursor: 'pointer', padding: 0, fontSize: 12 }}>
            Return Home
          </button>
        </div>
      </footer>
    </div>
  );
}
