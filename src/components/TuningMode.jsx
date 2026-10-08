/**
 * Admin tuning mode: a toggle, an override panel, and the side-by-side two-column answer view.
 *
 * Scope discipline:
 *  - ADMIN-ONLY. The toggle is not rendered at all unless /api/admin/whoami resolves, so a non-admin
 *    never sees the affordance. The backend independently 403s the compare endpoints, so hiding the
 *    UI is convenience, not the security boundary.
 *  - WHEN OFF, NOTHING CHANGES. No header, no different endpoint, no second column - the normal chat
 *    path runs untouched. Tuning mode is additive, not a mode switch over the whole app.
 *  - The panel edits the OVERRIDE SET only. It never writes global config. Promotion to global stays
 *    a deliberate, separate action via the existing admin PUT (see "Copy candidate config").
 *
 * The presentation uses the app's design tokens (CSS vars + Tailwind) so it tracks light/dark theme
 * and matches the rest of the surface. Hardcoded hex was dark-mode-broken and looked bolted-on.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sliders, Play, Loader2, Copy, Check, RotateCcw, X, ChevronDown } from 'lucide-react';
import { adminWhoAmI, getAuthHeaders } from '@/services/backendApi';
import { fetchTunableConfig } from '@/services/tuningConfig';
import { streamCompare, createColumnState, COLUMN_LABELS, buildOverridesHeader } from '@/services/streamCompare';
import { getDeviceId } from '@/lib/deviceId';

const PANEL_KEY = 'geneie.tuning.overrides.v1';

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(PANEL_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

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
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
      {children}
    </button>
  );
}

/** `Baseline | Your config` — the only new render path; the single-column chat is untouched. */
function TwoColumnView({ acc, running, error }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {['baseline', 'candidate'].map((col) => {
        const c = acc.state[col];
        const isCandidate = col === 'candidate';
        return (
          <div
            key={col}
            className={`flex min-h-[8rem] flex-col rounded-xl border bg-[var(--bg-surface)] p-3 ${
              isCandidate ? 'border-[var(--accent-teal)]/40' : 'border-[var(--border-subtle)]'
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isCandidate ? 'bg-[var(--accent-teal)]' : 'bg-[var(--text-tertiary)]'
                  }`}
                  aria-hidden
                />
                {COLUMN_LABELS[col]}
              </span>
              {c.done ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--success)]">
                  <Check className="h-3 w-3" aria-hidden /> done
                </span>
              ) : running ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> streaming
                </span>
              ) : null}
            </div>
            {c.error ? (
              <div className="whitespace-pre-wrap rounded-lg bg-[var(--error-soft)] p-2 text-[13px] text-[var(--error)]">
                {typeof c.error === 'string' ? c.error : JSON.stringify(c.error)}
              </div>
            ) : (
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-primary)]">
                {c.text || (running ? '' : <span className="text-[var(--text-tertiary)]">(no output yet)</span>)}
              </div>
            )}
          </div>
        );
      })}
      {error ? (
        <div className="whitespace-pre-wrap rounded-lg bg-[var(--error-soft)] p-2 text-[13px] text-[var(--error)] sm:col-span-2">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export default function TuningMode({ question, onClose }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [active, setActive] = useState(false);
  const [overrides, setOverrides] = useState(loadSaved);
  const [baseline, setBaseline] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [acc, setAcc] = useState(() => createColumnState());
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef(null);

  // Admin gate. A 403 here is the expected non-admin path, not an error to surface.
  useEffect(() => {
    let alive = true;
    adminWhoAmI()
      .then((d) => { if (alive && d?.isAdmin) setIsAdmin(true); })
      .catch(() => { if (alive) setIsAdmin(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!isAdmin || !active) return;
    fetchTunableConfig().then(setBaseline).catch((e) => setError(`Could not load config: ${e.message}`));
  }, [isAdmin, active]);

  useEffect(() => {
    try { localStorage.setItem(PANEL_KEY, JSON.stringify(overrides)); } catch { /* non-fatal */ }
  }, [overrides]);

  const keys = baseline?.keys || [];
  const setOverride = useCallback((k, v) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (v === '' || v === null || v === undefined) delete next[k];
      else next[k] = v;
      return next;
    });
  }, []);

  const dirtyKeys = useMemo(
    () => Object.entries(overrides).filter(([, v]) => v !== '' && v !== null && v !== undefined),
    [overrides],
  );

  const run = useCallback(async () => {
    if (!question?.trim()) return;
    setRunning(true);
    setError(null);
    const next = createColumnState();
    setAcc(next);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const authHeaders = await getAuthHeaders();
      await streamCompare({
        path: '/api/chat/stream/compare',
        body: { message: question, conversationId: null },
        overrides,
        authHeaders,
        deviceId: getDeviceId(),
        signal: controller.signal,
        onEvent: (evt) => {
          next.apply(evt);
          // Re-render with a shallow-copied state so React sees the change.
          setAcc({ state: { ...next.state, baseline: { ...next.state.baseline }, candidate: { ...next.state.candidate } } });
        },
      });
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [question, overrides]);

  // Cancel an in-flight comparison if the panel is closed or unmounted.
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => { if (!active) abortRef.current?.abort(); }, [active]);

  if (!isAdmin) return null; // non-admins never see this at all

  // This component is a DIRECT child of .chat-app-shell, which is a 3-column CSS grid
  // (--shell-left-col / minmax(0,1fr) / --shell-right-col). An unpositioned grid child is
  // auto-placed into an implicit cell, which is how this ended up squeezed into the ~64px icon
  // rail with its label wrapping one word per line. position:fixed takes it out of the grid
  // entirely, so it can never reflow the chat shell - same escape hatch ExploratoryModeToggle uses.
  // Anchored bottom-right, sitting ABOVE that toggle (which owns bottom:14) so the two never overlap.
  const expanded = active && (panelOpen || running || acc.baseline || acc.candidate);
  const canRun = !running && Boolean(question?.trim());

  return (
    <div
      className="tune-root"
      style={{
        position: 'fixed',
        right: 14,
        bottom: 58,
        zIndex: 9998,
        width: expanded ? 'min(920px, calc(100vw - 28px))' : 'auto',
        maxWidth: 'calc(100vw - 28px)',
        maxHeight: 'min(72vh, 720px)',
        overflowY: 'auto',
        // When tuning mode is OFF, the panel must not sit as an opaque box over the
        // results/download area and swallow clicks (Alfu 2026-09-29: the download
        // button was unclickable behind this). Inactive => no fill/shadow and the
        // container itself is click-through; only the toggle row (below) re-enables
        // pointer events. Active => full panel chrome as before.
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
            carries its own compact chrome so the switch is visible without overlaying the results. */}
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
              <PillButton onClick={run} disabled={!canRun} icon={running ? Loader2 : Play} tone="primary" active>
                <span className={running ? 'inline-flex items-center' : ''}>{running ? 'Comparing…' : 'Run comparison'}</span>
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
                onClick={() => { setOverrides({}); setAcc(createColumnState()); }}
                icon={RotateCcw}
                tone="ghost"
                disabled={!dirtyKeys.length && !acc.baseline && !acc.candidate}
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
          <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
            {baseline ? null : (
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading current config…
              </div>
            )}
            <div className="space-y-2.5">
              {keys.map((k) => {
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
            {keys.length ? null : (
              <div className="text-xs leading-relaxed text-[var(--text-secondary)]">
                No tunable backend keys loaded. Sidecar persona/pack/agent keys are not prefillable yet (they live in
                the S3 manifest, not this collection) — you can still set them by hand and they will travel in the header.
              </div>
            )}
          </div>
        ) : null}

        {active ? (
          <div className="mt-3">
            <TwoColumnView acc={acc} running={running} error={error} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
