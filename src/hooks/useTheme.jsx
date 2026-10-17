import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Theme state for the app shell.
 *
 * Dark is the shipped look and stays the default — light mode is opt-in and is being
 * migrated component by component. The active theme is the `dark` class on <html>
 * (tailwind.config.js runs `darkMode: ['class']`), so every `dark:` utility and the
 * `.dark` token block in index.css switch off the same flag.
 *
 * The stored value is the user's preference ('system' | 'light' | 'dark'); `theme` is what
 * it resolves to right now. The initial class is set by the inline script in index.html to
 * avoid a flash of the wrong theme before React mounts; this hook keeps it in sync afterwards.
 */
export const THEME_STORAGE_KEY = 'geneie-theme';
const DEFAULT_PREFERENCE = 'dark';
const PREFERENCES = new Set(['system', 'light', 'dark']);

const ThemeContext = createContext(null);

/** What the user chose: 'system' follows the OS, 'light' / 'dark' pin it. */
function readStoredPreference() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return PREFERENCES.has(stored) ? stored : DEFAULT_PREFERENCE;
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

function systemTheme() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(readStoredPreference);
  const [systemValue, setSystemValue] = useState(systemTheme);

  // Track OS changes; only matters while the preference is 'system'.
  useEffect(() => {
    const mql = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!mql) return undefined;
    const onChange = () => setSystemValue(mql.matches ? 'light' : 'dark');
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);

  const theme = preference === 'system' ? systemValue : preference;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Private browsing / storage disabled — theme still applies for this session.
    }
  }, [preference]);

  const setPreference = useCallback((next) => {
    setPreferenceState(PREFERENCES.has(next) ? next : DEFAULT_PREFERENCE);
  }, []);

  const setTheme = useCallback((next) => {
    setPreferenceState(next === 'light' ? 'light' : 'dark');
  }, []);

  const toggleTheme = useCallback(() => {
    setPreferenceState(theme === 'dark' ? 'light' : 'dark');
  }, [theme]);

  const value = useMemo(
    () => ({ theme, isDark: theme === 'dark', preference, setPreference, setTheme, toggleTheme }),
    [theme, preference, setPreference, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}

/**
 * Pin a route to one theme regardless of the user's choice, and restore that choice on
 * unmount. Light mode is being rolled out inside the app first — marketing and auth
 * pages still carry hardcoded dark colors, so they force dark until they're migrated.
 */
export function useForcedTheme(forced = 'dark') {
  const { theme } = useTheme();
  useEffect(() => {
    document.documentElement.classList.toggle('dark', forced === 'dark');
    return () => {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    };
  }, [forced, theme]);
}
