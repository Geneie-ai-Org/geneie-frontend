/**
 * Admin tuning mode — the floating CONTROLS panel (toggle, override editor, Run/Copy/Reset).
 *
 * The side-by-side ANSWER does NOT live here anymore: it renders inline in the chat thread
 * (see TuningCompareColumns), so a compare reads like the conversation ran twice. This component
 * is purely the controls, driven by the shared `useTuningCompare` hook instance owned by ChatPage.
 *
 * Scope discipline (unchanged):
 *  - ADMIN-ONLY. Renders nothing unless the hook reports isAdmin. The backend independently 403s the
 *    compare endpoint, so hiding the UI is convenience, not the security boundary.
 *  - WHEN OFF, NOTHING CHANGES. No header, no different endpoint, no second column — normal chat runs
 *    untouched. Tuning mode is additive.
 *  - The panel edits the OVERRIDE SET only; promotion to global config stays a separate admin PUT
 *    ("Copy candidate config").
 */

import React, { useEffect, useState } from 'react';
import { Sliders, Play, Loader2, Copy, Check, RotateCcw, X, SlidersHorizontal } from 'lucide-react';
import { buildOverridesHeader } from '@/services/streamCompare';
import TuningConfigModal from '@/components/TuningConfigModal';

/** Small button for the tuning panel: outline by default, filled for the one primary action. */
function PillButton({ children, active, disabled, title, onClick, icon: Icon, tone = 'default' }) {
  const tones = {
    default:
      'border-border bg-transparent text-foreground hover:bg-[var(--bg-surface-hover)]',
    primary:
      'border-transparent bg-primary text-primary-foreground hover:bg-primary/85',
    ghost:
      'border-transparent bg-transparent text-muted-foreground hover:text-foreground hover:bg-[var(--bg-surface-hover)]',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex h-7 items-center gap-1.5 rounded-[8px] border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 [@media(pointer:coarse)]:h-9 ${
        active ? tones.primary : tones[tone]
      }`}
    >
      {Icon ? <Icon className={`h-3.5 w-3.5 ${active && Icon === Loader2 ? 'animate-spin' : ''}`} aria-hidden /> : null}
      {children}
    </button>
  );
}

/**
 * Keep the fixed control clear of the composer and the workspace: sit just above the composer dock
 * (when there is one) and just left of the workspace panel (when it is open). Measured, not
 * guessed, because both move with the layout.
 */
function useClearOfChrome() {
  const [pos, setPos] = useState({ right: 14, bottom: 14 });
  useEffect(() => {
    const measure = () => {
      const dock = document.querySelector('.chat-composer-dock');
      const aside = document.querySelector('.chat-shell-right');
      const dockH = dock ? dock.getBoundingClientRect().height : 0;
      const asideRect = aside && aside.getAttribute('aria-hidden') !== 'true' ? aside.getBoundingClientRect() : null;
      const inline = asideRect && asideRect.width > 0 && asideRect.left > window.innerWidth * 0.4 ? asideRect : null;
      const next = {
        right: inline ? Math.round(window.innerWidth - inline.left + 14) : 14,
        bottom: dockH ? Math.round(dockH + 12) : 14,
      };
      setPos((p) => (p.right === next.right && p.bottom === next.bottom ? p : next));
    };
    measure();
    const t = setInterval(measure, 500);
    window.addEventListener('resize', measure);
    return () => { clearInterval(t); window.removeEventListener('resize', measure); };
  }, []);
  return pos;
}

/**
 * @param tuning  the shared useTuningCompare() instance (owned by ChatPage).
 * @param onClose optional close handler for the whole affordance.
 */
export default function TuningMode({ tuning, onClose }) {
  const {
    isAdmin, active, setActive, overrides, setOverride, resetAll,
    baseline, configError, reloadConfig, dirtyKeys, running, run, hasColumns, canRun,
  } = tuning;
  const [editorOpen, setEditorOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const pos = useClearOfChrome();

  if (!isAdmin) return null; // non-admins never see this at all

  // This panel is a DIRECT child of .chat-app-shell (a 3-column CSS grid). position:fixed takes it
  // out of the grid entirely so it can never reflow the chat shell. It is anchored bottom-right,
  // above the composer dock and beside the workspace, so it never overlaps either. The ANSWER
  // columns live in the thread and config editing lives in a modal, so this stays compact.

  return (
   <>
    <div
      className="tune-root"
      style={{
        position: 'fixed',
        right: pos.right,
        bottom: pos.bottom,
        zIndex: 30,
        width: 'auto',
        maxWidth: 'calc(100vw - 28px)',
        maxHeight: 'min(72vh, 720px)',
        overflowY: 'auto',
        // When OFF the container must not sit as a box over the results/download area and swallow
        // clicks: inactive => click-through, only the toggle row re-enables pointer events.
        pointerEvents: active ? 'auto' : 'none',
      }}
    >
      <div
        className={
          active
            ? 'rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-[var(--shadow-md)]'
            : ''
        }
      >
        <div
          className={
            active
              ? 'flex flex-wrap items-center gap-1.5'
              : 'inline-flex items-center gap-2 rounded-[8px] border border-border bg-card px-1.5 py-0.5 text-muted-foreground'
          }
          style={{ pointerEvents: 'auto' }}
        >
          <button
            type="button"
            role="switch"
            aria-checked={active}
            onClick={() => setActive((v) => !v)}
            title={active ? undefined : 'Off: chat behaves exactly as it does normally (no header, no second column).'}
            className="inline-flex h-7 items-center gap-2 rounded-md px-1 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [@media(pointer:coarse)]:h-9"
          >
            <span
              className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                active ? 'bg-primary' : 'bg-[var(--border-strong)]'
              }`}
              aria-hidden
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-background shadow-[var(--shadow-sm)] transition-transform ${
                  active ? 'translate-x-[14px]' : 'translate-x-[2px]'
                }`}
              />
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              Tuning
            </span>
          </button>

          {active ? (
            <>
              <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
              <PillButton onClick={() => setEditorOpen(true)} icon={SlidersHorizontal}>
                Edit config
                {dirtyKeys.length ? (
                  <span className="ml-0.5 rounded-full bg-muted px-1.5 text-[10px] leading-4 text-foreground">
                    {dirtyKeys.length}
                  </span>
                ) : null}
              </PillButton>
              <PillButton
                onClick={run}
                disabled={!canRun}
                icon={running ? Loader2 : Play}
                tone="primary"
                active
                title={canRun ? undefined : 'Type a question in the composer first.'}
              >
                {running ? 'Comparing…' : 'Run comparison'}
              </PillButton>
              <PillButton
                disabled={!dirtyKeys.length}
                onClick={() => {
                  const h = buildOverridesHeader(overrides);
                  navigator.clipboard?.writeText(h || '');
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                icon={copied ? Check : Copy}
                title="Copy the override JSON. Promoting it to global is a separate, deliberate admin PUT."
              >
                {copied ? 'Copied' : 'Copy config'}
              </PillButton>
              <PillButton
                onClick={resetAll}
                icon={RotateCcw}
                tone="ghost"
                disabled={!dirtyKeys.length && !hasColumns}
              >
                Reset
              </PillButton>
            </>
          ) : null}
          {onClose ? (
            <PillButton onClick={onClose} icon={X} tone="ghost">
              <span className="sr-only">Close tuning mode</span>
            </PillButton>
          ) : null}
        </div>
      </div>
    </div>

    {/* Config editor. Opened from "Edit config"; edits the same session override set. */}
    <TuningConfigModal
      open={editorOpen}
      onClose={() => setEditorOpen(false)}
      baseline={baseline}
      configError={configError}
      reloadConfig={reloadConfig}
      overrides={overrides}
      setOverride={setOverride}
    />
   </>
  );
}
