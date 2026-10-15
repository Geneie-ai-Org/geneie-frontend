import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Columns3, Copy, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getAuthHeaders, parseApiErrorDetail } from '@/services/backendApi';
import { apiUrl } from '@/config/api';
import { readTsvStream } from '@/lib/tsvStream';
import { cn } from '@/lib/utils';

const MAX_ROWS = 500;
const COLS_KEY = 'geneie-results-cols-v1';
// One default column per group; within a group the first matching pattern wins.
const DEFAULT_GROUPS = [
  [/^(gene|gene_?symbol|symbol)$/i],
  [/hgvs.?p|protein|amino|aa_?change/i, /hgvs.?c|^hgvs/i],
  [/conseq|effect|variant_?class|impact/i],
  [/classif|clinvar|significance|acmg/i],
  [/freq|gnomad|(^|_)af($|_)|allele_?f/i],
  [/rank|priority/i],
  [/score/i],
];
const NUM_RE = /^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;

const readStoredCols = () => {
  try {
    const v = JSON.parse(localStorage.getItem(COLS_KEY));
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
};

function defaultColumns(header) {
  const picked = [];
  for (const group of DEFAULT_GROUPS) {
    for (const re of group) {
      const hit = header.find((h) => !picked.includes(h) && re.test(h));
      if (hit) { picked.push(hit); break; }
    }
  }
  return picked.length ? picked : header.slice(0, 6);
}

async function loadResults(conversationId, signal, onProgress) {
  const headers = await getAuthHeaders();
  const id = encodeURIComponent(conversationId);
  const elig = await fetch(apiUrl(`/api/export-variants-eligibility/${id}`), { headers, signal });
  const eligData = await elig.json().catch(() => ({}));
  if (!elig.ok) throw new Error(parseApiErrorDetail(eligData.detail) || 'Failed to check export eligibility');
  if (eligData.can_export !== true) return { blocked: eligData.message || 'Nothing to show yet.' };
  const res = await fetch(apiUrl(`/api/export-variants/${id}`), { headers, signal });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(parseApiErrorDetail(data.detail) || 'Export failed');
  }
  const out = await readTsvStream(res, { maxRows: MAX_ROWS, onProgress });
  return { ...out, rowCount: eligData.row_count };
}

function Notice({ title, body, children }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {body && <p className="max-w-xs text-xs text-muted-foreground">{body}</p>}
      {children}
    </div>
  );
}

export default function VariantResultsViewer({ conversationId, filteredCount = null, refreshKey, onOpenFilters }) {
  const [state, setState] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(null); // { col, dir }
  const [picked, setPicked] = useState(readStoredCols);
  const [selected, setSelected] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!conversationId) return undefined;
    const ctrl = new AbortController();
    setState({ status: 'loading' });
    setSelected(null);
    (async () => {
      try {
        const r = await loadResults(conversationId, ctrl.signal, (header, rows) => {
          if (!ctrl.signal.aborted) setState({ status: 'ready', header, rows: rows.slice(), truncated: false, streaming: true });
        });
        if (ctrl.signal.aborted) return;
        if (r.blocked) setState({ status: 'blocked', reason: r.blocked });
        else {
          setState({ status: 'ready', header: r.header, rows: r.rows, truncated: r.truncated, rowCount: r.rowCount });
          if (r.truncated) ctrl.abort(); // drop the rest of the download
        }
      } catch (e) {
        if (ctrl.signal.aborted || e?.name === 'AbortError') return;
        setState({ status: 'error', message: e?.message || 'Could not load results' });
      }
    })();
    return () => ctrl.abort();
  }, [conversationId, refreshKey, attempt]);

  const { header = [], rows = [] } = state;
  const visibleCols = useMemo(() => {
    const keep = picked ? header.filter((h) => picked.includes(h)) : [];
    return keep.length ? keep : defaultColumns(header);
  }, [header, picked]);
  const colIdx = useMemo(() => visibleCols.map((c) => header.indexOf(c)), [visibleCols, header]);
  const numeric = useMemo(
    () => colIdx.map((i) => {
      const vals = rows.map((r) => r[i]).filter((v) => v != null && v !== '' && v !== '.' && v !== 'NA');
      return vals.length > 0 && vals.filter((v) => NUM_RE.test(v)).length / vals.length >= 0.8;
    }),
    [colIdx, rows],
  );

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows.map((r, n) => ({ r, n: n + 1 }));
    if (q) out = out.filter(({ r }) => colIdx.some((i) => (r[i] || '').toLowerCase().includes(q)));
    if (sort) {
      const k = visibleCols.indexOf(sort.col);
      const i = colIdx[k];
      const isNum = numeric[k];
      const val = (r) => (isNum ? parseFloat(r[i]) : r[i] || '');
      const empty = (r) => (isNum ? Number.isNaN(val(r)) : r[i] === '' || r[i] == null);
      out = [...out].sort((a, b) => {
        if (empty(a.r) !== empty(b.r)) return empty(a.r) ? 1 : -1; // blanks last either way
        const d = isNum ? val(a.r) - val(b.r) : String(val(a.r)).localeCompare(String(val(b.r)), undefined, { numeric: true });
        return sort.dir === 'asc' ? d : -d;
      });
    }
    return out;
  }, [rows, query, sort, colIdx, visibleCols, numeric]);

  const toggleCol = (name) => {
    const next = visibleCols.includes(name) ? visibleCols.filter((c) => c !== name) : header.filter((h) => visibleCols.includes(h) || h === name);
    if (!next.length) return;
    setPicked(next);
    try { localStorage.setItem(COLS_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  };
  const cycleSort = (col) =>
    setSort((s) => (s?.col !== col ? { col, dir: 'asc' } : s.dir === 'asc' ? { col, dir: 'desc' } : null));

  const copyTsv = useCallback(async () => {
    const lines = [visibleCols.join('\t'), ...view.map(({ r }) => colIdx.map((i) => r[i] ?? '').join('\t'))];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }, [visibleCols, view, colIdx]);

  if (!conversationId) return <Notice title="No variants yet" body="Upload a file to see results here." />;
  if (state.status === 'blocked' || (state.status === 'ready' && !state.streaming && rows.length === 0)) {
    return (
      <Notice
        title={state.status === 'blocked' ? 'Results are not available yet' : 'No variants in the current filters'}
        body={state.reason || 'Loosen or reset your filters to see variants here.'}
      >
        {onOpenFilters && (
          <Button variant="outline" size="sm" onClick={onOpenFilters} className="mt-1 max-md:h-11">
            <SlidersHorizontal aria-hidden /> Open filters
          </Button>
        )}
      </Notice>
    );
  }
  if (state.status === 'error') {
    return (
      <Notice title="Could not load results" body={state.message}>
        <Button variant="outline" size="sm" onClick={() => setAttempt((a) => a + 1)} className="mt-1 max-md:h-11">Retry</Button>
      </Notice>
    );
  }

  const loading = state.status === 'loading';
  const total = filteredCount ?? state.rowCount ?? null;
  const footer = loading ? 'Loading variants…'
    : state.streaming ? `Loading… ${rows.length} rows`
    : state.truncated || (total != null && total > rows.length)
      ? `Showing first ${rows.length.toLocaleString()}${total != null ? ` of ${total.toLocaleString()}` : ''}`
      : `${rows.length.toLocaleString()} ${rows.length === 1 ? 'row' : 'rows'}`;
  const th = 'sticky top-0 z-10 h-[28px] border-b border-border bg-background px-3 text-left text-[12px] font-medium text-muted-foreground';
  const gutter = 'sticky left-0 z-[5] w-11 min-w-11 border-r border-border px-2 text-right text-[12px] tabular-nums text-muted-foreground select-none';

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border px-2">
        <label className="relative flex min-w-0 flex-1 items-center">
          <Search aria-hidden className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter rows"
            aria-label="Filter rows"
            className="h-7 w-full rounded-md bg-transparent pl-7 pr-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60"
          />
        </label>
        <Popover>
          <PopoverTrigger
            disabled={!header.length}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[13px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 max-md:h-11"
          >
            <Columns3 aria-hidden className="size-3.5" /> Columns
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={6} className="max-h-72 w-60 gap-0.5 overflow-y-auto p-1.5">
            {header.map((h) => (
              <label key={h} className="flex h-7 cursor-pointer items-center gap-2 rounded px-1.5 text-[13px] hover:bg-muted">
                <Checkbox checked={visibleCols.includes(h)} onCheckedChange={() => toggleCol(h)} />
                <span className="truncate font-[family-name:var(--font-mono)] text-[12px]">{h}</span>
              </label>
            ))}
          </PopoverContent>
        </Popover>
        <button
          type="button"
          onClick={copyTsv}
          disabled={!view.length}
          aria-label="Copy visible rows as TSV"
          title="Copy visible rows as TSV"
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 max-md:size-11"
        >
          {copied ? <Check aria-hidden className="size-3.5 text-[var(--success)]" /> : <Copy aria-hidden className="size-3.5" />}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto" aria-busy={loading || undefined}>
        {loading ? (
          <div aria-label="Loading variants" className="divide-y divide-border">
            {Array.from({ length: 14 }, (_, i) => (
              <div key={i} className="flex h-[28px] items-center gap-3 px-3">
                <span className="h-2.5 w-6 rounded bg-muted" />
                <span className="h-2.5 rounded bg-muted animate-pulse motion-reduce:animate-none" style={{ width: `${40 + ((i * 37) % 45)}%` }} />
              </div>
            ))}
          </div>
        ) : (
          <table className="w-max min-w-full border-separate border-spacing-0 font-[family-name:var(--font-mono)] text-[13px]">
            <thead>
              <tr>
                <th className={cn(th, gutter, 'z-20 font-normal')} aria-label="Row">#</th>
                {visibleCols.map((c, k) => (
                  <th
                    key={c}
                    scope="col"
                    aria-sort={sort?.col === c ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={cn(th, 'p-0', numeric[k] && 'text-right')}
                  >
                    <button
                      type="button"
                      onClick={() => cycleSort(c)}
                      title={`Sort by ${c}`}
                      className={cn('flex h-[28px] w-full items-center gap-1 px-3 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60', numeric[k] && 'flex-row-reverse')}
                    >
                      <span className="truncate">{c}</span>
                      {sort?.col === c && (sort.dir === 'asc' ? <ArrowUp aria-hidden className="size-3 shrink-0" /> : <ArrowDown aria-hidden className="size-3 shrink-0" />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.map(({ r, n }) => {
                const on = selected === n;
                const bg = on ? 'bg-accent' : 'bg-background group-hover:bg-muted';
                return (
                  <tr key={n} onClick={() => setSelected(on ? null : n)} className="group h-[28px] cursor-default">
                    <td className={cn(gutter, 'h-[28px] border-b border-border', bg, on && 'text-foreground')}>{n}</td>
                    {colIdx.map((i, k) => (
                      <td
                        key={i}
                        title={r[i] || undefined}
                        className={cn('h-[28px] max-w-[260px] truncate whitespace-nowrap border-b border-border px-3 text-foreground', bg, numeric[k] && 'text-right tabular-nums')}
                      >
                        {r[i]}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && !view.length && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">No rows match “{query}”.</p>
        )}
      </div>

      <div className="flex h-7 shrink-0 items-center justify-between gap-2 border-t border-border px-3 text-[12px] tabular-nums text-muted-foreground">
        <span className="truncate">{footer}</span>
        {query.trim() && !loading && <span>{view.length.toLocaleString()} match</span>}
      </div>
    </div>
  );
}
