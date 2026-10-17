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
 * Built on the shared Dialog, so Esc closes it, focus is trapped while it is open and returns to the
 * "Edit config" button after.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, RotateCcw, Check, Braces } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CopyButton, CountUp, SelectionMarker, StageMark, StateButton, undoToast } from '@/components/motion';
import { SegmentedPill } from '@/components/UploadWizardKit';
import { TYPE_LABEL, diffStats, formatJson, lineDiff, validateValue } from '@/lib/tuningValue';

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

const IS_MAC = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || '');
const MOD = IS_MAC ? '\u2318' : 'Ctrl';
const SCALAR = new Set(['bool', 'int', 'float']);

const FIELD =
  'rounded-2xl border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] px-4 text-foreground outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground/60 hover:border-[hsl(var(--brand-300))] focus-visible:border-[hsl(var(--brand-500))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.35)] aria-[invalid=true]:border-[var(--error)]';

const CONTEXT = 3;

/** Keep changed lines plus a few lines of context; fold the unchanged runs between them. */
function foldDiff(rows) {
  const keep = new Array(rows.length).fill(false);
  rows.forEach((r, i) => {
    if (r.op === ' ') return;
    for (let j = Math.max(0, i - CONTEXT); j <= Math.min(rows.length - 1, i + CONTEXT); j += 1) keep[j] = true;
  });
  const out = [];
  let hidden = 0;
  rows.forEach((r, i) => {
    if (keep[i]) {
      if (hidden) { out.push({ op: 'fold', n: hidden }); hidden = 0; }
      out.push(r);
    } else hidden += 1;
  });
  if (hidden) out.push({ op: 'fold', n: hidden });
  return out;
}

/** Baseline to your value, line by line. Added lines tint brand, removed lines tint red; unchanged runs fold. */
function DiffView({ rows }) {
  const folded = useMemo(() => foldDiff(rows), [rows]);
  if (!rows.length) return <div className="px-5 pb-4 text-[13px] text-muted-foreground">Both are empty.</div>;
  if (rows.every((r) => r.op === ' ')) return <div className="px-5 pb-4 text-[13px] text-muted-foreground">Identical to the baseline.</div>;
  return (
    <div role="group" aria-label="Changes from the baseline" className="min-h-0 flex-1 overflow-auto pb-4 font-mono text-[12px] leading-relaxed">
      {folded.map((r, i) =>
        r.op === 'fold' ? (
          <div key={i} className="my-1 bg-[hsl(var(--wb-pill))] px-5 py-0.5 font-sans text-xs text-muted-foreground">
            {r.n} unchanged line{r.n === 1 ? '' : 's'}
          </div>
        ) : (
          <div
            key={i}
            className="flex gap-2 px-5"
            style={
              r.op === '+'
                ? { background: 'color-mix(in srgb, hsl(var(--brand-500)) 16%, transparent)' }
                : r.op === '-'
                  ? { background: 'color-mix(in srgb, var(--error) 14%, transparent)' }
                  : undefined
            }
          >
            <span aria-hidden className="w-3 shrink-0 select-none text-muted-foreground">{r.op === ' ' ? '' : r.op === '+' ? '+' : '\u2212'}</span>
            <span className="sr-only">{r.op === '+' ? 'Added: ' : r.op === '-' ? 'Removed: ' : ''}</span>
            <span className={'min-w-0 whitespace-pre-wrap break-words ' + (r.op === ' ' ? 'text-muted-foreground' : 'text-foreground')}>{r.text || ' '}</span>
          </div>
        ),
      )}
    </div>
  );
}

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
  onRun,             // run the comparison with the current overrides
  canRun,
  running,
}) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState('baseline'); // left pane: the baseline, or the diff against it
  const [onlyModified, setOnlyModified] = useState(false);
  const listRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState('');
  const searchRef = useRef(null);
  const textareaRef = useRef(null);

  const keys = baseline?.keys || [];

  // Focus the search box on open (the shared Dialog handles Esc, the focus trap and focus return).
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => searchRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  // Default-select the first key once config loads.
  useEffect(() => {
    if (open && !selected && keys.length) setSelected(keys[0]);
  }, [open, selected, keys]);

  // When the selected key changes, load its current override (or fall back to empty = "use baseline").
  useEffect(() => {
    if (!selected) return;
    setDraft(overrides[selected] ?? '');
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const isSet = (k) => (overrides[k] ?? '') !== '';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return keys.filter((k) => {
      if (onlyModified && (overrides[k] ?? '') === '') return false;
      if (!q) return true;
      const d = baseline?.byKey?.[k]?.description || '';
      return k.toLowerCase().includes(q) || d.toLowerCase().includes(q);
    });
  }, [query, keys, baseline, onlyModified, overrides]);

  const grouped = useMemo(() => {
    const byNs = {};
    for (const k of filtered) (byNs[nsOf(k)] ||= []).push(k);
    return GROUPS.map(([ns, label]) => [label, byNs[ns] || []]).filter(([, arr]) => arr.length);
  }, [filtered]);
  const flat = useMemo(() => grouped.flatMap(([, arr]) => arr), [grouped]);

  const modifiedCount = useMemo(
    () => keys.filter((k) => (overrides[k] ?? '') !== '').length,
    [keys, overrides],
  );

  const b = selected ? baseline?.byKey?.[selected] : null;
  const type = b?.type || 'string';
  const scalar = SCALAR.has(type);
  const baselineStr = b ? fmtVal(b.value) : '';
  const applied = selected ? overrides[selected] ?? '' : '';
  const isModified = applied !== '';
  const check = validateValue(type, draft);
  const dirtyDraft = selected ? (check.ok ? check.value : draft) !== applied : false;
  const diffRows = useMemo(
    () => (view === 'changes' && !scalar ? lineDiff(baselineStr, draft) : []),
    [view, scalar, baselineStr, draft],
  );
  const stats = diffStats(diffRows);

  const commit = () => {
    if (!selected || !check.ok || !dirtyDraft) return;
    setOverride(selected, check.value);
    setDraft(check.value);
  };
  const revert = () => { if (selected) { setOverride(selected, ''); setDraft(''); } };
  const resetToBaseline = () => setDraft(baselineStr); // load baseline text to edit from
  const pick = (value) => { setDraft(value); if (selected) setOverride(selected, value); };
  const onFieldKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || e.currentTarget.tagName === 'INPUT')) { e.preventDefault(); commit(); }
  };

  const clearAll = () => {
    const prev = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== '' && v != null));
    const n = Object.keys(prev).length;
    if (!n) return;
    Object.keys(prev).forEach((k) => setOverride(k, ''));
    setDraft('');
    undoToast(`Cleared ${n} override${n === 1 ? '' : 's'}`, () => {
      Object.entries(prev).forEach(([k, v]) => setOverride(k, v));
      if (selected && prev[selected] != null) setDraft(prev[selected]);
    });
  };

  const runNow = () => {
    commit();
    onClose();
    onRun?.();
  };

  // Up / Down walk the key list (Home / End jump); focus follows the selection.
  const onListKeyDown = (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) || !flat.length) return;
    e.preventDefault();
    const i = Math.max(0, flat.indexOf(selected));
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? flat.length - 1 : Math.min(flat.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)));
    setSelected(flat[next]);
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-key="${CSS.escape(flat[next])}"]`)?.focus());
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <DialogContent
          showCloseButton={false}
          initialFocus={searchRef}
          aria-label="Tuning config editor"
          className="flex h-[88vh] w-full !max-w-6xl flex-col gap-0 overflow-hidden p-0 ring-0 sm:!max-w-6xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--wb-line))] px-5 py-3">
            <div className="flex items-center gap-2.5">
              <DialogTitle className="text-base font-semibold text-foreground">Tuning config</DialogTitle>
              <span className="wb-chip tabular-nums" data-tone={modifiedCount > 0 ? 'brand' : undefined}>
                <CountUp value={modifiedCount} duration={0.3} /> modified
              </span>
            </div>
            <DialogDescription className="sr-only">
              Edit the session overrides sent with a tuning comparison. Nothing here changes global config.
            </DialogDescription>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={clearAll} disabled={modifiedCount === 0}>
                Clear all
              </Button>
              <StateButton
                state={running ? 'running' : 'idle'}
                labels={{ idle: 'Run comparison', running: 'Comparing' }}
                onClick={runNow}
                disabled={!canRun || running || (dirtyDraft && !check.ok)}
                title={!canRun ? 'Type a question in the composer first.' : dirtyDraft && !check.ok ? 'Fix the invalid value first.' : 'Close the editor and compare with these overrides'}
              />
              <button type="button" onClick={onClose} className="wb-iconbtn" aria-label="Close">
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>

          {configError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <StageMark state="failed" size={28} />
              <div className="text-sm font-medium text-foreground">Could not load config</div>
              <div className="max-w-md break-words text-[13px] text-muted-foreground">{configError}</div>
              <Button type="button" onClick={reloadConfig} className="mt-1">
                Retry
              </Button>
            </div>
          ) : !baseline ? (
            <div className="flex flex-1 items-center justify-center gap-2.5 text-[13px] text-muted-foreground" role="status">
              <StageMark state="running" size={18} /> Loading current config
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
              {/* Left: searchable grouped key list */}
              <div className="flex max-h-[34%] shrink-0 flex-col border-b border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-bg))] md:max-h-none md:w-72 md:border-b-0 md:border-r">
                <div className="p-3 pb-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search keys"
                      aria-label="Search keys"
                      className="h-9 w-full rounded-full border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] pl-9 pr-3 text-base text-foreground outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground hover:border-[hsl(var(--brand-300))] focus-visible:border-[hsl(var(--brand-500))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.35)] md:text-[13px]"
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 px-1">
                    <SegmentedPill
                      ariaLabel="Which keys to list"
                      value={onlyModified ? 'modified' : 'all'}
                      onChange={(v) => setOnlyModified(v === 'modified')}
                      options={[
                        { value: 'all', label: 'All' },
                        { value: 'modified', label: `Modified ${modifiedCount}` },
                      ]}
                    />
                    <span className="text-xs tabular-nums text-muted-foreground" role="status">
                      {filtered.length} of {keys.length}
                    </span>
                  </div>
                </div>
                <div ref={listRef} onKeyDown={onListKeyDown} className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                  {grouped.map(([label, arr]) => (
                    <div key={label} className="mb-3">
                      <div className="mb-1 px-2 text-xs font-medium text-muted-foreground">
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
                              data-key={k}
                              tabIndex={active || (!selected && k === flat[0]) ? 0 : -1}
                              onClick={() => setSelected(k)}
                              aria-current={active || undefined}
                              className={`relative flex min-h-8 w-full items-center justify-between gap-2 rounded-full px-3 py-1 text-left font-mono text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] ${
                                active
                                  ? 'text-[hsl(var(--brand-700))]'
                                  : 'text-muted-foreground hover:bg-[hsl(var(--wb-card))] hover:text-foreground'
                              }`}
                            >
                              {active ? <SelectionMarker group="tune-key" bar={false} /> : null}
                              <span className="relative truncate">{k.includes('.') ? k.slice(k.indexOf('.') + 1) : k}</span>
                              {mod ? (
                                <span className="relative inline-flex shrink-0 items-center gap-1 text-[11px] font-sans text-[hsl(var(--brand-700))]">
                                  <span className="size-1.5 rounded-full bg-[hsl(var(--brand-500))]" aria-hidden />
                                  <span className="sr-only">modified</span>
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {filtered.length === 0 ? (
                    <div className="px-2 py-4 text-center text-[13px] text-muted-foreground">
                      {keys.length === 0
                        ? 'No tunable config on this server yet. The global config has not been seeded.'
                        : onlyModified && !query.trim()
                          ? 'Nothing modified yet. Pick a key and enter a value to override it.'
                          : <>No keys match &ldquo;{query}&rdquo;.</>}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Right: baseline | your value editor */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {selected && b ? (
                  <>
                    <div className="border-b border-[hsl(var(--wb-line))] px-5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="break-all font-mono text-sm font-semibold text-foreground">{selected}</code>
                        <span className="wb-chip">{TYPE_LABEL[type] || type}</span>
                        {isModified ? (
                          <span className="wb-chip" data-tone="brand">Overridden</span>
                        ) : null}
                      </div>
                      {b.description ? (
                        <p className="mt-1 text-[13px] text-muted-foreground">{b.description}</p>
                      ) : null}
                    </div>

                    <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 md:grid-cols-2">
                      {/* left: baseline (read-only), or what your value changes */}
                      <div className="flex min-h-0 flex-col border-b border-[hsl(var(--wb-line))] md:border-b-0 md:border-r">
                        <div className="flex items-center justify-between gap-2 px-5 py-2">
                          {scalar ? (
                            <span className="wb-card-title">Baseline (global)</span>
                          ) : (
                            <SegmentedPill
                              ariaLabel="Left pane"
                              value={view}
                              onChange={setView}
                              options={[
                                { value: 'baseline', label: 'Baseline' },
                                { value: 'changes', label: 'Changes' },
                              ]}
                            />
                          )}
                          {view === 'changes' && !scalar ? (
                            <span className="text-xs tabular-nums text-muted-foreground" role="status">
                              +{stats.added} &minus;{stats.removed}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <CopyButton label="Copy" getText={() => baselineStr} variant="ghost" size="xs" disabled={!baselineStr} />
                              {!scalar ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  onClick={resetToBaseline}
                                  title="Copy the baseline text into your editor to tweak from it"
                                >
                                  Edit from this
                                </Button>
                              ) : null}
                            </span>
                          )}
                        </div>
                        {view === 'changes' && !scalar ? (
                          draft === '' ? (
                            <div className="px-5 pb-4 text-[13px] text-muted-foreground">No changes. This key uses the baseline.</div>
                          ) : (
                            <DiffView rows={diffRows} />
                          )
                        ) : (
                          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-5 pb-4 font-mono text-[12px] leading-relaxed text-muted-foreground">
                            {baselineStr || <span className="italic opacity-60">(empty)</span>}
                          </pre>
                        )}
                      </div>

                      {/* right: your value, by type */}
                      <div className="flex min-h-0 flex-col">
                        <div className="flex items-center justify-between gap-2 px-5 py-2">
                          <label htmlFor="tuning-your-value" className="wb-card-title">Your value</label>
                          <span className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
                            {type === 'json' ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                disabled={draft.trim() === '' || formatJson(draft) === null}
                                onClick={() => { const f = formatJson(draft); if (f != null) setDraft(f); }}
                              >
                                <Braces className="size-3.5" aria-hidden /> Format
                              </Button>
                            ) : null}
                            {!scalar ? <>{draft.length.toLocaleString()} chars{draft === '' ? ' \u00b7 using baseline' : ''}</> : null}
                          </span>
                        </div>
                        {type === 'bool' ? (
                          <div className="mx-5 mb-4 space-y-2">
                            <SegmentedPill
                              ariaLabel={`${selected} override`}
                              value={applied}
                              onChange={pick}
                              options={[
                                { value: '', label: 'Baseline' },
                                { value: 'true', label: 'True' },
                                { value: 'false', label: 'False' },
                              ]}
                            />
                            <p className="text-xs text-muted-foreground">Baseline is {baselineStr || 'unset'}. Pick True or False to override it for the candidate.</p>
                          </div>
                        ) : scalar ? (
                          <div className="mx-5 mb-4 space-y-2">
                            <input
                              id="tuning-your-value"
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              onBlur={commit}
                              onKeyDown={onFieldKeyDown}
                              inputMode={type === 'int' ? 'numeric' : 'decimal'}
                              placeholder={baselineStr}
                              spellCheck={false}
                              aria-invalid={!check.ok || undefined}
                              aria-describedby="tuning-value-hint"
                              className={`${FIELD} h-11 w-full font-mono text-base md:text-[13px]`}
                            />
                            <p id="tuning-value-hint" className="text-xs text-muted-foreground">Baseline is {baselineStr || 'unset'}. Leave blank to use it.</p>
                          </div>
                        ) : (
                          <textarea
                            id="tuning-your-value"
                            ref={textareaRef}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={commit}
                            onKeyDown={onFieldKeyDown}
                            placeholder={baselineStr}
                            spellCheck={false}
                            aria-invalid={!check.ok || undefined}
                            aria-describedby="tuning-value-status"
                            className={`${FIELD} mx-4 mb-4 min-h-0 flex-1 resize-none py-3 font-mono text-base leading-relaxed md:text-[12px]`}
                          />
                        )}
                      </div>
                    </div>

                    {/* Footer actions */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[hsl(var(--wb-line))] px-5 py-3">
                      <div id="tuning-value-status" className="min-w-0 text-xs text-muted-foreground" role={check.ok ? undefined : 'alert'}>
                        {!check.ok ? (
                          <span className="font-medium text-[var(--error)]">{check.error} Not applied.</span>
                        ) : (
                          <>Blank uses the baseline. Applies when you leave the field or press {MOD}+Enter, and counts in the next comparison.</>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {dirtyDraft ? (
                          <span className="wb-status wb-pop" data-state="pending">Unapplied edit</span>
                        ) : isModified ? (
                          <span className="wb-status" data-state="done">Applied</span>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          onClick={revert}
                          disabled={!isModified && draft === ''}
                        >
                          <RotateCcw className="size-3.5" aria-hidden /> Revert to baseline
                        </Button>
                        <Button type="button" onClick={commit} disabled={!dirtyDraft || !check.ok}>
                          <Check className="size-3.5" aria-hidden /> Apply edit
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
                    Select a key to edit.
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
