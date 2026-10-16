import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronsUpDown,
  Columns3,
  Copy,
  Download,
  Rows2,
  Rows3,
  Search,
  SearchX,
  SlidersHorizontal,
  Table2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { exportVariants, getAuthHeaders, parseApiErrorDetail } from '@/services/backendApi';
import { apiUrl } from '@/config/api';
import { readTsvStream } from '@/lib/tsvStream';
import { cn } from '@/lib/utils';

const MAX_ROWS = 500;
const COLS_KEY = 'geneie-results-cols-v1';
const DENSITY_KEY = 'geneie-results-density-v1';
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
const HEAD_H = 32;
const ROW_H = { compact: 28, comfortable: 36 };
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

const readStoredDensity = () => {
  try {
    return localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable';
  } catch {
    return 'comfortable';
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

/** Whole-panel frame: a canvas gutter around white cards, like the other workbench tabs. */
function Frame({ children }) {
  return <div className="flex h-full min-h-0 flex-col gap-2.5 px-4 pb-4 pt-1">{children}</div>;
}

function Notice({ icon: Icon = Table2, tone = 'brand', title, body, role, children }) {
  return (
    <div role={role} className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <span
        aria-hidden
        className={cn(
          'mb-1 flex size-11 items-center justify-center rounded-full border',
          tone === 'error'
            ? 'border-[color-mix(in_srgb,var(--error)_22%,transparent)] bg-[var(--error-soft)] text-[var(--error)]'
            : 'border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-700))]'
        )}
      >
        <Icon className="size-5" />
      </span>
      <p className="text-[15px] font-medium text-foreground">{title}</p>
      {body && <p className="max-w-xs text-[13px] leading-5 text-muted-foreground">{body}</p>}
      {children && <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  );
}

/** Loading placeholder with the same header, gutter and row height as the table, so nothing jumps. */
function TableSkeleton({ rowH }) {
  return (
    <div role="status" aria-label="Loading variants" className="min-w-full">
      <div className="flex items-center border-b border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))]" style={{ height: HEAD_H }}>
        <span style={{ width: GUTTER_W }} className="shrink-0" />
        {[88, 140, 72].map((w, i) => (
          <span key={i} className="px-3"><span className="block h-2.5 rounded-full bg-[hsl(var(--brand-200))]" style={{ width: w }} /></span>
        ))}
      </div>
      {Array.from({ length: 14 }, (_, i) => (
        <div key={i} className="flex items-center border-b border-[hsl(var(--wb-line)/0.6)]" style={{ height: rowH }}>
          <span style={{ width: GUTTER_W }} className="flex shrink-0 justify-end px-2"><span className="h-2.5 w-4 rounded-full bg-[hsl(var(--brand-100))]" /></span>
          <span className="px-3"><span className="block h-2.5 animate-pulse rounded-full bg-[hsl(var(--brand-100))] motion-reduce:animate-none" style={{ width: 56 + ((i * 29) % 40) }} /></span>
          <span className="px-3"><span className="block h-2.5 animate-pulse rounded-full bg-[hsl(var(--brand-100))] motion-reduce:animate-none" style={{ width: 96 + ((i * 53) % 90) }} /></span>
        </div>
      ))}
    </div>
  );
}

/** A chip that can be removed. The remove target is a real button with its own name. */
function RemovableChip({ children, removeLabel, onRemove }) {
  return (
    <span className="wb-chip max-w-full pr-1">
      <span className="min-w-0 truncate">{children}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        title={removeLabel}
        className={cn('-mr-0.5 inline-flex size-[18px] shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-[hsl(var(--brand-200))] hover:text-[hsl(var(--brand-700))] motion-reduce:transition-none', FOCUS)}
      >
        <X aria-hidden className="size-3" />
      </button>
    </span>
  );
}

const PILL_FIELD =
  'h-8 w-full rounded-full border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] pl-8 pr-8 text-[13px] text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground hover:border-[hsl(var(--brand-300))] focus-visible:border-[hsl(var(--brand-500))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[hsl(var(--ring))] motion-reduce:transition-none';

export default function VariantResultsViewer({ conversationId, filteredCount = null, refreshKey, onOpenFilters }) {
  const [state, setState] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(null); // { col, dir }
  const [picked, setPicked] = useState(readStoredCols);
  const [density, setDensity] = useState(readStoredDensity);
  const [selected, setSelected] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [colQuery, setColQuery] = useState('');
  const [scroll, setScroll] = useState({ x: false, y: false });
  const copyTimer = useRef(null);
  const scrollerRef = useRef(null);
  const rowH = ROW_H[density];

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  useEffect(() => {
    if (!conversationId) return undefined;
    const ctrl = new AbortController();
    setState({ status: 'loading' });
    setSelected(null);
    setDetailOpen(false);
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
      let longest = (visibleCols[k] || '').length * 7.2 + 24;
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
  const chooseDensity = (d) => {
    setDensity(d);
    try { localStorage.setItem(DENSITY_KEY, d); } catch { /* storage blocked */ }
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

  const downloadAll = useCallback(async () => {
    if (!conversationId || downloading) return;
    setDownloading(true);
    try {
      await exportVariants(conversationId);
      toast.success('Download started', { duration: 3000 });
    } catch (e) {
      toast.error(`${e?.message || 'Download failed'}. Try again.`, { duration: 5000 });
    } finally {
      setDownloading(false);
    }
  }, [conversationId, downloading]);

  const onScroll = (e) => {
    const x = e.currentTarget.scrollLeft > 2;
    const y = e.currentTarget.scrollTop > 2;
    setScroll((p) => (p.x === x && p.y === y ? p : { x, y }));
  };

  const focusRow = (n) => {
    setSelected(n);
    scrollerRef.current?.querySelector(`tr[data-n="${n}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  // Keyboard path: the scroller is one tab stop. Up/Down/Home/End move, Enter opens the detail card, Esc steps back.
  const onTableKey = (e) => {
    if (e.key === 'Escape') {
      if (detailOpen) { e.preventDefault(); setDetailOpen(false); } else if (selected != null) { e.preventDefault(); setSelected(null); }
      return;
    }
    if (e.key === 'Enter' && selected != null) { e.preventDefault(); setDetailOpen(true); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) || !view.length) return;
    e.preventDefault();
    const at = view.findIndex(({ n }) => n === selected);
    let next;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = view.length - 1;
    else if (e.key === 'ArrowDown') next = Math.min(view.length - 1, at + 1);
    else next = at < 0 ? 0 : Math.max(0, at - 1);
    focusRow(view[next].n);
  };

  const ready = state.status === 'ready';
  const nothingToShow = state.status === 'blocked' || (ready && !state.streaming && rows.length === 0);

  if (!conversationId) {
    return (
      <Frame>
        <section className="wb-card min-h-0 flex-1"><Notice title="No variants yet" body="Upload a file to see results here." /></section>
      </Frame>
    );
  }
  if (nothingToShow) {
    return (
      <Frame>
        <section className="wb-card min-h-0 flex-1">
          <Notice
            icon={state.status === 'blocked' ? Table2 : SearchX}
            title={state.status === 'blocked' ? 'Results are not available yet' : 'No variants match the current filters'}
            body={state.reason || 'Loosen or reset the filters to bring variants back.'}
          >
            {onOpenFilters && (
              <Button variant={state.status === 'blocked' ? 'outline' : 'default'} size="sm" onClick={onOpenFilters}>
                <SlidersHorizontal aria-hidden /> Open filters
              </Button>
            )}
          </Notice>
        </section>
      </Frame>
    );
  }
  if (state.status === 'error') {
    const msg = String(state.message).replace(/[.\s]+$/, '');
    return (
      <Frame>
        <section className="wb-card min-h-0 flex-1">
          <Notice
            role="alert"
            icon={AlertCircle}
            tone="error"
            title="Could not load results"
            body={`${msg}. Your filters are unchanged. Retry, or reopen this tab if it keeps failing.`}
          >
            <Button size="sm" onClick={() => setAttempt((a) => a + 1)}>Retry</Button>
          </Notice>
        </section>
      </Frame>
    );
  }

  const loading = state.status === 'loading';
  const settled = ready && !state.streaming;
  const total = filteredCount ?? state.rowCount ?? null;
  const isTruncated = settled && (state.truncated || (total != null && total > rows.length));
  const searching = query.trim().length > 0;
  const countChip = loading ? 'Loading variants'
    : state.streaming ? `Loading ${rows.length.toLocaleString()} rows`
    : isTruncated ? `Showing first ${rows.length.toLocaleString()}${total != null ? ` of ${total.toLocaleString()}` : ''}`
    : `${rows.length.toLocaleString()} ${rows.length === 1 ? 'row' : 'rows'}`;

  const th = cn(
    'sticky top-0 z-10 border-b border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] px-3 text-left text-[12px] font-medium text-[hsl(var(--brand-700))] transition-shadow duration-150 motion-reduce:transition-none',
    scroll.y && 'shadow-[0_2px_6px_-3px_hsl(var(--foreground)/0.2)]'
  );
  // The pinned columns stay put on horizontal scroll; a soft edge on the last one shows content passes under it.
  const pinEdge = cn(
    'after:pointer-events-none after:absolute after:inset-y-0 after:left-full after:w-2 after:bg-gradient-to-r after:from-foreground/10 after:to-transparent after:transition-opacity after:duration-150 motion-reduce:after:transition-none',
    scroll.x ? 'after:opacity-100' : 'after:opacity-0'
  );
  const gutter = 'sticky left-0 z-[5] px-2 text-right text-[12px] tabular-nums text-muted-foreground select-none';
  const selRow = selected != null ? view.find(({ n }) => n === selected) : null;
  const showDetail = detailOpen && selRow;
  const hiddenCols = header.filter((h) => !visibleCols.includes(h));
  const colSearch = colQuery.trim().toLowerCase();
  const popCols = colSearch ? header.filter((h) => h.toLowerCase().includes(colSearch)) : header;

  const detailRow = (name) => {
    const i = header.indexOf(name);
    const value = selRow.r[i] || '';
    const isMono = MONO_RE.test(name);
    return (
      <div key={name} className="contents">
        <dt className="truncate pt-px font-[family-name:var(--font-mono)] text-[12px] text-muted-foreground" title={name}>{name}</dt>
        <dd className={cn('min-w-0 [overflow-wrap:anywhere] text-[13px]', value ? 'text-foreground' : 'text-muted-foreground', isMono && 'font-[family-name:var(--font-mono)] text-[12px]')}>
          {value || '—'}
        </dd>
      </div>
    );
  };

  return (
    <Frame>
      {/* Toolbar: pill search, then the pill actions. */}
      <div className="flex shrink-0 items-center gap-1.5">
        <label className="relative flex min-w-0 flex-1 items-center">
          <Search aria-hidden className="pointer-events-none absolute left-3 size-3.5 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery(''); } }}
            placeholder="Filter rows"
            aria-label="Filter rows"
            className={cn(PILL_FIELD, '[&::-webkit-search-cancel-button]:hidden')}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className={cn('absolute right-1.5 inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-[hsl(var(--brand-100))] hover:text-[hsl(var(--brand-700))] motion-reduce:transition-none', FOCUS)}
            >
              <X aria-hidden className="size-3" />
            </button>
          )}
        </label>
        <Popover onOpenChange={(o) => { if (!o) setColQuery(''); }}>
          <PopoverTrigger
            disabled={!header.length}
            render={<Button variant="outline" className="rounded-full border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] px-3.5 hover:border-[hsl(var(--brand-300))] hover:bg-[hsl(var(--brand-50))] hover:text-[hsl(var(--brand-700))] aria-expanded:border-[hsl(var(--brand-300))] aria-expanded:bg-[hsl(var(--brand-100))] aria-expanded:text-[hsl(var(--brand-700))]" aria-label={header.length ? `Columns, ${visibleCols.length} of ${header.length} shown` : 'Columns'} />}
          >
            <Columns3 aria-hidden /> Columns
            {header.length ? (
              <span className="rounded-full bg-[hsl(var(--brand-100))] px-1.5 text-[12px] tabular-nums leading-[18px] text-[hsl(var(--brand-700))]">{visibleCols.length}/{header.length}</span>
            ) : null}
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            className="w-64 gap-1 rounded-2xl border border-[hsl(var(--wb-line-strong))] bg-popover p-2 ring-0"
          >
            <div className="flex items-center justify-between gap-2 px-1.5 pb-1 pt-0.5">
              <span className="text-[12px] font-medium text-muted-foreground">Show columns</span>
              <button
                type="button"
                onClick={resetCols}
                className={cn('h-6 rounded-full border border-border px-2.5 text-[12px] text-foreground transition-colors duration-150 hover:border-[hsl(var(--brand-300))] hover:bg-[hsl(var(--brand-100))] hover:text-[hsl(var(--brand-700))] motion-reduce:transition-none', FOCUS)}
              >
                Reset
              </button>
            </div>
            {header.length > 10 && (
              <label className="relative mb-1 flex items-center">
                <Search aria-hidden className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={colQuery}
                  onChange={(e) => setColQuery(e.target.value)}
                  placeholder="Find a column"
                  aria-label="Find a column"
                  className="h-7 w-full rounded-full border border-border bg-background pl-7 pr-2 text-[12px] outline-none placeholder:text-muted-foreground hover:border-[hsl(var(--brand-300))] focus-visible:border-[hsl(var(--brand-500))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[hsl(var(--ring))]"
                />
              </label>
            )}
            <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
              {popCols.map((h) => (
                <label key={h} className="flex h-8 cursor-pointer items-center gap-2 rounded-full px-2 text-[13px] transition-colors duration-150 hover:bg-[hsl(var(--brand-100))]">
                  <Checkbox checked={visibleCols.includes(h)} onCheckedChange={() => toggleCol(h)} />
                  <span className="truncate font-[family-name:var(--font-mono)] text-[12px]">{h}</span>
                </label>
              ))}
              {!popCols.length && <p className="px-2 py-2 text-[12px] text-muted-foreground">No column matches “{colQuery.trim()}”.</p>}
            </div>
          </PopoverContent>
        </Popover>
        <Button variant="outline" onClick={copyTsv} disabled={!view.length} title="Copy visible rows as TSV" aria-label="Copy visible rows as TSV">
          {copied ? <Check aria-hidden className="text-[hsl(var(--brand-500))]" /> : <Copy aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={downloadAll}
          disabled={!settled || downloading}
          aria-busy={downloading || undefined}
          title={total != null ? `Download all ${total.toLocaleString()} variants as TSV` : 'Download all variants as TSV'}
          aria-label={total != null ? `Download all ${total.toLocaleString()} variants as TSV` : 'Download all variants as TSV'}
        >
          <Download aria-hidden />
        </Button>
      </div>

      {/* Live chip row: what you are looking at right now. */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5" role="status">
        <span className="wb-chip" data-tone={isTruncated ? 'brand' : undefined}>
          {(loading || state.streaming) && <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-[hsl(var(--brand-500))] motion-reduce:animate-none" />}
          <span className="tabular-nums">{countChip}</span>
        </span>
        {sort && (
          <RemovableChip removeLabel={`Remove sort by ${sort.col}`} onRemove={() => setSort(null)}>
            <span className="inline-flex items-center gap-1">
              {sort.dir === 'asc' ? <ArrowUp aria-hidden className="size-3 shrink-0" /> : <ArrowDown aria-hidden className="size-3 shrink-0" />}
              <span className="truncate">Sorted by {sort.col}, {sort.dir === 'asc' ? 'ascending' : 'descending'}</span>
            </span>
          </RemovableChip>
        )}
        {searching && !loading && (
          <RemovableChip removeLabel={`Remove search ${query.trim()}`} onRemove={() => setQuery('')}>
            <span className="tabular-nums">{view.length.toLocaleString()} {view.length === 1 ? 'match' : 'matches'} for “{query.trim()}”</span>
          </RemovableChip>
        )}
        {isTruncated && onOpenFilters && (
          <Button variant="outline" size="xs" onClick={onOpenFilters} className="ml-auto h-6 px-2.5 text-[12px]">
            <SlidersHorizontal aria-hidden /> Open filters
          </Button>
        )}
      </div>

      {/* The table lives in its own white card; the scroller is the only scroll region. */}
      <section className="wb-card relative flex min-h-0 flex-1 flex-col overflow-hidden" aria-label="Variants">
        <div
          ref={scrollerRef}
          role="region"
          aria-label="Variant results table. Use arrow keys to select a row, Enter to open its details."
          tabIndex={0}
          onScroll={onScroll}
          onKeyDown={onTableKey}
          aria-busy={loading || undefined}
          style={{ scrollPaddingTop: HEAD_H, scrollPaddingLeft: GUTTER_W }}
          className="peer min-h-0 flex-1 overflow-auto focus-visible:outline-none"
        >
          {loading ? (
            <TableSkeleton rowH={rowH} />
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
                <tr style={{ height: HEAD_H }}>
                  <th scope="col" style={{ height: HEAD_H }} className={cn(th, gutter, 'z-20 font-normal')}><span aria-hidden>#</span><span className="sr-only">Row number</span></th>
                  {visibleCols.map((c, k) => {
                    const on = sort?.col === c;
                    return (
                      <th
                        key={c}
                        scope="col"
                        aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        style={{ height: HEAD_H, ...(k === 0 ? { left: GUTTER_W } : null) }}
                        className={cn(th, 'group/th p-0', k === 0 && 'z-20', numeric[k] && 'text-right', on && 'font-semibold')}
                      >
                        <button
                          type="button"
                          onClick={() => cycleSort(c)}
                          title={`Sort by ${c}`}
                          style={{ height: HEAD_H }}
                          className={cn('flex w-full items-center gap-1 px-3 transition-colors duration-150 hover:bg-[hsl(var(--brand-200)/0.5)] motion-reduce:transition-none', FOCUS, 'focus-visible:-outline-offset-2', numeric[k] && 'flex-row-reverse')}
                        >
                          <span className="truncate">{c}</span>
                          {on
                            ? (sort.dir === 'asc' ? <ArrowUp aria-hidden className="size-3 shrink-0" /> : <ArrowDown aria-hidden className="size-3 shrink-0" />)
                            : <ChevronsUpDown aria-hidden className="size-3 shrink-0 opacity-0 transition-opacity duration-150 group-hover/th:opacity-50 motion-reduce:transition-none" />}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {view.map(({ r, n }) => {
                  const on = selected === n;
                  const bg = on ? 'bg-[hsl(var(--wb-row-sel))]' : 'bg-[hsl(var(--wb-card))] group-hover:bg-[hsl(var(--wb-row-hover))]';
                  const line = 'border-b border-[hsl(var(--wb-line)/0.7)]';
                  return (
                    <tr
                      key={n}
                      data-n={n}
                      aria-current={on ? 'true' : undefined}
                      onClick={() => { if (on && detailOpen) setDetailOpen(false); else { setSelected(n); setDetailOpen(true); } }}
                      style={{ height: rowH }}
                      className="group cursor-default"
                    >
                      <td style={{ height: rowH }} className={cn(gutter, line, bg, on && 'font-semibold text-[hsl(var(--brand-700))] shadow-[inset_3px_0_0_hsl(var(--brand-500))]')}>{n}</td>
                      {colIdx.map((i, k) => (
                        <td
                          key={i}
                          title={r[i] || undefined}
                          style={{ height: rowH, ...(k === 0 ? { left: GUTTER_W } : null) }}
                          className={cn(
                            'overflow-hidden text-ellipsis whitespace-nowrap px-3 text-foreground',
                            line,
                            bg,
                            k === 0 && cn('sticky z-[5]', pinEdge, !on && 'font-medium'),
                            mono[k] && 'font-[family-name:var(--font-mono)] text-[12px]',
                            numeric[k] && 'text-right tabular-nums',
                            on && 'font-semibold'
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
            <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
              <span aria-hidden className="mb-1 flex size-10 items-center justify-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-700))]"><SearchX className="size-[18px]" /></span>
              <p className="text-[13px] text-muted-foreground">No rows match “{query.trim()}” in the loaded {rows.length.toLocaleString()} rows.</p>
              <Button variant="outline" size="sm" onClick={() => setQuery('')}><X aria-hidden /> Clear search</Button>
            </div>
          )}
        </div>

        {/* Focus ring for the scroller, drawn on the card edge so sticky cells cannot cover it. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-30 rounded-2xl ring-2 ring-inset ring-[hsl(var(--brand-500))] opacity-0 peer-focus-visible:opacity-100" />
        <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-t border-[hsl(var(--wb-line))] px-3 text-[12px] tabular-nums text-muted-foreground">
          <span className="min-w-0 truncate">
            {header.length ? `${visibleCols.length} of ${header.length} columns` : ''}
            {selRow ? ` · Row ${selRow.n.toLocaleString()} selected` : view.length ? ' · Arrow keys select a row' : ''}
          </span>
          <div role="group" aria-label="Row density" className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-pill))] p-0.5">
            {[['compact', 'Compact rows', Rows3], ['comfortable', 'Comfortable rows', Rows2]].map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                aria-pressed={density === id}
                aria-label={label}
                title={label}
                onClick={() => chooseDensity(id)}
                className={cn(
                  'inline-flex size-6 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-colors duration-150 hover:text-foreground motion-reduce:transition-none',
                  density === id && 'border-[hsl(var(--brand-200))] bg-[hsl(var(--wb-card))] text-[hsl(var(--brand-700))]',
                  FOCUS
                )}
              >
                <Icon aria-hidden className="size-3.5" />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Docked detail: every column of the selected row, including the ones the table hides. */}
      {showDetail && (
        <section
          aria-label={`Row ${selRow.n} details`}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setDetailOpen(false); scrollerRef.current?.focus(); } }}
          className="wb-card flex max-h-[42%] shrink-0 flex-col"
        >
          <div className="flex items-center gap-2 px-3 pb-1.5 pt-2.5">
            <span className="wb-chip tabular-nums" data-tone="brand">Row {selRow.n.toLocaleString()}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{selRow.r[colIdx[0]] || ''}</span>
            <button
              type="button"
              onClick={() => { setDetailOpen(false); scrollerRef.current?.focus(); }}
              aria-label="Close row details"
              title="Close row details"
              className={cn('wb-iconbtn !size-7', FOCUS)}
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </div>
          <dl className="grid min-h-0 grid-cols-[9rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 overflow-y-auto px-3 pb-3 pt-1">
            {visibleCols.map(detailRow)}
            {hiddenCols.length > 0 && (
              <div className="col-span-2 mt-1 border-t border-[hsl(var(--wb-line))] pt-2 text-[12px] font-medium text-muted-foreground">Other columns in the file</div>
            )}
            {hiddenCols.map(detailRow)}
          </dl>
        </section>
      )}
    </Frame>
  );
}
