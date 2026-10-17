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
 *
 * One editor, prefilled with the global value: you edit the real text, never a blank box. Edits
 * save as you type; text identical to the global value (or cleared) is not counted as a change.
 * "Show changes" swaps the editor for a line diff against the global value.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, RotateCcw, Check, Loader2, AlertCircle } from 'lucide-react';

const fmtVal = (v) => (typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v ?? ''));

/** Line diff (LCS) between the global value and yours: [{ type: 'same' | 'del' | 'add', text }]. */
function lineDiff(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { out.push({ type: 'same', text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', text: a[i] }); i++; }
    else { out.push({ type: 'add', text: b[j] }); j++; }
  }
  while (i < m) out.push({ type: 'del', text: a[i++] });
  while (j < n) out.push({ type: 'add', text: b[j++] });
  return out;
}

const DIFF_STYLES = {
  same: { mark: ' ', className: 'text-[var(--text-secondary)]' },
  del: { mark: '−', className: 'bg-[var(--error-soft)] text-[var(--error)]' },
  add: { mark: '+', className: 'bg-[var(--success-soft)] text-[var(--success)]' },
};

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
  initialKey = null,  // open on this key (from the panel's Edit link); otherwise the first listed key
  baseline,          // { keys: [...], byKey: {key: {value, description, type}} }
  configError,
  reloadConfig,
  overrides,         // { key: string }
  setOverride,       // (key, value) => void
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const searchRef = useRef(null);
  const textareaRef = useRef(null);
  const listRef = useRef(null);

  const keys = baseline?.keys || [];

  // Esc closes; focus search on open.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => searchRef.current?.focus(), 50);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(t); };
  }, [open, onClose]);

  // When the selected key changes, load your version if you have one, else the global value.
  useEffect(() => {
    if (!selected) return;
    setDraft(overrides[selected] ?? fmtVal(baseline?.byKey?.[selected]?.value));
    setShowDiff(false);
  }, [selected, baseline]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // On open: the requested key, else the first key as listed (Models first), so the selection
  // is always the one you can see at the top of the list.
  const firstListedKey = grouped[0]?.[1]?.[0] || null;
  useEffect(() => {
    if (!open) {
      setSelected(null);
      return;
    }
    if (!selected && keys.length) setSelected(initialKey && keys.includes(initialKey) ? initialKey : firstListedKey);
  }, [open, keys, initialKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the selected key in view in the list.
  useEffect(() => {
    if (!selected || !listRef.current) return;
    listRef.current.querySelector(`[data-key="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const modifiedCount = useMemo(
    () => keys.filter((k) => (overrides[k] ?? '') !== '').length,
    [keys, overrides],
  );

  if (!open) return null;

  const b = selected ? baseline?.byKey?.[selected] : null;
  const baselineStr = b ? fmtVal(b.value) : '';
  const isModified = selected ? (overrides[selected] ?? '') !== '' : false;

  // Save as you type. Matching the global value (or clearing it) is the same as no change.
  const changeDraft = (next) => {
    setDraft(next);
    if (selected) setOverride(selected, next === baselineStr ? '' : next);
  };
  const revert = () => {
    if (!selected) return;
    setOverride(selected, '');
    setDraft(baselineStr);
    setShowDiff(false);
  };
  const diff = showDiff && isModified ? lineDiff(baselineStr, draft) : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10010] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Tuning config editor"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-app)] shadow-[var(--shadow-xl)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Edit config</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                modifiedCount
                  ? 'bg-[var(--accent-teal-soft)] text-[var(--accent-teal)]'
                  : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)]'
              }`}
            >
              {modifiedCount ? `${modifiedCount} changed` : 'No changes'}
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
              <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
                {/* Hierarchy: group = bright sans-serif heading with a count pill, sticky while its keys
                  * scroll; key = indented, muted monospace. Size, weight, color and indent all differ. */}
                {grouped.map(([label, arr], gi) => (
                  <div key={label} className={gi ? 'mt-2 border-t border-[var(--border-subtle)] pt-2' : ''}>
                    <div className="sticky top-0 z-[1] -mx-2 mb-1 flex items-center justify-between bg-[var(--bg-app)] px-3 py-1.5">
                      <span className="text-xs font-semibold text-[var(--text-primary)]">{label}</span>
                      <span className="rounded-full bg-[var(--bg-surface-hover)] px-1.5 text-[10px] font-medium leading-4 tabular-nums text-[var(--text-tertiary)]">
                        {arr.length}
                      </span>
                    </div>
                    <div className="space-y-px pl-2">
                      {arr.map((k) => {
                        const mod = (overrides[k] ?? '') !== '';
                        const active = k === selected;
                        return (
                          <button
                            key={k}
                            data-key={k}
                            type="button"
                            onClick={() => setSelected(k)}
                            aria-current={active ? 'true' : undefined}
                            className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left font-mono text-[11.5px] transition-colors ${
                              active
                                ? 'bg-[var(--accent-teal-soft)] font-medium text-[var(--accent-teal)]'
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
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          isModified
                            ? 'bg-[var(--accent-teal-soft)] text-[var(--accent-teal)]'
                            : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)]'
                        }`}
                      >
                        {isModified ? 'Changed' : 'Unchanged'}
                      </span>
                    </div>
                    {b.description ? (
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">{b.description}</p>
                    ) : null}
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col">
                    <div className="flex items-center justify-between gap-3 px-4 py-2">
                      <span className="text-xs text-[var(--text-secondary)]">
                        {showDiff && isModified
                          ? 'Your changes against the global value'
                          : isModified
                            ? 'Your version'
                            : baselineStr
                              ? 'Global value — edit it to make your version'
                              : 'No global value — type a value'}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-[11px] tabular-nums text-[var(--text-tertiary)]">{draft.length} chars</span>
                        {isModified ? (
                          <button
                            type="button"
                            onClick={() => setShowDiff((v) => !v)}
                            aria-pressed={showDiff}
                            className="text-[11px] font-medium text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
                          >
                            {showDiff ? 'Back to editing' : 'Show changes'}
                          </button>
                        ) : null}
                      </span>
                    </div>
                    {diff ? (
                      <div className="min-h-0 flex-1 overflow-auto border-t border-[var(--border-subtle)] bg-[var(--bg-input)] py-2 font-mono text-[12px] leading-relaxed">
                        {diff.map((line, idx) => (
                          <div key={idx} className={`flex gap-2 px-4 ${DIFF_STYLES[line.type].className}`}>
                            <span className="w-3 shrink-0 select-none" aria-hidden>{DIFF_STYLES[line.type].mark}</span>
                            <span className="min-w-0 whitespace-pre-wrap break-words">{line.text || ' '}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <textarea
                        ref={textareaRef}
                        value={draft}
                        onChange={(e) => changeDraft(e.target.value)}
                        aria-label={`Value for ${selected}`}
                        spellCheck={false}
                        className="min-h-0 flex-1 resize-none border-0 border-t border-[var(--border-subtle)] bg-[var(--bg-input)] px-4 py-2 font-mono text-[12px] leading-relaxed text-[var(--text-primary)] outline-none focus:bg-[var(--bg-input-focus)]"
                      />
                    )}
                  </div>

                  {/* Footer actions */}
                  <div className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-4 py-2.5">
                    <div className="text-[11px] text-[var(--text-tertiary)]">
                      {isModified
                        ? 'Saved · used in your next comparison.'
                        : 'Same as global, so not counted as a change.'}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={revert}
                        disabled={!isModified}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--border-default)] px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-30"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Revert to global
                      </button>
                      <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--accent-teal)] px-4 text-xs font-medium text-[var(--accent-teal-contrast)] transition-colors hover:bg-[var(--accent-teal-hover)]"
                      >
                        <Check className="h-3.5 w-3.5" /> Done
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
