import React from 'react';
// A crash during judging must never blank the whole app. This boundary
// catches a render error, shows a recoverable message, and lets the
// operator reload to a clean Command Center instead of a white screen.
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('SATARK render error:', error); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ maxWidth: 560, margin: '64px auto', padding: 24 }}>
          <p className="eyebrow">Something went wrong: simulation data is not affected</p>
          <h1 style={{ fontSize: 28 }}>The view crashed, the app did not.</h1>
          <p style={{ color: 'var(--body)', fontSize: 14 }}>{this.state.error.message}</p>
          <button type="button" className="btn-sm" onClick={() => window.location.reload()}>Reload SATARK</button>
        </div>
      );
    }
    return this.props.children;
  }
}
