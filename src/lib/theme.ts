export type Theme = 'light' | 'dark' | 'system';
export type EffectiveTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'satark-theme';

export function getSystemTheme(): EffectiveTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function getSavedTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark' || saved === 'system') {
    return saved;
  }
  return 'dark'; // Default matches dark tactical reference
}

export function getEffectiveTheme(theme: Theme): EffectiveTheme {
  if (theme === 'system') return getSystemTheme();
  return theme;
}

export function applyTheme(theme: Theme): EffectiveTheme {
  const effective = getEffectiveTheme(theme);
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', effective);
    // Update theme-color meta tag for mobile browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', effective === 'dark' ? '#141413' : '#FAF9F5');
    }
  }
  return effective;
}

export function setTheme(theme: Theme): EffectiveTheme {
  if (typeof window !== 'undefined') {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    window.dispatchEvent(new CustomEvent('satark-theme-change', { detail: { theme } }));
  }
  return applyTheme(theme);
}

import { useState, useEffect } from 'react';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getSavedTheme);
  const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>(() => getEffectiveTheme(getSavedTheme()));

  useEffect(() => {
    // Initial sync
    const eff = applyTheme(theme);
    setEffectiveTheme(eff);

    // Listener for theme changes triggered within app
    const onThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ theme: Theme }>;
      const nextTheme = customEvent.detail?.theme || getSavedTheme();
      setThemeState(nextTheme);
      setEffectiveTheme(applyTheme(nextTheme));
    };

    // Listener for OS system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const onSystemChange = () => {
      if (getSavedTheme() === 'system') {
        setEffectiveTheme(applyTheme('system'));
      }
    };

    window.addEventListener('satark-theme-change', onThemeChange);
    mediaQuery.addEventListener('change', onSystemChange);

    return () => {
      window.removeEventListener('satark-theme-change', onThemeChange);
      mediaQuery.removeEventListener('change', onSystemChange);
    };
  }, [theme]);

  const updateTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    const eff = setTheme(newTheme);
    setEffectiveTheme(eff);
  };

  return {
    theme,
    effectiveTheme,
    setTheme: updateTheme,
  };
}

