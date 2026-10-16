import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Info, Search, X } from 'lucide-react';
import {
  fetchPanelAppSuggestions,
  persistPanelAppSelection,
  resolvePanelAppSelection,
  searchPanelAppPanels,
} from '@/services/backendApi';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChipList, CountUp, PopIn, StageMark } from '@/components/motion';

const fmt = (n) => Number(n || 0).toLocaleString();

/** Role=switch, 44px hit area on mobile. Teal when on; the knob slides (transform only). */
function Switch({ checked, onChange, disabled, labelledBy }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none after:absolute after:-inset-x-1 after:-inset-y-3 max-md:after:-inset-y-3.5 ${
        checked ? 'border-[hsl(var(--brand-500))] bg-[hsl(var(--brand-500))]' : 'border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-pill))]'
      }`}
    >
      <span
        aria-hidden
        className="block size-3.5 rounded-full bg-[hsl(var(--wb-card))] shadow-sm transition-transform duration-150 motion-reduce:transition-none"
        style={{ transform: checked ? 'translateX(18px)' : 'translateX(2px)' }}
      />
    </button>
  );
}

/** Click-to-open help (never hover-only). */
function HelpPopover({ label, children }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className="relative inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-[hsl(var(--brand-700))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] after:absolute after:-inset-2.5"
      >
        <Info className="size-3.5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 text-xs leading-snug">
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** Relative match meter. Strong rows use the accent, weak rows stay neutral so
 * generic panels never read as "relevant" just because they are listed. The figure beside it
 * is the same ratio in words, so the bar is never the only carrier. */
function RelevanceBar({ ratio }) {
  const strong = ratio >= 0.6;
  const pct = Math.max(1, Math.round(ratio * 100));
  return (
    <span className="flex items-center gap-1.5" aria-hidden>
      <span className="block h-1 w-12 overflow-hidden rounded-full bg-[hsl(var(--wb-pill))]">
        <span
          className={`block h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none ${strong ? 'bg-[hsl(var(--brand-500))]' : 'bg-[hsl(var(--wb-line-strong))]'}`}
          style={{ width: `${Math.max(6, pct)}%` }}
        />
      </span>
      <span className="w-8 text-right text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
    </span>
  );
}

function PanelRow({ row, checked, disabled, onToggle, topScore, rank, showCue }) {
  const id = String(row.panel_id || '').trim();
  const geneN = Array.isArray(row.matched_genes) ? row.matched_genes.length : 0;
  const score = Number(row.score);
  const hasScore = Number.isFinite(score) && score > 0 && topScore > 0;
  const ratio = hasScore ? Math.min(1, score / topScore) : 0;
  const green = Number(row.green_count) || 0;
  const amber = Number(row.amber_count) || 0;
  // Why this panel is listed: the API's own reason, minus the gene counts the pills already show.
  const why = showCue
    ? String(row.reason || '')
        .split(';')
        .map((x) => x.trim())
        .filter((x) => x && !/gene\(s\)$/i.test(x) && x !== 'gene overlap')
        .join('; ')
    : '';
  const whyText = why ? `${why.charAt(0).toUpperCase()}${why.slice(1)}` : '';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onToggle(id)}
      title={row.reason || undefined}
      className={`group mb-1.5 flex w-full items-start gap-2.5 rounded-2xl border px-3 py-2.5 text-left outline-none transition-[background-color,border-color,transform] duration-150 last:mb-0 focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] active:scale-[0.995] disabled:opacity-60 motion-reduce:transition-none max-md:min-h-11 ${
        checked
          ? 'border-[hsl(var(--brand-300))] bg-[hsl(var(--brand-100))]'
          : 'border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-card))] hover:border-[hsl(var(--brand-300))] hover:bg-[hsl(var(--brand-50))]'
      }`}
    >
      <span
        aria-hidden
        className={`mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ${
          checked
            ? 'border-[hsl(var(--brand-500))] bg-[hsl(var(--brand-500))] text-[hsl(var(--wb-card))]'
            : 'border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))]'
        }`}
      >
        {checked ? <Check className="wb-draw-lucide size-3" strokeWidth={3.2} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 break-words text-[13px] font-medium leading-snug text-foreground">
            {row.panel_name || id}
          </span>
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1">
          {showCue && rank === 0 && hasScore ? (
            <span className="wb-chip !h-5 shrink-0 text-[11px]" data-tone="brand">
              Top match
            </span>
          ) : null}
          <span className="inline-flex h-5 items-center rounded-full border border-[hsl(var(--wb-line-strong))] px-2 text-[11px] font-medium text-muted-foreground">PanelApp</span>
          {geneN > 0 ? (
            <span className="inline-flex h-5 items-center rounded-full bg-[hsl(var(--wb-pill))] px-2 text-[11px] font-medium tabular-nums text-foreground">
              {fmt(geneN)} {showCue ? 'matching ' : ''}gene{geneN === 1 ? '' : 's'}
            </span>
          ) : null}
          {showCue && green ? (
            <span className="inline-flex h-5 items-center rounded-full bg-[hsl(var(--wb-pill))] px-2 text-[11px] tabular-nums text-muted-foreground">{green} high-confidence</span>
          ) : null}
          {showCue && amber ? (
            <span className="inline-flex h-5 items-center rounded-full bg-[hsl(var(--wb-pill))] px-2 text-[11px] tabular-nums text-muted-foreground">{amber} lower</span>
          ) : null}
        </span>
        {whyText ? <span className="mt-1 block text-xs leading-snug text-muted-foreground">{whyText}</span> : null}
      </span>
      {showCue && hasScore ? (
        <span className="flex shrink-0 flex-col items-end gap-1 pt-1" title={`Match score ${score}`}>
          <RelevanceBar ratio={ratio} />
        </span>
      ) : null}
    </button>
  );
}

function GroupHeader({ children, aside }) {
  return (
    <div className="flex items-baseline justify-between px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">
      <span>{children}</span>
      {aside ? <span className="font-normal tabular-nums">{aside}</span> : null}
    </div>
  );
}

/**
 * Analyst-selected gene panels for GA ranking boost (Track 14.6).
 * Manual: suggestions + catalog search; nothing checked until user picks.
 * Automatic: preselect top suggested panel (user can change).
 */
export default function PanelAppSuggestSection({
  confirmedHpoIds = [],
  phenotypeText = '',
  value = null,
  onChange,
  conversationId = null,
  disabled = false,
  isAutomatic = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [includeAmber, setIncludeAmber] = useState(
    value?.selected_panel_include_amber !== false
  );
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHits, setSearchHits] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const seqRef = useRef(0);
  const searchSeqRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const userTouchedRef = useRef(false);
  const lastHpoKeyRef = useRef('');

  const selectedIds = useMemo(() => {
    const fromMeta = value?.selected_panels;
    if (!Array.isArray(fromMeta)) return new Set();
    return new Set(fromMeta.map((p) => String(p.panel_id || p).trim()).filter(Boolean));
  }, [value?.selected_panels]);

  const hpoKey = useMemo(
    () =>
      (confirmedHpoIds || [])
        .map((id) => String(id || '').trim().toUpperCase())
        .filter(Boolean)
        .sort()
        .join(','),
    [confirmedHpoIds]
  );

  useEffect(() => {
    if (hpoKey === lastHpoKeyRef.current) return;
    lastHpoKeyRef.current = hpoKey;
    userTouchedRef.current = false;
  }, [hpoKey]);

  // Freeze phenotype text used for API: when HPOs are confirmed, gene overlap is enough —
  // avoid refetch storms from unrelated text churn.
  const suggestPhenotypeText = hpoKey ? '' : String(phenotypeText || '').trim();

  useEffect(() => {
    if (!hpoKey && !suggestPhenotypeText) {
      setSuggestions([]);
      setError('');
      return undefined;
    }
    const seq = ++seqRef.current;
    setLoading(true);
    setError('');
    // Longer debounce while analysts click many finding chips.
    const delay = hpoKey ? 450 : 300;
    const timer = setTimeout(async () => {
      try {
        const data = await fetchPanelAppSuggestions({
          conversationId,
          hpoIds: hpoKey ? hpoKey.split(',') : [],
          phenotypeText: suggestPhenotypeText,
          includeAmber,
          limit: 10,
        });
        if (seq !== seqRef.current) return;
        setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
      } catch (err) {
        if (seq !== seqRef.current) return;
        // Keep prior suggestions on transient errors so the list does not blank out.
        setError(err.message || 'Could not load gene panel suggestions');
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [hpoKey, suggestPhenotypeText, includeAmber, conversationId, retryNonce]);

  // Manual: catalog search when query has 2+ chars.
  useEffect(() => {
    if (isAutomatic) {
      setSearchHits([]);
      setSearchLoading(false);
      return undefined;
    }
    const q = String(searchQuery || '').trim();
    if (q.length < 2) {
      setSearchHits([]);
      setSearchLoading(false);
      return undefined;
    }
    const seq = ++searchSeqRef.current;
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await searchPanelAppPanels({
          query: q,
          includeAmber,
          limit: 20,
        });
        if (seq !== searchSeqRef.current) return;
        setSearchHits(Array.isArray(data?.suggestions) ? data.suggestions : []);
      } catch (err) {
        if (seq !== searchSeqRef.current) return;
        setSearchHits([]);
        setError(err.message || 'Could not search gene panels');
      } finally {
        if (seq === searchSeqRef.current) setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, includeAmber, isAutomatic]);

  const applySelection = useCallback(
    async (nextIds, amber = includeAmber) => {
      if (typeof onChangeRef.current !== 'function') return;
      setSaving(true);
      setError('');
      try {
        let resolved;
        if (conversationId) {
          resolved = await persistPanelAppSelection(conversationId, {
            panelIds: nextIds,
            includeAmber: amber,
          });
        } else {
          resolved = await resolvePanelAppSelection({
            panelIds: nextIds,
            includeAmber: amber,
          });
        }
        onChangeRef.current({
          selected_panels: resolved.selected_panels || [],
          selected_panel_gene_list: resolved.selected_panel_gene_list || [],
          selected_panel_include_amber:
            resolved.selected_panel_include_amber ?? amber,
        });
      } catch (err) {
        setError(err.message || 'Could not save panel selection');
      } finally {
        setSaving(false);
      }
    },
    [conversationId, includeAmber]
  );

  // Automatic: preselect top suggested panel once per finding set (unless user already chose).
  useEffect(() => {
    if (!isAutomatic || disabled || saving || loading) return;
    if (userTouchedRef.current || selectedIds.size > 0) return;
    const topId = String(suggestions[0]?.panel_id || '').trim();
    if (!topId) return;
    applySelection([topId]);
  }, [
    isAutomatic,
    disabled,
    saving,
    loading,
    suggestions,
    selectedIds.size,
    applySelection,
  ]);

  const togglePanel = (panelId) => {
    if (disabled || saving) return;
    userTouchedRef.current = true;
    const next = new Set(selectedIds);
    if (next.has(panelId)) next.delete(panelId);
    else next.add(panelId);
    applySelection([...next]);
  };

  const clearSelection = () => {
    if (disabled || saving) return;
    userTouchedRef.current = true;
    applySelection([]);
  };

  const suggestionIds = useMemo(
    () => new Set(suggestions.map((s) => String(s.panel_id || '').trim()).filter(Boolean)),
    [suggestions]
  );

  const topScore = useMemo(
    () => suggestions.reduce((m, s) => Math.max(m, Number(s.score) || 0), 0),
    [suggestions]
  );

  // Selected panels that are not in the current list (e.g. picked from an earlier search).
  const selectedExtras = useMemo(() => {
    const out = [];
    for (const p of value?.selected_panels || []) {
      const id = String(p.panel_id || p || '').trim();
      if (id && !suggestionIds.has(id)) {
        out.push({ panel_id: id, panel_name: p.panel_name || id, matched_genes: [] });
      }
    }
    return out;
  }, [value?.selected_panels, suggestionIds]);

  const q = String(searchQuery || '').trim();
  const searching = !isAutomatic && q.length >= 2;

  // While searching, keep already-selected panels visible even when not in the hits.
  const searchRows = useMemo(() => {
    if (!searching) return [];
    const byId = new Map();
    for (const s of searchHits) {
      const id = String(s.panel_id || '').trim();
      if (id) byId.set(id, s);
    }
    for (const p of value?.selected_panels || []) {
      const id = String(p.panel_id || p || '').trim();
      if (id && !byId.has(id)) {
        byId.set(id, { panel_id: id, panel_name: p.panel_name || id, matched_genes: [] });
      }
    }
    return [...byId.values()];
  }, [searching, searchHits, value?.selected_panels]);

  if (!hpoKey && !String(phenotypeText || '').trim()) return null;

  const geneCount = Array.isArray(value?.selected_panel_gene_list)
    ? value.selected_panel_gene_list.length
    : 0;
  const busy = disabled || saving;
  const switchLabelId = 'panelapp-amber-label';
  const showSkeleton = loading && suggestions.length === 0;
  const noSuggestions = !loading && suggestions.length === 0 && !error;

  // Selected panels as chips (name from the saved selection), removable in place.
  const selectedPanelChips = (value?.selected_panels || [])
    .map((p) => {
      const id = String(p?.panel_id || p || '').trim();
      return id ? { id, name: p?.panel_name || suggestions.find((x) => String(x.panel_id).trim() === id)?.panel_name || id } : null;
    })
    .filter(Boolean);

  return (
    <div className="space-y-3" aria-busy={loading || searchLoading || undefined}>
      <div>
        <h3 className="text-[13px] font-semibold text-foreground">Gene panels</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {isAutomatic
            ? 'Optional. The best match is selected for ranking. Change or clear it if needed.'
            : 'Optional. Selected panels boost the ranking of their genes.'}
        </p>
      </div>

      <div className="wb-card flex items-center justify-between gap-3 px-3.5 py-2 max-md:min-h-11">
        <span className="flex min-w-0 items-center gap-1.5">
          <span id={switchLabelId} className="text-[13px] font-medium text-foreground">
            Include lower-confidence genes
          </span>
          <HelpPopover label="About lower-confidence genes">
            <p className="font-medium text-foreground">Lower-confidence genes</p>
            <p className="mt-1 text-muted-foreground">
              PanelApp rates each gene green (high confidence) or amber (some evidence). Turn this on
              to add amber genes to the panels you pick. Turn it off to keep green genes only.
            </p>
          </HelpPopover>
        </span>
        <Switch
          checked={includeAmber}
          disabled={busy}
          labelledBy={switchLabelId}
          onChange={(next) => {
            setIncludeAmber(next);
            if (selectedIds.size > 0) {
              userTouchedRef.current = true;
              applySelection([...selectedIds], next);
            }
          }}
        />
      </div>

      {!isAutomatic && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={searchQuery}
            disabled={disabled}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search all panels by name"
            aria-label="Search gene panels"
            className="h-9 w-full rounded-full border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] pl-9 pr-9 text-base text-foreground outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground hover:border-[hsl(var(--brand-300))] focus-visible:border-[hsl(var(--brand-500))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.35)] disabled:opacity-60 md:text-[13px] max-md:h-11 [&::-webkit-search-cancel-button]:hidden"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-[hsl(var(--brand-100))] hover:text-[hsl(var(--brand-700))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] max-md:size-9"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      )}

      {error ? (
        <div
          role="alert"
          className="wb-rise flex items-start gap-2 rounded-2xl px-3.5 py-2.5 text-[13px]"
          style={{
            background: 'var(--error-soft)',
            border: '1px solid color-mix(in srgb, var(--error) 30%, transparent)',
            color: 'var(--text-primary)',
          }}
        >
          <StageMark state="failed" size={16} className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="font-medium">{error}.</span>{' '}
            <span className="text-muted-foreground">
              {isAutomatic
                ? 'Ranking will run without a panel boost unless you retry.'
                : 'You can retry, or continue without a boost.'}
            </span>
          </span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="shrink-0 max-md:h-9"
            onClick={() => {
              setError('');
              setRetryNonce((n) => n + 1);
            }}
          >
            Retry
          </Button>
        </div>
      ) : null}

      <div className="wb-card p-1.5">
        {showSkeleton ? (
          <div className="space-y-2 p-1.5" role="status" aria-label="Loading panel suggestions">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-start gap-2.5 px-1.5 py-1.5">
                <div className="wb-shimmer mt-0.5 size-[18px] rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <div className="wb-shimmer h-3.5 w-3/5 rounded-full" />
                  <div className="wb-shimmer h-3 w-2/5 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {!searching && !showSkeleton && suggestions.length > 0 ? (
          <div>
            <GroupHeader
              aside={
                loading ? (
                  <span className="inline-flex items-center gap-1.5">
                    <StageMark state="running" size={12} />
                    Updating
                  </span>
                ) : (
                  <>
                    <CountUp value={suggestions.length} duration={0.4} /> suggested
                  </>
                )
              }
            >
              Suggested for these findings
            </GroupHeader>
            {suggestions.map((s, i) => {
              const id = String(s.panel_id || '').trim();
              if (!id) return null;
              return (
                <PanelRow
                  key={id}
                  row={s}
                  checked={selectedIds.has(id)}
                  disabled={busy}
                  onToggle={togglePanel}
                  topScore={topScore}
                  rank={i}
                  showCue
                />
              );
            })}
            {suggestions.length > 0 && topScore > 0 ? (
              <p className="px-3 pb-1 pt-1.5 text-xs text-muted-foreground">
                Bars and percentages compare each panel with the best match (100%). A low figure means a weak match.
              </p>
            ) : null}
          </div>
        ) : null}

        {noSuggestions && !searching ? (
          <div className="px-3 py-4 text-center">
            <p className="text-[13px] font-medium text-foreground">No panels matched these findings</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isAutomatic
                ? 'Ranking will run without a panel boost.'
                : 'Search above to pick a panel, or continue without a boost.'}
            </p>
          </div>
        ) : null}

        {!searching && selectedExtras.length > 0 ? (
          <div className="mt-1 border-t border-[hsl(var(--wb-line))] pt-0.5">
            <GroupHeader>Also selected</GroupHeader>
            {selectedExtras.map((s) => (
              <PanelRow
                key={s.panel_id}
                row={s}
                checked
                disabled={busy}
                onToggle={togglePanel}
                topScore={0}
                rank={-1}
                showCue={false}
              />
            ))}
          </div>
        ) : null}

        {searching ? (
          <div className="max-h-80 overflow-y-auto">
            <GroupHeader
              aside={
                searchLoading ? (
                  <span className="inline-flex items-center gap-1.5">
                    <StageMark state="running" size={12} />
                    Searching
                  </span>
                ) : (
                  <>
                    <CountUp value={searchRows.length} duration={0.3} /> result{searchRows.length === 1 ? '' : 's'}
                  </>
                )
              }
            >
              All panels matching &ldquo;{q}&rdquo;
            </GroupHeader>
            {!searchLoading && searchRows.length === 0 && !error ? (
              <p className="px-3 py-3 text-[13px] text-muted-foreground">
                No panels matched &ldquo;{q}&rdquo;. Try a shorter name.
              </p>
            ) : null}
            {searchRows.map((s) => {
              const id = String(s.panel_id || '').trim();
              if (!id) return null;
              return (
                <PanelRow
                  key={id}
                  row={s}
                  checked={selectedIds.has(id)}
                  disabled={busy}
                  onToggle={togglePanel}
                  topScore={0}
                  rank={-1}
                  showCue={false}
                />
              );
            })}
          </div>
        ) : !isAutomatic && !showSkeleton ? (
          <p className="mt-1 border-t border-[hsl(var(--wb-line))] px-3 py-2 text-xs text-muted-foreground">
            Not listed? Search to browse all panels.
          </p>
        ) : null}
      </div>

      {selectedIds.size > 0 ? (
        <div
          className="wb-rise sticky bottom-0 z-10 space-y-2 rounded-2xl border border-[hsl(var(--brand-300))] bg-[hsl(var(--wb-card))] px-3 py-2 shadow-sm"
          role="status"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] tabular-nums text-foreground">
              <span className="font-medium">
                <CountUp value={selectedIds.size} duration={0.3} /> panel{selectedIds.size === 1 ? '' : 's'}
              </span>
              {geneCount > 0 ? (
                <>
                  {' · '}
                  <CountUp value={geneCount} duration={0.5} /> genes
                </>
              ) : null}
              {saving ? (
                <span className="ml-2 inline-flex items-center gap-1.5 text-muted-foreground">
                  <StageMark state="running" size={12} />
                  Saving
                </span>
              ) : null}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={clearSelection}
              disabled={busy}
              className="max-md:h-9"
            >
              Clear all
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <ChipList>
              {selectedPanelChips.map((chip) => (
                <PopIn key={chip.id} className="max-w-full">
                  <span className="wb-chip max-w-full gap-1 !pr-1" data-tone="brand">
                    <span className="truncate">{chip.name}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => togglePanel(chip.id)}
                      aria-label={`Remove ${chip.name}`}
                      className="inline-flex size-4 shrink-0 items-center justify-center rounded-full outline-none transition-colors hover:bg-[hsl(var(--brand-200))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] disabled:opacity-50"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </span>
                </PopIn>
              ))}
            </ChipList>
          </div>
        </div>
      ) : null}
    </div>
  );
}
