import { useEffect, useState } from 'react';

/**
 * Chat mode switch: Standard (reproducible pipeline) vs Explore (agentic, multi-step).
 * Stores the choice in localStorage under 'geneie_exploratory_mode' ('on' | absent), which
 * useChatMessaging reads when routing a turn.
 *
 * Deliberately quiet + self-contained: a small segmented control that reads as a product
 * feature, not a debug affordance. Themed to the app (uses the shared CSS vars).
 */
const KEY = 'geneie_exploratory_mode';

export default function ExploratoryModeToggle() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(window.localStorage?.getItem(KEY) === 'on');
  }, []);

  const set = (next) => {
    setOn(next);
    if (next) window.localStorage.setItem(KEY, 'on');
    else window.localStorage.removeItem(KEY);
  };

  const seg = (active) => ({
    padding: '4px 10px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    font: '500 12px -apple-system, system-ui, sans-serif',
    background: active ? 'hsl(var(--background))' : 'transparent',
    color: active ? 'hsl(var(--foreground, var(--card-foreground)))' : 'hsl(var(--muted-foreground))',
    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.15)' : 'none',
    transition: 'background .15s',
  });

  return (
    <div
      title="Standard: fast, reproducible answers. Explore: an agent reasons across your data in multiple steps (slower, shows its work)."
      style={{
        position: 'fixed', bottom: 14, right: 14, zIndex: 9999,
        display: 'inline-flex', gap: 2, padding: 3, borderRadius: 8,
        background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))',
      }}
    >
      <button style={seg(!on)} onClick={() => set(false)}>Standard</button>
      <button style={seg(on)} onClick={() => set(true)}>Explore</button>
    </div>
  );
}
