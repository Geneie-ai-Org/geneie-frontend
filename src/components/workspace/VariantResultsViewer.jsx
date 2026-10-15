import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Check, Columns3, Copy, Search, SlidersHorizontal, X } from 'lucide-react';
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
// Mono is for identifiers and sequences only; names, classes and numbers stay in the UI face.
const MONO_RE = /hgvs|(^|_)(id|rsid|ref|alt|chrom|cdna|seq|sequence|transcript)($|_)|^rs_?|dbsnp|variant_?id/i;
// Full-alpha 2px ring (the global one is 45% alpha, under 3:1 on white).
const FOCUS = 'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]';
const GUTTER_W = 44;
const MIN_COL = 72;
const MAX_COL = 260;
const SAMPLE_ROWS = 60;
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
  const out = await readTsvStream(res, { maxRows: MAX_ROWS, onProgress, signal });
  return { ...out, rowCount: eligData.row_count };
}

function Notice({ title, body, role, children }) {
  return (
    <div role={role} className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-[15px] font-medium text-foreground">{title}</p>
      {body && <p className="max-w-xs text-[13px] leading-5 text-muted-foreground">{body}</p>}
      {children}
    </div>
  );
}

/** Loading placeholder with the same header, gutter and row height as the table, so nothing jumps. */
function TableSkeleton() {
  return (
    <div role="status" aria-label="Loading variants" className="min-w-full">
      <div className="flex h-[28px] items-center border-b border-border">
        <span style={{ width: GUTTER_W }} className="shrink-0" />
        {[88, 140, 72].map((w, i) => (
          <span key={i} className="px-3"><span className="block h-2.5 rounded bg-muted" style={{ width: w }} /></span>
        ))}
      </div>
      {Array.from({ length: 16 }, (_, i) => (
        <div key={i} className="flex h-[28px] items-center border-b border-[var(--border-subtle)]">
          <span style={{ width: GUTTER_W }} className="flex shrink-0 justify-end px-2"><span className="h-2.5 w-4 rounded bg-muted" /></span>
          <span className="px-3"><span className="block h-2.5 animate-pulse rounded bg-muted motion-reduce:animate-none" style={{ width: 56 + ((i * 29) % 40) }} /></span>
          <span className="px-3"><span className="block h-2.5 animate-pulse rounded bg-muted motion-reduce:animate-none" style={{ width: 96 + ((i * 53) % 90) }} /></span>
        </div>
      ))}
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
  const [scroll, setScroll] = useState({ x: false, y: false });
  const copyTimer = useRef(null);
  const scrollerRef = useRef(null);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

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
        setState({ status: 'error', message: e?.message || 'The server did not return the results.' });
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
  const mono = useMemo(() => visibleCols.map((c) => MONO_RE.test(c)), [visibleCols]);

  // Widths come from the header and the first rows only, never from the sorted or filtered view,
  // so sorting and searching cannot move a column.
  const widths = useMemo(
    () => colIdx.map((i, k) => {
      const ch = mono[k] ? 7.4 : 6.9;
      let longest = (visibleCols[k] || '').length * 7.4 + 8;
      for (let n = 0; n < Math.min(rows.length, SAMPLE_ROWS); n += 1) longest = Math.max(longest, (rows[n][i] || '').length * ch);
      return Math.round(Math.min(MAX_COL, Math.max(MIN_COL, longest + 24)));
    }),
    [colIdx, rows, mono, visibleCols],
  );
  const tableWidth = GUTTER_W + widths.reduce((a, b) => a + b, 0);

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
  const resetCols = () => {
    setPicked(null);
    try { localStorage.removeItem(COLS_KEY); } catch { /* storage blocked */ }
  };
  const cycleSort = (col) =>
    setSort((s) => (s?.col !== col ? { col, dir: 'asc' } : s.dir === 'asc' ? { col, dir: 'desc' } : null));

  const copyTsv = useCallback(async () => {
    const lines = [visibleCols.join('\t'), ...view.map(({ r }) => colIdx.map((i) => r[i] ?? '').join('\t'))];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      toast.success(`Copied ${view.length.toLocaleString()} ${view.length === 1 ? 'row' : 'rows'} as TSV`, { duration: 3000 });
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Could not copy. Allow clipboard access for this site and try again.', { duration: 5000 });
    }
  }, [visibleCols, view, colIdx]);

  const onScroll = (e) => {
    const x = e.currentTarget.scrollLeft > 2;
    const y = e.currentTarget.scrollTop > 2;
    setScroll((p) => (p.x === x && p.y === y ? p : { x, y }));
  };

  // Keyboard path for row selection: the scroller is one tab stop, Up/Down move the selection.
  const onTableKey = (e) => {
    if (e.key === 'Escape' && selected != null) { e.preventDefault(); setSelected(null); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    if (!view.length) return;
    e.preventDefault();
    const at = view.findIndex(({ n }) => n === selected);
    const next = e.key === 'ArrowDown' ? Math.min(view.length - 1, at + 1) : at < 0 ? 0 : Math.max(0, at - 1);
    const n = view[next].n;
    setSelected(n);
    scrollerRef.current?.querySelector(`tr[data-n="${n}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  if (!conversationId) return <Notice title="No variants yet" body="Upload a file to see results here." />;
  if (state.status === 'blocked' || (state.status === 'ready' && !state.streaming && rows.length === 0)) {
    return (
      <Notice
        title={state.status === 'blocked' ? 'Results are not available yet' : 'No variants match the current filters'}
        body={state.reason || 'Loosen or reset the filters to bring variants back.'}
      >
        {onOpenFilters && (
          <Button variant="outline" size="sm" onClick={onOpenFilters} className="mt-1">
            <SlidersHorizontal aria-hidden /> Open filters
          </Button>
        )}
      </Notice>
    );
  }
  if (state.status === 'error') {
    return (
      <Notice role="alert" title="Could not load results" body={`${state.message}. Your filters are unchanged. Retry, or reopen this tab if it keeps failing.`}>
        <Button variant="outline" size="sm" onClick={() => setAttempt((a) => a + 1)} className="mt-1">Retry</Button>
      </Notice>
    );
  }

  const loading = state.status === 'loading';
  const total = filteredCount ?? state.rowCount ?? null;
  const footer = loading ? 'Loading variants…'
    : state.streaming ? `Loading… ${rows.length.toLocaleString()} rows`
    : state.truncated || (total != null && total > rows.length)
      ? `Showing first ${rows.length.toLocaleString()}${total != null ? ` of ${total.toLocaleString()}` : ''}`
      : `${rows.length.toLocaleString()} ${rows.length === 1 ? 'row' : 'rows'}`;
  const searching = query.trim().length > 0;
  const th = cn(
    'sticky top-0 z-10 h-[28px] border-b border-border bg-background px-3 text-left text-[12px] font-medium text-muted-foreground transition-shadow duration-150 motion-reduce:transition-none',
    scroll.y && 'shadow-[0_2px_6px_-3px_hsl(var(--foreground)/0.18)]'
  );
  // The gutter stays put on horizontal scroll; a soft edge shows that content passes under it.
  const gutter = cn(
    'sticky left-0 z-[5] border-r border-border px-2 text-right text-[12px] tabular-nums text-muted-foreground select-none',
    'after:pointer-events-none after:absolute after:inset-y-0 after:left-full after:w-2 after:bg-gradient-to-r after:from-foreground/10 after:to-transparent after:transition-opacity after:duration-150 motion-reduce:after:transition-none',
    scroll.x ? 'after:opacity-100' : 'after:opacity-0'
  );
  const selRow = selected != null ? view.find(({ n }) => n === selected) : null;
  // Cells cut off by their column width: their full value is listed under the table for the selected row.
  const cut = selRow
    ? colIdx
        .map((i, k) => ({ name: visibleCols[k], value: selRow.r[i] || '', k }))
        .filter(({ value, k }) => value.length * (mono[k] ? 7.4 : 6.9) > widths[k] - 24)
    : [];

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border px-2">
        <label className="relative flex min-w-0 flex-1 items-center">
          <Search aria-hidden className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery(''); } }}
            placeholder="Filter rows"
            aria-label="Filter rows"
            className="h-7 w-full rounded-lg bg-transparent pl-7 pr-2 text-[13px] text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[hsl(var(--ring))] motion-reduce:transition-none"
          />
        </label>
        <Popover>
          <PopoverTrigger
            disabled={!header.length}
            className={cn('inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:opacity-50 aria-expanded:bg-muted aria-expanded:text-foreground motion-reduce:transition-none', FOCUS)}
          >
            <Columns3 aria-hidden className="size-3.5" /> Columns
            {header.length ? <span className="tabular-nums text-muted-foreground">{visibleCols.length}/{header.length}</span> : null}
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={6} className="max-h-72 w-60 gap-0.5 overflow-y-auto p-1.5">
            <button
              type="button"
              onClick={resetCols}
              className={cn('mb-0.5 h-7 rounded px-1.5 text-left text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground', FOCUS)}
            >
              Reset to default columns
            </button>
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
          title={copied ? 'Copied' : 'Copy visible rows as TSV'}
          className={cn('inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:opacity-50 motion-reduce:transition-none', FOCUS)}
        >
          {copied ? <Check aria-hidden className="size-3.5 text-[var(--success)]" /> : <Copy aria-hidden className="size-3.5" />}
        </button>
      </div>

      <div
        ref={scrollerRef}
        role="region"
        aria-label="Variant results table. Use arrow keys to select a row."
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onTableKey}
        aria-busy={loading || undefined}
        className={cn('min-h-0 flex-1 scroll-pl-11 scroll-pt-7 overflow-auto', FOCUS, 'focus-visible:-outline-offset-2')}
      >
        {loading ? (
          <TableSkeleton />
        ) : (
          <table
            style={{ width: tableWidth, minWidth: '100%', tableLayout: 'fixed' }}
            className="border-separate border-spacing-0 text-[13px]"
          >
            <colgroup>
              <col style={{ width: GUTTER_W }} />
              {widths.map((w, k) => <col key={visibleCols[k]} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={cn(th, gutter, 'z-20 font-normal')}><span aria-hidden>#</span><span className="sr-only">Row number</span></th>
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
                      className={cn('flex h-[28px] w-full items-center gap-1 px-3 font-[family-name:var(--font-mono)] hover:text-foreground focus-visible:outline-offset-0', FOCUS, 'focus-visible:-outline-offset-2', numeric[k] && 'flex-row-reverse')}
                    >
                      <span className="truncate">{c}</span>
                      {sort?.col === c && (sort.dir === 'asc' ? <ArrowUp aria-hidden className="size-3 shrink-0 text-foreground" /> : <ArrowDown aria-hidden className="size-3 shrink-0 text-foreground" />)}
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
                  <tr
                    key={n}
                    data-n={n}
                    aria-current={on ? 'true' : undefined}
                    onClick={() => setSelected(on ? null : n)}
                    className="group h-[28px] cursor-default"
                  >
                    <td className={cn(gutter, 'h-[28px] border-b border-[var(--border-subtle)]', bg, on && 'font-medium text-foreground shadow-[inset_2px_0_0_hsl(var(--signal))]')}>{n}</td>
                    {colIdx.map((i, k) => (
                      <td
                        key={i}
                        title={r[i] || undefined}
                        className={cn(
                          'h-[28px] overflow-hidden text-ellipsis whitespace-nowrap border-b border-[var(--border-subtle)] px-3 text-foreground',
                          bg,
                          mono[k] && 'font-[family-name:var(--font-mono)] text-[12px]',
                          numeric[k] && 'text-right tabular-nums',
                          on && 'font-medium'
                        )}
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
        {!loading && !view.length && searching && (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
            <p className="text-[13px] text-muted-foreground">No rows match “{query.trim()}”.</p>
            <Button variant="outline" size="sm" onClick={() => setQuery('')}><X aria-hidden /> Clear search</Button>
          </div>
        )}
      </div>

      {cut.length > 0 && (
        <div role="group" className="max-h-36 shrink-0 overflow-y-auto border-t border-border px-3 py-2 text-[12px]" aria-label={`Full values for row ${selRow.n}`}>
          <p className="mb-1 font-medium tabular-nums text-muted-foreground">Row {selRow.n.toLocaleString()}, full values</p>
          <dl className="space-y-1">
            {cut.map(({ name, value, k }) => (
              <div key={name} className="flex gap-2">
                <dt className="w-24 shrink-0 truncate font-[family-name:var(--font-mono)] text-muted-foreground" title={name}>{name}</dt>
                <dd className={cn('min-w-0 flex-1 text-foreground [overflow-wrap:anywhere]', mono[k] && 'font-[family-name:var(--font-mono)]')}>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div role="status" className="flex h-7 shrink-0 items-center justify-between gap-2 border-t border-border px-3 text-[12px] tabular-nums text-muted-foreground">
        <span className="truncate">{footer}</span>
        {searching && !loading && <span>{view.length.toLocaleString()} {view.length === 1 ? 'match' : 'matches'}</span>}
      </div>
    </div>
  );
}
