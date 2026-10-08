/**
 * Full-screen config editor for admin tuning mode.
 *
 * Why a modal and not the corner panel: most tunable keys are large (persona/pack/prompt values run
 * 600–4,900 chars). Editing those in a one-line box inside a 460px floating panel is unusable. This
 * gives a real workspace: searchable key list on the left, a big baseline|your-value editor on the
 * right, pre-filled with the real baseline so you edit actual text instead of a blank box.
 *
 * It only EDITS the session override set (same `overrides` the compare sends). It never writes global
 * config; promotion stays the separate admin PUT. Closing the modal keeps overrides + tuning state.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, RotateCcw, Check, Loader2, AlertCircle } from 'lucide-react';

const fmtVal = (v) => (typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v ?? ''));

// Plain-language group labels + order, keyed by namespace.
const GROUPS = [
  ['model', 'Models'],
  ['prompt', 'Prompts'],
  ['persona', 'Personas'],
  ['pack', 'Knowledge packs'],
  ['agent', 'Agents'],
  ['knobs', 'Knobs'],
];

function nsOf(key) {
  const dot = key.indexOf('.');
  return dot === -1 ? key : key.slice(0, dot);
}

export default function TuningConfigModal({
  open,
  onClose,
  baseline,          // { keys: [...], byKey: {key: {value, description, type}} }
  configError,
  reloadConfig,
  overrides,         // { key: string }
  setOverride,       // (key, value) => void
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState('');
  const searchRef = useRef(null);
  const textareaRef = useRef(null);

  const keys = baseline?.keys || [];

  // Esc closes; focus search on open.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => searchRef.current?.focus(), 50);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(t); };
  }, [open, onClose]);

  // Default-select the first key once config loads.
  useEffect(() => {
    if (open && !selected && keys.length) setSelected(keys[0]);
  }, [open, selected, keys]);

  // When the selected key changes, load its current override (or fall back to empty = "use baseline").
  useEffect(() => {
    if (!selected) return;
    setDraft(overrides[selected] ?? '');
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return keys;
    return keys.filter((k) => {
      const d = baseline?.byKey?.[k]?.description || '';
      return k.toLowerCase().includes(q) || d.toLowerCase().includes(q);
    });
  }, [query, keys, baseline]);

  const grouped = useMemo(() => {
    const byNs = {};
    for (const k of filtered) (byNs[nsOf(k)] ||= []).push(k);
    return GROUPS.map(([ns, label]) => [label, byNs[ns] || []]).filter(([, arr]) => arr.length);
  }, [filtered]);

  const modifiedCount = useMemo(
    () => keys.filter((k) => (overrides[k] ?? '') !== '').length,
    [keys, overrides],
  );

  if (!open) return null;

  const b = selected ? baseline?.byKey?.[selected] : null;
  const baselineStr = b ? fmtVal(b.value) : '';
  const isModified = selected ? (overrides[selected] ?? '') !== '' : false;
  const dirtyDraft = selected ? draft !== (overrides[selected] ?? '') : false;

  const commit = () => { if (selected) setOverride(selected, draft); };
  const revert = () => { if (selected) { setOverride(selected, ''); setDraft(''); } };
  const resetToBaseline = () => setDraft(baselineStr); // load baseline text to edit from

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Tuning config editor"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-app)] shadow-[var(--shadow-xl)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Tuning config</h2>
            <span className="rounded-full bg-[var(--bg-surface-sunken)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
              {modifiedCount} modified
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {configError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <AlertCircle className="h-6 w-6 text-[var(--error)]" />
            <div className="text-sm font-medium text-[var(--text-primary)]">Could not load config</div>
            <div className="max-w-md break-words text-xs text-[var(--text-secondary)]">{configError}</div>
            <button
              type="button"
              onClick={reloadConfig}
              className="mt-1 inline-flex h-9 items-center rounded-full bg-[var(--text-primary)] px-5 text-sm font-medium text-[var(--bg-app)] transition-opacity hover:opacity-85"
            >
              Retry
            </button>
          </div>
        ) : !baseline ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading current config…
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            {/* Left: searchable grouped key list */}
            <div className="flex w-72 shrink-0 flex-col border-r border-[var(--border-subtle)]">
              <div className="border-b border-[var(--border-subtle)] p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search keys…"
                    className="h-8 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] pl-8 pr-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
                  />
                </div>
                <div className="mt-1 px-1 text-[10px] text-[var(--text-tertiary)]">
                  {filtered.length} of {keys.length} keys
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {grouped.map(([label, arr]) => (
                  <div key={label} className="mb-3">
                    <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                      {label} ({arr.length})
                    </div>
                    <div className="space-y-0.5">
                      {arr.map((k) => {
                        const mod = (overrides[k] ?? '') !== '';
                        const active = k === selected;
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => setSelected(k)}
                            className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left font-mono text-[11px] transition-colors ${
                              active
                                ? 'bg-[var(--accent-teal-soft)] text-[var(--accent-teal)]'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            <span className="truncate">{k.includes('.') ? k.slice(k.indexOf('.') + 1) : k}</span>
                            {mod ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-teal)]" aria-label="modified" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {filtered.length === 0 ? (
                  <div className="px-2 py-4 text-center text-xs text-[var(--text-tertiary)]">No keys match “{query}”.</div>
                ) : null}
              </div>
            </div>

            {/* Right: baseline | your value editor */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {selected && b ? (
                <>
                  <div className="border-b border-[var(--border-subtle)] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <code className="break-all font-mono text-sm font-semibold text-[var(--text-primary)]">{selected}</code>
                      {isModified ? (
                        <span className="rounded-full bg-[var(--accent-teal-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent-teal)]">
                          overridden
                        </span>
                      ) : null}
                    </div>
                    {b.description ? (
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">{b.description}</p>
                    ) : null}
                  </div>

                  <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 md:grid-cols-2">
                    {/* baseline (read-only) */}
                    <div className="flex min-h-0 flex-col border-b border-[var(--border-subtle)] md:border-b-0 md:border-r">
                      <div className="flex items-center justify-between px-4 py-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                          Baseline (global)
                        </span>
                        <button
                          type="button"
                          onClick={resetToBaseline}
                          className="text-[11px] text-[var(--text-secondary)] transition-colors hover:text-[var(--accent-teal)]"
                          title="Copy the baseline text into your editor to tweak from it"
                        >
                          Edit from this →
                        </button>
                      </div>
                      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-4 pb-4 font-mono text-[12px] leading-relaxed text-[var(--text-secondary)]">
                        {baselineStr || <span className="italic opacity-60">(empty)</span>}
                      </pre>
                    </div>

                    {/* your value (editable) */}
                    <div className="flex min-h-0 flex-col">
                      <div className="flex items-center justify-between px-4 py-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                          Your value
                        </span>
                        <span className="text-[11px] text-[var(--text-tertiary)]">
                          {draft.length} chars{draft === '' ? ' · using baseline' : ''}
                        </span>
                      </div>
                      <textarea
                        ref={textareaRef}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commit}
                        placeholder={baselineStr}
                        spellCheck={false}
                        className="min-h-0 flex-1 resize-none border-0 bg-[var(--bg-input)] px-4 py-2 font-mono text-[12px] leading-relaxed text-[var(--text-primary)] outline-none focus:bg-[var(--bg-input-focus)]"
                      />
                    </div>
                  </div>

                  {/* Footer actions */}
                  <div className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-4 py-2.5">
                    <div className="text-[11px] text-[var(--text-tertiary)]">
                      Leave blank to use the baseline. Changes apply to the candidate column when you run a comparison.
                    </div>
                    <div className="flex items-center gap-2">
                      {dirtyDraft ? (
                        <span className="text-[11px] text-[var(--text-tertiary)]">unsaved — click Apply or tab out</span>
                      ) : null}
                      <button
                        type="button"
                        onClick={revert}
                        disabled={!isModified && draft === ''}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--border-default)] px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-30"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Revert
                      </button>
                      <button
                        type="button"
                        onClick={commit}
                        disabled={!dirtyDraft}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--accent-teal)] px-4 text-xs font-medium text-[var(--accent-teal-contrast)] transition-colors hover:bg-[var(--accent-teal-hover)] disabled:opacity-40"
                      >
                        <Check className="h-3.5 w-3.5" /> Apply
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-tertiary)]">
                  Select a key to edit.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
