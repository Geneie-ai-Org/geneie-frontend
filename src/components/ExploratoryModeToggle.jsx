import { useEffect, useState, useSyncExternalStore } from 'react';
import { Zap, Compass, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SegmentedPill } from '@/components/UploadWizardKit';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
    const options = [
      { id: 'standard', label: 'Standard', hint: 'Fast, reproducible answers', icon: Zap },
      { id: 'explore', label: 'Explore', hint: 'An agent reasons across your data in steps', icon: Compass },
    ];
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Answer mode: ${on ? 'Explore' : 'Standard'}`}
          title={TITLE}
          className={cn(
            'chat-tool chat-tool--label chat-focus chat-mode-label',
            on && 'chat-tool--explore',
            className
          )}
        >
          <Icon aria-hidden />
          <span>{on ? 'Explore' : 'Standard'}</span>
          <ChevronDown className="opacity-70" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-64 !p-1">
          <DropdownMenuRadioGroup value={on ? 'explore' : 'standard'} onValueChange={(v) => set(v === 'explore')}>
            {options.map((o) => (
              <DropdownMenuRadioItem
                key={o.id}
                value={o.id}
                className="items-start gap-2.5 px-2 py-1.5 pr-8"
              >
                <o.icon
                  className={`mt-0.5 size-4 ${o.id === 'explore' ? 'text-[var(--perm-warn)]' : 'text-muted-foreground'}`}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[13px] font-medium text-foreground">{o.label}</span>
                  <span className="text-xs leading-snug text-muted-foreground">{o.hint}</span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const group = (
    <div title={TITLE} className={cn('rounded-full bg-[hsl(var(--wb-bg))] shadow-[var(--shadow-sm)]', className)}>
      <SegmentedPill
        ariaLabel="Answer mode"
        value={on ? 'explore' : 'standard'}
        onChange={(v) => set(v === 'explore')}
        options={[
          { value: 'standard', label: 'Standard' },
          { value: 'explore', label: 'Explore' },
        ]}
      />
    </div>
  );

  // Floating: out of the grid flow so it can never reflow the chat shell.
  return (
    <div style={{ position: 'fixed', bottom: 14, right: 14, zIndex: 40 }}>
      {group}
    </div>
  );
}
