import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Chat mode switch: Standard (reproducible pipeline) vs Explore (agentic, multi-step).
 * Stores the choice in localStorage under 'geneie_exploratory_mode' ('on' | absent), which
 * useChatMessaging reads when routing a turn.
 *
 * Two presentations of the same control:
 *  - variant="inline"   a compact segmented control that sits inside the composer toolbar.
 *  - variant="floating" the original fixed bottom-right pill (default, unchanged behaviour).
 *
 * When an inline instance is mounted (the composer renders one), the floating instance hides
 * itself, so the page never shows two switches and the lead can drop the floating mount whenever
 * it suits. All instances stay in sync through a custom event plus the `storage` event.
 */
const KEY = 'geneie_exploratory_mode';
const EVENT = 'geneie:exploratory-mode';

const TITLE =
  'Standard: fast, reproducible answers. Explore: an agent reasons across your data in multiple steps (slower, shows its work).';

function readOn() {
  try {
    return window.localStorage?.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

/* Count of mounted inline instances, so the floating one can step aside. */
let inlineCount = 0;
const inlineListeners = new Set();
const subscribeInline = (cb) => {
  inlineListeners.add(cb);
  return () => inlineListeners.delete(cb);
};
const getInlineCount = () => inlineCount;
const bumpInline = (delta) => {
  inlineCount += delta;
  inlineListeners.forEach((cb) => cb());
};

export default function ExploratoryModeToggle({ variant = 'floating', className = '' }) {
  const [on, setOn] = useState(false);
  const hasInline = useSyncExternalStore(subscribeInline, getInlineCount, () => 0);

  useEffect(() => {
    setOn(readOn());
    const sync = () => setOn(readOn());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    if (variant !== 'inline') return undefined;
    bumpInline(1);
    return () => bumpInline(-1);
  }, [variant]);

  const set = (next) => {
    setOn(next);
    try {
      if (next) window.localStorage.setItem(KEY, 'on');
      else window.localStorage.removeItem(KEY);
    } catch {
      /* storage blocked: the choice still applies to this view */
    }
    window.dispatchEvent(new Event(EVENT));
  };

  const isInline = variant === 'inline';
  if (!isInline && hasInline > 0) return null;

  const seg = (active) =>
    [
      'inline-flex items-center justify-center rounded-[6px] px-2.5 text-xs font-medium whitespace-nowrap transition-colors',
      isInline ? 'h-6 [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:px-3' : 'h-6',
      active
        ? 'bg-[var(--segment-thumb)] text-foreground shadow-[var(--shadow-sm)] dark:shadow-none'
        : 'text-muted-foreground hover:text-foreground',
    ].join(' ');

  const group = (
    <div
      role="group"
      aria-label="Answer mode"
      title={TITLE}
      className={[
        'inline-flex items-center gap-0.5 rounded-[8px] bg-[var(--segment-track)] p-0.5',
        isInline ? '' : 'border border-border',
        className,
      ].join(' ')}
    >
      <button type="button" aria-pressed={!on} className={seg(!on)} onClick={() => set(false)}>
        Standard
      </button>
      <button type="button" aria-pressed={on} className={seg(on)} onClick={() => set(true)}>
        Explore
      </button>
    </div>
  );

  if (isInline) return group;

  // Floating: out of the grid flow so it can never reflow the chat shell.
  return (
    <div style={{ position: 'fixed', bottom: 14, right: 14, zIndex: 40 }}>
      {group}
    </div>
  );
}
