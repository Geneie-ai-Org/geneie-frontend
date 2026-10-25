import React from 'react';
import { flushSync } from 'react-dom';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

/**
 * Light/dark switch for the public pages. Where the View Transitions API exists, the new
 * theme is revealed as a circle growing out of the button; otherwise (or with reduced
 * motion) the theme just flips.
 */
export default function ThemeToggle({ className = '' }) {
  const { isDark, toggleTheme } = useTheme();

  const onClick = (e) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof document.startViewTransition !== 'function') {
      toggleTheme();
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

    const transition = document.startViewTransition(() => {
      flushSync(toggleTheme);
      // The provider syncs the class in an effect; set it now so the "after" snapshot is themed.
      document.documentElement.classList.toggle('dark', !isDark);
    });
    transition.ready
      .then(() =>
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 450, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' }
        )
      )
      .catch(() => {});
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-[hsl(var(--wb-pill))] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500))] sm:h-9 sm:w-9 ${className}`}
    >
      {isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}
