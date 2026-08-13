import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Theme state for the app shell.
 *
 * Dark is the shipped look and stays the default — light mode is opt-in and is being
 * migrated component by component. The active theme is the `dark` class on <html>
 * (tailwind.config.js runs `darkMode: ['class']`), so every `dark:` utility and the
 * `.dark` token block in index.css switch off the same flag.
 *
 * The initial class is set by the inline script in index.html to avoid a flash of the
 * wrong theme before React mounts; this hook keeps it in sync afterwards.
 */
export const THEME_STORAGE_KEY = 'geneie-theme';
const DEFAULT_THEME = 'dark';

const ThemeContext = createContext(null);

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStoredTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Private browsing / storage disabled — theme still applies for this session.
    }
  }, [theme]);

  const setTheme = useCallback((next) => {
    setThemeState(next === 'light' ? 'light' : 'dark');
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo(
    () => ({ theme, isDark: theme === 'dark', setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme]
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
