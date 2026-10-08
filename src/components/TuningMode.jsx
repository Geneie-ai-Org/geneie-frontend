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
import { Sliders, Play, Loader2, Copy, Check, RotateCcw, X, ChevronDown } from 'lucide-react';
import { buildOverridesHeader } from '@/services/streamCompare';

const fmtVal = (v) => (typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));

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
    baseline, dirtyKeys, running, run, hasColumns, canRun,
  } = tuning;
  const [panelOpen, setPanelOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isAdmin) return null; // non-admins never see this at all

  // This panel is a DIRECT child of .chat-app-shell (a 3-column CSS grid). position:fixed takes it
  // out of the grid entirely so it can never reflow the chat shell — same escape hatch
  // ExploratoryModeToggle uses. Anchored bottom-right, ABOVE that toggle (bottom:14) so they never
  // overlap. The ANSWER columns now live in the thread, so this stays compact.
  const expanded = active && panelOpen;

  return (
    <div
      className="tune-root"
      style={{
        position: 'fixed',
        right: 14,
        bottom: 58,
        zIndex: 9998,
        width: expanded ? 'min(460px, calc(100vw - 28px))' : 'auto',
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
              <PillButton onClick={() => setPanelOpen((v) => !v)}>
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${panelOpen ? 'rotate-180' : ''}`}
                  aria-hidden
                />
                {panelOpen ? 'Hide' : 'Show'} config
                <span className="ml-0.5 rounded-full bg-[var(--bg-surface-sunken)] px-1.5 py-px text-[10px] text-[var(--text-secondary)]">
                  {dirtyKeys.length}
                </span>
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

        {active && panelOpen ? (
          <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
            <div className="mb-2 text-[11px] text-[var(--text-tertiary)]">
              Edits apply to the <span className="text-[var(--text-secondary)]">candidate</span> column only. Run a
              comparison to see baseline vs candidate side by side in the chat.
            </div>
            {baseline ? null : (
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading current config…
              </div>
            )}
            <div className="space-y-2.5">
              {(baseline?.keys || []).map((k) => {
                const b = baseline.byKey[k];
                const cur = overrides[k] ?? '';
                const overridden = cur !== '';
                return (
                  <div key={k} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <code className="break-all font-mono text-[12px] text-[var(--text-primary)]">{k}</code>
                      {overridden ? (
                        <span className="shrink-0 rounded-full bg-[var(--accent-teal-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent-teal)]">
                          overridden
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                      baseline: <span className="font-mono">{fmtVal(b.value)}</span>
                    </div>
                    <div className="mt-1.5 flex gap-1.5">
                      <input
                        className="h-7 flex-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-input)] px-2 font-mono text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)] focus:bg-[var(--bg-input-focus)]"
                        value={cur}
                        placeholder={fmtVal(b.value)}
                        onChange={(e) => setOverride(k, e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setOverride(k, '')}
                        disabled={!overridden}
                        className="inline-flex h-7 items-center rounded-md px-2 text-[11px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-30"
                      >
                        reset
                      </button>
                    </div>
                    {b.description ? (
                      <div className="mt-1 text-[11px] text-[var(--text-tertiary)]">{b.description}</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {baseline && !baseline.keys?.length ? (
              <div className="text-xs leading-relaxed text-[var(--text-secondary)]">
                No tunable backend keys loaded. Sidecar persona/pack/agent keys are not prefillable yet (they live in
                the S3 manifest, not this collection) — you can still set them by hand and they will travel in the header.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
