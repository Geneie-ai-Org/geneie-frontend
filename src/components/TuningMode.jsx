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
import { Sliders, Play, RotateCcw, X, SlidersHorizontal } from 'lucide-react';
import { buildOverridesHeader } from '@/services/streamCompare';
import TuningConfigModal from '@/components/TuningConfigModal';
import { CopyButton, CountUp, StateButton } from '@/components/motion';
import { SegmentedPill } from '@/components/UploadWizardKit';

/** Small pill button for the tuning panel: hairline by default, brand tint for the one primary action. */
function PillButton({ children, active, disabled, title, onClick, icon: Icon, tone = 'default' }) {
  const tones = {
    default:
      'border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] text-foreground hover:border-[hsl(var(--brand-300))] hover:bg-[hsl(var(--brand-50))]',
    primary:
      'border-transparent bg-[hsl(var(--brand-solid))] text-[hsl(var(--on-brand))] hover:bg-[hsl(var(--brand-solid-hover))]',
    ghost:
      'border-transparent bg-transparent text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--wb-pill))]',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium outline-none transition-[background-color,border-color,color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none [@media(pointer:coarse)]:h-9 ${
        active ? tones.primary : tones[tone]
      }`}
    >
      {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
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
  const pos = useClearOfChrome();

  if (!isAdmin) return null; // non-admins never see this at all

  // This panel is a DIRECT child of .chat-app-shell (a 3-column CSS grid). position:fixed takes it
  // out of the grid entirely so it can never reflow the chat shell. It is anchored bottom-right,
  // above the composer dock and beside the workspace, so it never overlaps either. The ANSWER
  // columns live in the thread and config editing lives in a modal, so this stays compact.

  return (
   <>
    <div
      className="tune-root wb-scope"
      style={{
        backgroundColor: 'transparent',
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
            ? 'wb-rise rounded-3xl border border-[hsl(var(--wb-line))] bg-popover p-2 text-popover-foreground shadow-[var(--shadow-md)]'
            : ''
        }
      >
        <div
          className={
            active
              ? 'flex flex-wrap items-center gap-1.5'
              : 'inline-flex items-center gap-2 rounded-full border border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-card))] py-0.5 pl-3 pr-0.5 text-muted-foreground'
          }
          style={{ pointerEvents: 'auto' }}
        >
          <span
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground"
            title={active ? undefined : 'Off: chat behaves exactly as it does normally (no header, no second column).'}
          >
            <Sliders className="size-3.5 text-muted-foreground" aria-hidden />
            Tuning
          </span>
          <SegmentedPill
            ariaLabel="Tuning mode"
            value={active ? 'on' : 'off'}
            onChange={(v) => setActive(v === 'on')}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'on', label: 'On' },
            ]}
          />

          {active ? (
            <>
              <span className="mx-0.5 h-4 w-px bg-[hsl(var(--wb-line))]" aria-hidden />
              <PillButton onClick={() => setEditorOpen(true)} icon={SlidersHorizontal}>
                Edit config
                {dirtyKeys.length ? (
                  <span className="wb-chip !h-5 !px-1.5 tabular-nums text-[11px]" data-tone="brand">
                    <CountUp value={dirtyKeys.length} duration={0.3} />
                  </span>
                ) : null}
              </PillButton>
              <StateButton
                state={running ? 'running' : 'idle'}
                labels={{ idle: 'Run comparison', running: 'Comparing' }}
                icon={Play}
                onClick={run}
                disabled={!canRun}
                title={canRun ? undefined : 'Type a question in the composer first.'}
              />
              <CopyButton
                label="Copy config"
                disabled={!dirtyKeys.length}
                getText={() => buildOverridesHeader(overrides) || ''}
                title="Copy the override JSON. Promoting it to global is a separate, deliberate admin PUT."
              />
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
      onRun={run}
      canRun={canRun}
      running={running}
    />
   </>
  );
}
