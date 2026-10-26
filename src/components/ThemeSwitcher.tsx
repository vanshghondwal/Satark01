import { useState, useRef, useEffect } from 'react';
import { useTheme, type Theme } from '../lib/theme';

export function ThemeSwitcher() {
  const { theme, effectiveTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="btn-ghost"
        style={{
          padding: '5px 9px',
          fontSize: 12,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          borderRadius: 'var(--radius-sm)',
        }}
        onClick={() => setOpen(!open)}
        title={`Current theme: ${theme} (${effectiveTheme} active)`}
        aria-label="Toggle Theme Menu"
        aria-expanded={open}
      >
        {/* Render Sun or Moon SVG Icon */}
        {effectiveTheme === 'light' ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
        <span style={{ textTransform: 'capitalize' }}>{theme}</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            width: 140,
            background: 'var(--surface)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-md)',
            zIndex: 60,
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
          role="menu"
        >
          {(['light', 'dark', 'system'] as Theme[]).map((t) => (
            <button
              key={t}
              type="button"
              role="menuitem"
              className={`btn-ghost ${theme === t ? 'active' : ''}`}
              style={{
                width: '100%',
                justifyContent: 'flex-start',
                padding: '6px 10px',
                fontSize: 12,
                border: 'none',
                background: theme === t ? 'var(--elevated)' : 'transparent',
                color: theme === t ? 'var(--accent)' : 'var(--text-primary)',
                fontWeight: theme === t ? 600 : 400,
              }}
              onClick={() => {
                setTheme(t);
                setOpen(false);
              }}
            >
              {t === 'light' && 'Light Mode'}
              {t === 'dark' && 'Dark Mode'}
              {t === 'system' && 'System (OS)'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
