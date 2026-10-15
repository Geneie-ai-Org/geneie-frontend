import { useEffect, useState, useSyncExternalStore } from 'react';
import { Zap, Compass, ChevronDown, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

/**
 * Chat mode switch: Standard (reproducible pipeline) vs Explore (agentic, multi-step).
 * Stores the choice in localStorage under 'geneie_exploratory_mode' ('on' | absent), which
 * useChatMessaging reads when routing a turn.
 *
 * Two presentations of the same control:
 *  - variant="inline"   a mode label (icon + text + chevron) in the composer toolbar; clicking opens
 *                       a small menu to pick the mode. Standard reads as neutral text, Explore as
 *                       the orange elevated-mode label (--perm-warn).
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

  if (isInline) {
    const Icon = on ? Compass : Zap;
    // The orange is lifted a little in dark mode so it keeps contrast on the dark card.
    const tone = on
      ? 'text-[var(--perm-warn)] dark:text-[color-mix(in_srgb,var(--perm-warn)_72%,white)]'
      : 'text-muted-foreground hover:text-foreground';
    const options = [
      { id: false, label: 'Standard', hint: 'Fast, reproducible answers', icon: Zap },
      { id: true, label: 'Explore', hint: 'An agent reasons across your data in steps', icon: Compass },
    ];
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Answer mode: ${on ? 'Explore' : 'Standard'}`}
          title={TITLE}
          className={[
            'chat-mode-label inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] px-2 text-[13px] font-medium whitespace-nowrap',
            'transition-colors outline-none hover:bg-[var(--bg-surface-hover)] focus-visible:ring-2 focus-visible:ring-ring/50 data-[popup-open]:bg-[var(--bg-surface-hover)]',
            '[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:px-3',
            tone,
            className,
          ].join(' ')}
        >
          <Icon className="size-3.5 shrink-0" aria-hidden />
          <span>{on ? 'Explore' : 'Standard'}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-64 !p-1">
          {options.map((o) => {
            const selected = o.id === on;
            return (
              <DropdownMenuItem
                key={o.label}
                onClick={() => set(o.id)}
                className="items-start gap-2.5 px-2 py-1.5"
              >
                <o.icon
                  className={`mt-0.5 size-4 ${o.id ? 'text-[var(--perm-warn)]' : 'text-muted-foreground'}`}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[13px] font-medium text-foreground">{o.label}</span>
                  <span className="text-xs text-muted-foreground">{o.hint}</span>
                </span>
                {selected && <Check className="mt-0.5 size-4 text-foreground" aria-hidden />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const seg = (active) =>
    [
      'inline-flex items-center justify-center rounded-[6px] px-2.5 text-xs font-medium whitespace-nowrap transition-colors',
      'h-6',
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
        'border border-border',
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

  // Floating: out of the grid flow so it can never reflow the chat shell.
  return (
    <div style={{ position: 'fixed', bottom: 14, right: 14, zIndex: 40 }}>
      {group}
    </div>
  );
}
