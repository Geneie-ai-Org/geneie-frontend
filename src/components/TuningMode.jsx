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

import React, { useState } from 'react';
import { Sliders, Play, Loader2, Copy, Check, RotateCcw, X, SlidersHorizontal } from 'lucide-react';
import { buildOverridesHeader } from '@/services/streamCompare';
import TuningConfigModal from '@/components/TuningConfigModal';

/** Small pill button that matches the app's control styling. */
function PillButton({ children, active, disabled, title, onClick, icon: Icon, tone = 'default' }) {
  const tones = {
    default:
      'border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]',
    primary:
      'border-transparent bg-[var(--accent-teal)] text-[var(--accent-teal-contrast)] hover:bg-[var(--accent-teal-hover)]',
    ghost:
      'border-transparent bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? tones.primary : tones[tone]
      }`}
    >
      {Icon ? <Icon className={`h-3.5 w-3.5 ${active && Icon === Loader2 ? 'animate-spin' : ''}`} aria-hidden /> : null}
      {children}
    </button>
  );
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

  if (!isAdmin) return null; // non-admins never see this at all

  // This panel is a DIRECT child of .chat-app-shell (a 3-column CSS grid). position:fixed takes it
  // out of the grid entirely so it can never reflow the chat shell — same escape hatch
  // ExploratoryModeToggle uses. Anchored bottom-right, ABOVE that toggle (bottom:14) so they never
  // overlap. The ANSWER columns live in the thread and config editing lives in a full-screen modal,
  // so this panel stays compact (just the switch + actions).

  return (
   <>
    <div
      className="tune-root"
      style={{
        position: 'fixed',
        right: 14,
        bottom: 58,
        zIndex: 9998,
        width: 'auto',
        maxWidth: 'calc(100vw - 28px)',
        maxHeight: 'min(72vh, 720px)',
        overflowY: 'auto',
        // When OFF the panel must not sit as an opaque box over the results/download area and swallow
        // clicks (Alfu 2026-09-29: the download button was unclickable behind this). Inactive => the
        // container is click-through; only the toggle row re-enables pointer events.
        pointerEvents: active ? 'auto' : 'none',
      }}
    >
      <div
        className={
          active
            ? 'rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-raised)] p-3 shadow-[var(--shadow-xl)]'
            : ''
        }
      >
        {/* Toggle row. Parent is click-through when inactive; this row re-enables pointer events and
            carries its own compact chrome so the switch is visible without overlaying results. */}
        <div
          className={
            active
              ? 'flex flex-wrap items-center gap-2'
              : 'inline-flex flex-wrap items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface-raised)] px-3 py-1.5 shadow-[var(--shadow-md)]'
          }
          style={{ pointerEvents: 'auto' }}
        >
          <button
            type="button"
            role="switch"
            aria-checked={active}
            onClick={() => setActive((v) => !v)}
            title={active ? undefined : 'Off — chat behaves exactly as it does normally (no header, no second column).'}
            className="inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)]"
          >
            <span
              className={`relative inline-flex h-[18px] w-8 items-center rounded-full transition-colors ${
                active ? 'bg-[var(--accent-teal)]' : 'bg-[var(--segment-track)]'
              }`}
              aria-hidden
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  active ? 'translate-x-[15px]' : 'translate-x-[3px]'
                }`}
              />
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5 text-[var(--accent-teal)]" aria-hidden />
              Tuning mode
            </span>
          </button>

          {active ? (
            <>
              <span className="mx-0.5 h-5 w-px bg-[var(--border-subtle)]" aria-hidden />
              <PillButton onClick={() => setEditorOpen(true)} icon={SlidersHorizontal}>
                Edit config
                {dirtyKeys.length ? (
                  <span className="ml-0.5 rounded-full bg-[var(--accent-teal-soft)] px-1.5 py-px text-[10px] text-[var(--accent-teal)]">
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
                Reset all
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

    {/* Full-screen config editor. Opened from "Edit config"; edits the same session override set. */}
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
