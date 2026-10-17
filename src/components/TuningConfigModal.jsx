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
import { Search, X, RotateCcw, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CountUp, SelectionMarker, StageMark } from '@/components/motion';

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

  const b = selected ? baseline?.byKey?.[selected] : null;
  const baselineStr = b ? fmtVal(b.value) : '';
  const isModified = selected ? (overrides[selected] ?? '') !== '' : false;
  const dirtyDraft = selected ? draft !== (overrides[selected] ?? '') : false;

  const commit = () => { if (selected) setOverride(selected, draft); };
  const revert = () => { if (selected) { setOverride(selected, ''); setDraft(''); } };
  const resetToBaseline = () => setDraft(baselineStr); // load baseline text to edit from

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
            <button type="button" onClick={onClose} className="wb-iconbtn" aria-label="Close">
              <X className="size-4" aria-hidden />
            </button>
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
                  <div className="mt-1.5 px-2 text-xs tabular-nums text-muted-foreground" role="status">
                    {filtered.length} of {keys.length} keys
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
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
                        {isModified ? (
                          <span className="wb-chip" data-tone="brand">Overridden</span>
                        ) : null}
                      </div>
                      {b.description ? (
                        <p className="mt-1 text-[13px] text-muted-foreground">{b.description}</p>
                      ) : null}
                    </div>

                    <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 md:grid-cols-2">
                      {/* baseline (read-only) */}
                      <div className="flex min-h-0 flex-col border-b border-[hsl(var(--wb-line))] md:border-b-0 md:border-r">
                        <div className="flex items-center justify-between gap-2 px-5 py-2">
                          <span className="wb-card-title">Baseline (global)</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={resetToBaseline}
                            title="Copy the baseline text into your editor to tweak from it"
                          >
                            Edit from this
                          </Button>
                        </div>
                        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-5 pb-4 font-mono text-[12px] leading-relaxed text-muted-foreground">
                          {baselineStr || <span className="italic opacity-60">(empty)</span>}
                        </pre>
                      </div>

                      {/* your value (editable) */}
                      <div className="flex min-h-0 flex-col">
                        <div className="flex items-center justify-between gap-2 px-5 py-2">
                          <label htmlFor="tuning-your-value" className="wb-card-title">Your value</label>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {draft.length.toLocaleString()} chars{draft === '' ? ' · using baseline' : ''}
                          </span>
                        </div>
                        <textarea
                          id="tuning-your-value"
                          ref={textareaRef}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={commit}
                          placeholder={baselineStr}
                          spellCheck={false}
                          className="mx-4 mb-4 min-h-0 flex-1 resize-none rounded-2xl border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] px-4 py-3 font-mono text-base leading-relaxed text-foreground outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground/60 hover:border-[hsl(var(--brand-300))] focus-visible:border-[hsl(var(--brand-500))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.35)] md:text-[12px]"
                        />
                      </div>
                    </div>

                    {/* Footer actions */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[hsl(var(--wb-line))] px-5 py-3">
                      <div className="text-xs text-muted-foreground">
                        Leave blank to use the baseline. Changes apply to the candidate column when you run a comparison.
                      </div>
                      <div className="flex items-center gap-2">
                        {dirtyDraft ? (
                          <span className="wb-status wb-pop" data-state="pending">Unapplied edit</span>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          onClick={revert}
                          disabled={!isModified && draft === ''}
                        >
                          <RotateCcw className="size-3.5" aria-hidden /> Revert to baseline
                        </Button>
                        <Button type="button" onClick={commit} disabled={!dirtyDraft}>
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
