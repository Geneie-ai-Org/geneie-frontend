import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowUp,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Columns3,
  Dna,
  Download,
  Hash,
  Rows2,
  Rows3,
  Search,
  SearchX,
  ShieldAlert,
  SlidersHorizontal,
  Table2,
  Type,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { exportVariants, getAuthHeaders, parseApiErrorDetail } from '@/services/backendApi';
import { apiUrl } from '@/config/api';
import { readTsvStream } from '@/lib/tsvStream';
import { cn } from '@/lib/utils';
import {
  CLASS_TONE_CLASS,
  DETAIL_GROUPS,
  NUM_RE,
  classStatus,
  columnKind,
  compactHgvs,
  detailGroupOf,
  formatFreq,
  formatNumber,
  freqFill,
  isMissing,
  isMonoKind,
  isMonoName,
  parseFreq,
} from '@/lib/variantFormat';
import { ChipList, CopyButton, CountUp, PopIn, SPRING, StateButton, Turn } from '@/components/motion';

const MAX_ROWS = 500;
const COLS_KEY = 'geneie-results-cols-v1';
const DENSITY_KEY = 'geneie-results-density-v1';
const LIMIT_KEY = 'geneie-results-limit-v1';
const LIMITS = [25, 50, 100, 500];
// One default column per group; within a group the first matching pattern wins (patterns are tried in order,
// so a classification beats a star rating and a population frequency beats an annotation blob).
const DEFAULT_GROUPS = [
  [/^(gene|gene_?symbol|symbol)$/i],
  [/^hgvs.?p$|protein|amino|aa_?change/i, /^hgvs.?c$|^hgvs/i, /hgvs/i],
  [/functional|conseq|effect|variant_?class|impact/i],
  [/clinvar.*(interp|signif|class)/i, /(interp|signif|classif)/i, /clinvar/i],
  [/acmg.*class|class.*acmg/i, /acmg/i],
  [/^max_?freq$/i, /gnomad.*af|(^|_)af($|_)|allele_?f/i, /freq|gnomad/i],
  [/^rank$/i, /priority/i],
  [/combined_?score|variant_?score/i, /score/i],
];
// Full-alpha 2px ring comes from the global focus token; this only removes the browser outline on the custom controls.
const FOCUS = 'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]';
const GUTTER_W = 44;
const HEAD_H = 32;
const ROW_H = { compact: 28, comfortable: 40 };
const MIN_COL = 72;
const MAX_COL = 260;
const SAMPLE_ROWS = 120;
const KIND_ICON = { gene: Dna, class: ShieldAlert, freq: BarChart3, hgvs: Hash, coord: Hash, id: Hash, number: Hash, text: Type };

const readStored = (key, fallback) => {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
};
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

/** Whole-panel frame: a canvas gutter around white cards, like the other workbench tabs. */
const Frame = React.forwardRef(function Frame({ children }, ref) {
  return <div ref={ref} className="relative flex h-full min-h-0 flex-col gap-2.5 overflow-hidden px-4 pb-4 pt-1">{children}</div>;
});

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
  const cols = [64, 132, 92, 84];
  return (
    <div role="status" aria-label="Loading variants" className="min-w-full">
      <div className="flex items-center border-b border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))]" style={{ height: HEAD_H }}>
        <span style={{ width: GUTTER_W }} className="shrink-0" />
        {cols.map((w, i) => (
          <span key={i} className="px-3"><span className="block h-2.5 rounded-full bg-[hsl(var(--brand-200))]" style={{ width: w * 0.7 }} /></span>
        ))}
      </div>
      {Array.from({ length: 14 }, (_, i) => (
        <div key={i} className="flex items-center border-b border-[hsl(var(--wb-line)/0.6)]" style={{ height: rowH }}>
          <span style={{ width: GUTTER_W }} className="flex shrink-0 justify-end px-2"><span className="wb-shimmer h-2.5 w-4 rounded-full" /></span>
          <span className="px-3" style={{ width: cols[0] + 24 }}><span className="wb-shimmer block h-5 rounded-full" style={{ width: 40 + ((i * 29) % 28) }} /></span>
          <span className="px-3" style={{ width: cols[1] + 24 }}><span className="wb-shimmer block h-2.5 rounded-full" style={{ width: 70 + ((i * 53) % 60) }} /></span>
          <span className="px-3" style={{ width: cols[2] + 24 }}><span className="wb-shimmer block h-5 rounded-full" style={{ width: 54 + ((i * 37) % 36) }} /></span>
          <span className="px-3"><span className="wb-shimmer block h-2.5 rounded-full" style={{ width: 52 }} /></span>
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

/* ---------------------------------------------------------------------------- cell renderers */

function GenePill({ value, compact }) {
  return (
    <span className={cn('inline-flex max-w-full items-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-50))] font-medium text-[hsl(var(--brand-700))]', compact ? 'h-5 px-2 text-[12px]' : 'h-6 px-2.5 text-[12.5px]')}>
      <span className="truncate">{value}</span>
    </span>
  );
}

function ClassPill({ status, compact }) {
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1.5 rounded-full border font-medium', CLASS_TONE_CLASS[status.tone], compact ? 'h-5 px-2 text-[11.5px]' : 'h-6 px-2.5 text-[12px]')}>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      <span className="truncate">{status.label}</span>
    </span>
  );
}

function FreqCell({ raw, range }) {
  const n = parseFreq(raw);
  if (n == null) return <span className="text-muted-foreground">{raw}</span>;
  const fill = freqFill(n, range?.lo, range?.hi);
  return (
    <span className="flex w-full items-center justify-end gap-2" title={`${raw}`}>
      <span aria-hidden className="relative h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-[hsl(var(--brand-100))]">
        <span className="absolute inset-y-0 left-0 rounded-full bg-[hsl(var(--brand-500))]" style={{ width: `${Math.round(fill * 100)}%` }} />
      </span>
      <span className="min-w-[3.2rem] text-right tabular-nums">{formatFreq(n)}</span>
    </span>
  );
}

/** Comfortable rows stack the change over the protein effect (half the width); compact rows keep one line. */
function HgvsCell({ raw, stack }) {
  const h = compactHgvs(raw);
  if (!h) return <>{raw}</>;
  if (stack && h.p) {
    return (
      <span className="flex flex-col leading-[1.3]">
        <span className="truncate">{h.c}</span>
        <span className="truncate text-[11px] text-muted-foreground">{h.p}</span>
      </span>
    );
  }
  return (
    <>
      <span>{h.c}</span>
      {h.p ? <span className="ml-1.5 text-muted-foreground">{h.p}</span> : null}
    </>
  );
}

/** The cell body for one column kind. The raw value stays in the title and is what Copy puts on the clipboard. */
function renderCellBody(kind, raw, ctx) {
  if (kind === 'class') {
    const st = classStatus(raw);
    return st ? <ClassPill status={st} compact={ctx.compact} /> : raw;
  }
  if (isMissing(raw) && kind !== 'class') return <span className="text-muted-foreground/70">{raw ? raw : ''}</span>;
  if (kind === 'gene') return <GenePill value={raw} compact={ctx.compact} />;
  if (kind === 'freq') return <FreqCell raw={raw} range={ctx.freq} />;
  if (kind === 'hgvs') return <HgvsCell raw={raw} stack={!ctx.compact} />;
  if (kind === 'number') return formatNumber(raw);
  return raw;
}

function estimateWidth(kind, name, rows, i, compact) {
  let longest = name.length * 7.2 + 44; // label plus the sort arrow
  const take = Math.min(rows.length, SAMPLE_ROWS);
  if (kind === 'freq') return 132;
  for (let n = 0; n < take; n += 1) {
    const v = rows[n][i] || '';
    let w;
    if (kind === 'class') { const st = classStatus(v); w = (st ? st.label.length : v.length) * 6.6 + 36; }
    else if (kind === 'gene') w = v.length * 7.6 + 34;
    else if (kind === 'hgvs') { const h = compactHgvs(v); w = (h ? (compact || !h.p ? h.c.length + (h.p ? h.p.length + 1 : 0) : Math.max(h.c.length * 7.4, h.p.length * 6.7) / 7.4) : v.length) * 7.4 + 40; }
    else if (kind === 'number') w = formatNumber(v).length * 6.9 + 24;
    else w = v.length * (isMonoKind(kind) ? 7.4 : 6.9) + (isMonoKind(kind) ? 40 : 24); // mono cells keep room for the hover Copy
    longest = Math.max(longest, w);
  }
  return Math.round(Math.min(MAX_COL, Math.max(MIN_COL, longest)));
}

/**
 * One floating Copy button for the whole table. It owns its hover state and listens on the table wrapper
 * natively, so moving the pointer across cells never re-renders the rows.
 */
function HoverCopy({ wrapRef, scrollerRef }) {
  const [hov, setHov] = useState(null); // { top, h, right, value }
  useEffect(() => {
    const wrap = wrapRef.current;
    const scroller = scrollerRef.current;
    if (!wrap) return undefined;
    const over = (e) => {
      if (e.target.closest?.('[data-hovercopy]')) return; // the pointer moved onto the button itself
      const td = e.target.closest?.('td[data-copy]');
      if (!td) { setHov((h) => (h ? null : h)); return; }
      const wr = wrap.getBoundingClientRect();
      const tr = td.getBoundingClientRect();
      const next = { top: Math.round(tr.top - wr.top), h: Math.round(tr.height), right: Math.round(tr.right - wr.left), value: td.dataset.copy };
      setHov((h) => (h && h.value === next.value && h.top === next.top && h.right === next.right ? h : next));
    };
    const clear = () => setHov((h) => (h ? null : h));
    wrap.addEventListener('mouseover', over);
    wrap.addEventListener('mouseleave', clear);
    scroller?.addEventListener('scroll', clear, { passive: true });
    return () => {
      wrap.removeEventListener('mouseover', over);
      wrap.removeEventListener('mouseleave', clear);
      scroller?.removeEventListener('scroll', clear);
    };
  }, [wrapRef, scrollerRef]);
  if (!hov) return null;
  return (
    <div data-hovercopy className="absolute z-[8] flex items-center" style={{ top: hov.top, height: hov.h, left: Math.max(GUTTER_W, hov.right - 28) }}>
      <CopyButton getText={() => hov.value} label="" copiedLabel="" variant="outline" size="icon-xs" aria-label="Copy value" title="Copy value" className="size-5 rounded-full bg-[hsl(var(--wb-card))] shadow-sm [&_svg]:!size-3" />
    </div>
  );
}

/* ---------------------------------------------------------------------------- row detail slide-over */

function DetailValue({ name, kind, raw, freqRange }) {
  if (isMissing(raw) && kind !== 'class') return <span className="text-muted-foreground">—</span>;
  if (kind === 'class') {
    const st = classStatus(raw);
    return st ? <ClassPill status={st} /> : <>{raw}</>;
  }
  if (kind === 'freq') {
    const n = parseFreq(raw);
    if (n == null) return <>{raw}</>;
    return (
      <span className="flex flex-col gap-1">
        <span className="flex items-center gap-2">
          <span aria-hidden className="relative h-1.5 w-16 overflow-hidden rounded-full bg-[hsl(var(--brand-100))]">
            <span className="absolute inset-y-0 left-0 rounded-full bg-[hsl(var(--brand-500))]" style={{ width: `${Math.round(freqFill(n, freqRange?.lo, freqRange?.hi) * 100)}%` }} />
          </span>
          <span className="tabular-nums">{formatFreq(n)}</span>
        </span>
        {!NUM_RE.test(String(raw).trim()) ? <span className="font-[family-name:var(--font-mono)] text-[11.5px] text-muted-foreground [overflow-wrap:anywhere]">{raw}</span> : null}
      </span>
    );
  }
  if (kind === 'gene') return <GenePill value={raw} />;
  return <span className={cn('[overflow-wrap:anywhere]', (isMonoKind(kind) || isMonoName(name)) && 'font-[family-name:var(--font-mono)] text-[12px]')}>{raw}</span>;
}

function RowDetail({ n, row, header, meta, freqRanges, visible, onClose, onStep, canPrev, canNext, narrow }) {
  const reduce = useReducedMotion();
  const selfRef = useRef(null);
  useEffect(() => { selfRef.current?.focus({ preventScroll: true }); }, []);
  const sections = useMemo(() => {
    const by = new Map();
    for (const name of header) {
      const g = detailGroupOf(name);
      if (!by.has(g)) by.set(g, []);
      by.get(g).push(name);
    }
    return [...DETAIL_GROUPS.map(([l]) => l), 'Other'].filter((l) => by.has(l)).map((l) => [l, by.get(l)]);
  }, [header]);
  const gi = header.findIndex((h) => meta[h]?.kind === 'gene');
  const hi = header.findIndex((h) => meta[h]?.kind === 'hgvs');
  const hg = hi >= 0 ? compactHgvs(row[hi]) : null;
  return (
    <>
      {narrow ? <motion.button type="button" aria-label="Close row details" tabIndex={-1} onClick={onClose} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.18 }} className="absolute inset-0 z-30 cursor-default bg-background/60" /> : null}
      <motion.section
        ref={selfRef}
        tabIndex={-1}
        key="detail"
        role="dialog"
        aria-label={`Row ${n} details`}
        initial={reduce ? false : { x: '104%', opacity: 0.6 }}
        animate={{ x: 0, opacity: 1 }}
        exit={reduce ? { opacity: 0 } : { x: '104%', opacity: 0.6 }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 40 }}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } }}
        className="wb-card absolute bottom-3 right-3 top-1 z-40 flex outline-none w-[min(calc(100%-1.5rem),25rem)] flex-col overflow-hidden shadow-[0_18px_40px_-18px_hsl(var(--foreground)/0.3)]"
      >
        <div className="flex items-center gap-2 border-b border-[hsl(var(--wb-line))] px-3 py-2.5">
          <span className="wb-chip tabular-nums" data-tone="brand">Row {n.toLocaleString()}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {gi >= 0 && row[gi] ? <GenePill value={row[gi]} /> : null}
            </div>
          </div>
          <button type="button" onClick={() => onStep(-1)} disabled={!canPrev} aria-label="Previous row" title="Previous row" className={cn('wb-iconbtn !size-7 disabled:opacity-40', FOCUS)}><ChevronLeft aria-hidden className="size-3.5" /></button>
          <button type="button" onClick={() => onStep(1)} disabled={!canNext} aria-label="Next row" title="Next row" className={cn('wb-iconbtn !size-7 disabled:opacity-40', FOCUS)}><ChevronRight aria-hidden className="size-3.5" /></button>
          <button type="button" onClick={onClose} aria-label="Close row details" title="Close (Esc)" className={cn('wb-iconbtn !size-7', FOCUS)}><X aria-hidden className="size-3.5" /></button>
        </div>
        {hg ? (
          <p className="truncate border-b border-[hsl(var(--wb-line))] px-3 py-2 font-[family-name:var(--font-mono)] text-[12px] text-foreground" title={row[hi]}>
            {hg.c}{hg.p ? <span className="ml-2 text-muted-foreground">{hg.p}</span> : null}
          </p>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {sections.map(([label, names]) => (
            <section key={label} aria-label={label} className="pt-3">
              <h3 className="wb-card-title mb-1.5 flex items-center gap-1.5">{label}<span className="tabular-nums">{names.length}</span></h3>
              <dl className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] gap-x-3 gap-y-0.5">
                {names.map((name) => {
                  const i = header.indexOf(name);
                  const raw = row[i] || '';
                  const m = meta[name] || { kind: 'text' };
                  return (
                    <div key={name} className="group/val contents">
                      <dt className="truncate rounded-l-lg py-1 pl-1 font-[family-name:var(--font-mono)] text-[11.5px] text-muted-foreground group-hover/val:bg-[hsl(var(--wb-row-hover))]" title={name}>
                        {name}
                        {visible.includes(name) ? <span aria-label=" (shown in table)" className="ml-1 inline-block size-1 rounded-full bg-[hsl(var(--brand-500))] align-middle" /> : null}
                      </dt>
                      <dd className="relative flex min-w-0 items-start justify-between gap-1 rounded-r-lg py-1 pr-1 text-[13px] group-hover/val:bg-[hsl(var(--wb-row-hover))]">
                        <span className="min-w-0 flex-1"><DetailValue name={name} kind={m.kind} raw={raw} freqRange={freqRanges[name]} /></span>
                        {!isMissing(raw) ? (
                          <CopyButton getText={() => raw} label="" copiedLabel="" variant="ghost" size="icon-xs" aria-label={`Copy ${name}`} title={`Copy ${name}`} className="size-5 shrink-0 opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover/val:opacity-100 max-md:opacity-100 motion-reduce:transition-none [&_svg]:!size-3" />
                        ) : null}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          ))}
        </div>
      </motion.section>
    </>
  );
}

/* ---------------------------------------------------------------------------- the viewer */

export default function VariantResultsViewer({ conversationId, filteredCount = null, refreshKey, onOpenFilters }) {
  const [state, setState] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(null); // { col, dir }
  const [picked, setPicked] = useState(readStoredCols);
  const [density, setDensity] = useState(() => (readStored(DENSITY_KEY, 'comfortable') === 'compact' ? 'compact' : 'comfortable'));
  const [limit, setLimit] = useState(() => { const n = Number(readStored(LIMIT_KEY, 100)); return LIMITS.includes(n) ? n : 100; });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [intro, setIntro] = useState(true); // the first rows fade in once per load
  const [mk, setMk] = useState(null); // selection marker box: { top, h, show, snap }
  const [exportState, setExportState] = useState('idle');
  const [colQuery, setColQuery] = useState('');
  const [scroll, setScroll] = useState({ x: false, y: false });
  const [narrow, setNarrow] = useState(true);
  const scrollerRef = useRef(null);
  const wrapRef = useRef(null);
  const tbodyRef = useRef(null);
  const frameRef = useRef(null);
  const colInputRef = useRef(null);
  const reduce = useReducedMotion();
  const rowH = ROW_H[density];
  const compact = density === 'compact';

  useEffect(() => {
    if (!conversationId) return undefined;
    const ctrl = new AbortController();
    setState({ status: 'loading' });
    setIntro(true);
    setSelected(null);
    setDetailOpen(false);
    setPage(0);
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

  useEffect(() => {
    if (state.status !== 'ready') return undefined;
    const t = setTimeout(() => setIntro(false), 900);
    return () => clearTimeout(t);
  }, [state.status]);

  // The slide-over gets a scrim only when the panel is too narrow to show the table beside it.
  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 640));
    ro.observe(el);
    return () => ro.disconnect();
  }, [conversationId]);

  const { header = [], rows = [] } = state;

  // What each column is, decided from the header and the first rows only (cheap, and stable while rows stream in).
  const meta = useMemo(() => {
    const out = {};
    const take = Math.min(rows.length, SAMPLE_ROWS);
    header.forEach((h, i) => {
      const vals = [];
      for (let n = 0; n < take; n += 1) vals.push(rows[n][i]);
      const present = vals.filter((v) => !isMissing(v));
      const isNum = present.length > 0 && present.filter((v) => NUM_RE.test(String(v).trim())).length / present.length >= 0.8;
      const kind = columnKind(h, vals, isNum);
      out[h] = { kind, num: isNum || kind === 'freq' || kind === 'number' };
    });
    return out;
  }, [header, rows]);

  const visibleCols = useMemo(() => {
    const keep = picked ? header.filter((h) => picked.includes(h)) : [];
    return keep.length ? keep : defaultColumns(header);
  }, [header, picked]);
  const colIdx = useMemo(() => visibleCols.map((c) => header.indexOf(c)), [visibleCols, header]);
  const kinds = useMemo(() => visibleCols.map((c) => meta[c]?.kind || 'text'), [visibleCols, meta]);
  const numeric = useMemo(() => visibleCols.map((c) => !!meta[c]?.num), [visibleCols, meta]);

  // Log-scale span for each frequency column, over the loaded rows (the table and the row detail share it).
  const freqRanges = useMemo(() => {
    const out = {};
    header.forEach((h, i) => {
      if (meta[h]?.kind !== 'freq') return;
      let lo = Infinity; let hi = 0;
      for (const r of rows) {
        const n = parseFreq(r[i]);
        if (n != null && n > 0) { if (n < lo) lo = n; if (n > hi) hi = n; }
      }
      out[h] = { lo: Number.isFinite(lo) ? lo : 0, hi };
    });
    return out;
  }, [header, rows, meta]);

  // Widths come from the header and the first rows only, never from the sorted or filtered view,
  // so sorting and searching cannot move a column.
  const widths = useMemo(
    () => colIdx.map((i, k) => estimateWidth(kinds[k], visibleCols[k] || '', rows, i, compact)),
    [colIdx, rows, kinds, visibleCols, compact],
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
      const isFreq = kinds[k] === 'freq';
      const val = (r) => (isFreq ? (parseFreq(r[i]) ?? NaN) : isNum ? parseFloat(r[i]) : r[i] || '');
      const empty = (r) => (isNum ? Number.isNaN(val(r)) : r[i] === '' || r[i] == null);
      out = [...out].sort((a, b) => {
        if (empty(a.r) !== empty(b.r)) return empty(a.r) ? 1 : -1; // blanks last either way
        const d = isNum ? val(a.r) - val(b.r) : String(val(a.r)).localeCompare(String(val(b.r)), undefined, { numeric: true });
        return sort.dir === 'asc' ? d : -d;
      });
    }
    return out;
  }, [rows, query, sort, colIdx, visibleCols, numeric, kinds]);

  const pageCount = Math.max(1, Math.ceil(view.length / limit));
  const pg = Math.min(page, pageCount - 1);
  const pageRows = useMemo(() => view.slice(pg * limit, (pg + 1) * limit), [view, pg, limit]);

  // One marker for the whole table: measure the selected row and let the marker glide there.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const tr = selected != null && wrap ? wrap.querySelector(`tr[data-n="${selected}"]`) : null;
    if (!tr) { setMk((m) => (m && m.show ? { ...m, show: false } : m)); return; }
    const top = Math.round(tr.getBoundingClientRect().top - wrap.getBoundingClientRect().top);
    const h = tr.offsetHeight;
    setMk((m) => (m && m.show && m.top === top && m.h === h ? m : { top, h, show: true, snap: !m?.show }));
  }, [selected, pageRows, rowH, state.status, tableWidth]);

  // Row height changes are instant (table rows cannot tween); a short dip softens the switch.
  const firstDensity = useRef(true);
  useEffect(() => {
    if (firstDensity.current) { firstDensity.current = false; return; }
    if (reduce || !tbodyRef.current) return;
    animate(tbodyRef.current, { opacity: [0.35, 1] }, { duration: 0.22, ease: 'easeOut' });
  }, [density, reduce]);

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
  const chooseLimit = (n) => {
    setLimit(n);
    setPage(0);
    try { localStorage.setItem(LIMIT_KEY, String(n)); } catch { /* storage blocked */ }
  };
  const cycleSort = (col) => {
    setPage(0);
    setSort((s) => (s?.col !== col ? { col, dir: 'asc' } : s.dir === 'asc' ? { col, dir: 'desc' } : null));
  };

  const getTsv = () => [visibleCols.join('\t'), ...view.map(({ r }) => colIdx.map((i) => r[i] ?? '').join('\t'))].join('\n');

  const downloadAll = useCallback(async () => {
    if (!conversationId || exportState !== 'idle') return;
    setExportState('running');
    try {
      await exportVariants(conversationId);
      setExportState('done');
      toast.success('Download started', { duration: 3000 });
      setTimeout(() => setExportState('idle'), 1800);
    } catch (e) {
      setExportState('idle');
      toast.error(`${e?.message || 'Download failed'}. Try again.`, { duration: 5000 });
    }
  }, [conversationId, exportState]);

  const onScroll = (e) => {
    const x = e.currentTarget.scrollLeft > 2;
    const y = e.currentTarget.scrollTop > 2;
    setScroll((p) => (p.x === x && p.y === y ? p : { x, y }));
  };

  const focusRow = (n) => {
    setSelected(n);
    const at = view.findIndex((v) => v.n === n);
    if (at >= 0) setPage(Math.floor(at / limit));
    requestAnimationFrame(() => scrollerRef.current?.querySelector(`tr[data-n="${n}"]`)?.scrollIntoView({ block: 'nearest' }));
  };
  const stepRow = (d) => {
    const at = view.findIndex(({ n }) => n === selected);
    const to = view[at + d];
    if (to) focusRow(to.n);
  };

  // Keyboard path: the scroller is one tab stop. Up/Down/Home/End move, Enter opens the detail card, Esc steps back.
  const onTableKey = (e) => {
    if (e.key === 'Escape') {
      if (detailOpen) { e.preventDefault(); setDetailOpen(false); } else if (selected != null) { e.preventDefault(); setSelected(null); }
      return;
    }
    if (e.key === 'Enter' && selected != null) { e.preventDefault(); setDetailOpen(true); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(e.key) || !view.length) return;
    e.preventDefault();
    const at = view.findIndex(({ n }) => n === selected);
    let next;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = view.length - 1;
    else if (e.key === 'PageDown') next = Math.min(view.length - 1, (at < 0 ? 0 : at) + 8);
    else if (e.key === 'PageUp') next = Math.max(0, (at < 0 ? 0 : at) - 8);
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

  // The count chip as [text before, rolling number, text after] so the number can count up while streaming.
  const countBits = loading ? ['Loading variants', null, '']
    : state.streaming ? ['Loading ', rows.length, ' rows']
    : isTruncated ? ['Showing first ', rows.length, total != null ? ` of ${total.toLocaleString()}` : '']
    : ['', rows.length, rows.length === 1 ? ' row' : ' rows'];
  const colRiseStyle = (i) => (reduce ? undefined : { animation: 'wb-rise 200ms var(--ease-out) backwards', animationDelay: `${Math.min(i, 12) * 14}ms` });

  const th = 'sticky top-0 z-10 border-b border-[hsl(var(--brand-200))] px-3 text-left text-[12px] font-medium text-[hsl(var(--brand-700))]';
  const thPinned = 'bg-[hsl(var(--brand-100))]';
  // The pinned columns stay put on horizontal scroll; a soft edge on the last one shows content passes under it.
  const pinEdge = cn(
    'after:pointer-events-none after:absolute after:inset-y-0 after:left-full after:w-2 after:bg-gradient-to-r after:from-foreground/10 after:to-transparent after:transition-opacity after:duration-150 motion-reduce:after:transition-none',
    scroll.x ? 'after:opacity-100' : 'after:opacity-0'
  );
  const gutter = 'sticky left-0 z-[5] px-2 text-right text-[12px] tabular-nums text-muted-foreground select-none';
  const selRow = selected != null ? view.find(({ n }) => n === selected) : null;
  const showDetail = detailOpen && selRow;
  const selAt = selRow ? view.indexOf(selRow) : -1;
  const colSearch = colQuery.trim().toLowerCase();
  const popCols = colSearch ? header.filter((h) => h.toLowerCase().includes(colSearch)) : header;
  const firstShown = view.length ? pg * limit + 1 : 0;
  const lastShown = Math.min(view.length, (pg + 1) * limit);
  const limitOptions = LIMITS.filter((l, i) => l === limit || l <= Math.max(rows.length, 25) || LIMITS[i - 1] < rows.length);

  // Picker sections: what is on screen first, then the rest by the same groups the row detail uses.
  const pickerGroups = (() => {
    const out = [];
    const on = popCols.filter((h) => visibleCols.includes(h));
    if (on.length) out.push(['Shown', on]);
    for (const label of [...DETAIL_GROUPS.map(([l]) => l), 'Other']) {
      const names = popCols.filter((h) => !visibleCols.includes(h) && detailGroupOf(h) === label);
      if (names.length) out.push([label, names]);
    }
    return out;
  })();

  return (
    <Frame ref={frameRef}>
      {/* Toolbar: pill search, columns, copy, export. */}
      <div className="flex shrink-0 items-center gap-1.5">
        <label className="relative flex min-w-0 flex-1 items-center">
          <Search aria-hidden className="pointer-events-none absolute left-3 size-3.5 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(0); }}
            onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery(''); } }}
            placeholder="Search rows"
            aria-label="Search rows"
            className={cn(PILL_FIELD, '[&::-webkit-search-cancel-button]:hidden')}
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setPage(0); }}
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
            render={<Button variant="outline" className="rounded-full border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] px-3 hover:border-[hsl(var(--brand-300))] hover:bg-[hsl(var(--brand-50))] hover:text-[hsl(var(--brand-700))] aria-expanded:border-[hsl(var(--brand-300))] aria-expanded:bg-[hsl(var(--brand-100))] aria-expanded:text-[hsl(var(--brand-700))]" aria-label={header.length ? `Columns, ${visibleCols.length} of ${header.length} shown` : 'Columns'} />}
          >
            <Columns3 aria-hidden /> Columns
            {header.length ? (
              <span className="rounded-full bg-[hsl(var(--brand-100))] px-1.5 text-[12px] tabular-nums leading-[18px] text-[hsl(var(--brand-700))]">{visibleCols.length}/{header.length}</span>
            ) : null}
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={8} initialFocus={colInputRef} className="w-[min(20rem,calc(100vw-2rem))] gap-1.5 p-2.5">
            <div className="flex items-center justify-between gap-2 px-0.5">
              <span className="text-[12px] font-medium text-muted-foreground">Choose columns</span>
              <button
                type="button"
                onClick={resetCols}
                className={cn('h-6 rounded-full border border-border px-2.5 text-[12px] text-foreground transition-colors duration-150 hover:border-[hsl(var(--brand-300))] hover:bg-[hsl(var(--brand-100))] hover:text-[hsl(var(--brand-700))] motion-reduce:transition-none', FOCUS)}
              >
                Reset
              </button>
            </div>
            <label className="relative flex items-center">
              <Search aria-hidden className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
              <input
                ref={colInputRef}
                type="text"
                value={colQuery}
                onChange={(e) => setColQuery(e.target.value)}
                placeholder={`Search ${header.length} columns`}
                aria-label="Search columns"
                className="h-8 w-full rounded-full border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] pl-8 pr-2 text-[12.5px] outline-none placeholder:text-muted-foreground hover:border-[hsl(var(--brand-300))] focus-visible:border-[hsl(var(--brand-500))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[hsl(var(--ring))]"
              />
            </label>
            <div className="max-h-72 overflow-y-auto overscroll-contain pr-0.5">
              {pickerGroups.map(([label, names]) => (
                <section key={label} aria-label={label} className="pb-2 pt-1">
                  <h3 className="wb-card-title mb-1 flex items-center gap-1.5 px-0.5">{label}<span className="tabular-nums">{names.length}</span></h3>
                  <div className="flex flex-wrap gap-1">
                    {names.map((h, i) => {
                      const on = visibleCols.includes(h);
                      const Icon = KIND_ICON[meta[h]?.kind] || Type;
                      return (
                        <button
                          key={h}
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          onClick={() => toggleCol(h)}
                          style={colRiseStyle(i)}
                          className={cn(
                            'inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-colors duration-150 motion-reduce:transition-none',
                            on
                              ? 'border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] font-medium text-[hsl(var(--brand-700))]'
                              : 'border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] text-muted-foreground hover:border-[hsl(var(--brand-300))] hover:text-foreground',
                            FOCUS
                          )}
                        >
                          <Icon aria-hidden className="size-3 shrink-0 opacity-70" />
                          <span className="truncate font-[family-name:var(--font-mono)] text-[11.5px]">{h}</span>
                          {on ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[hsl(var(--brand-500))]" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
              {!popCols.length && <p className="px-2 py-3 text-[12px] text-muted-foreground">No column matches “{colQuery.trim()}”.</p>}
            </div>
          </PopoverContent>
        </Popover>
        <CopyButton getText={getTsv} label="" copiedLabel="" size="icon" className="shrink-0 rounded-full border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] hover:border-[hsl(var(--brand-300))] hover:bg-[hsl(var(--brand-50))] hover:text-[hsl(var(--brand-700))]" disabled={!view.length} title="Copy visible rows as TSV" aria-label="Copy visible rows as TSV" />
        <StateButton
          state={exportState}
          labels={{ idle: 'Export', running: 'Preparing', done: 'Exported' }}
          icon={Download}
          variant="outline"
          onClick={downloadAll}
          disabled={!settled}
          title={total != null ? `Download all ${total.toLocaleString()} variants as TSV` : 'Download all variants as TSV'}
          aria-label={total != null ? `Export all ${total.toLocaleString()} variants as TSV` : 'Export all variants as TSV'}
          className="shrink-0 rounded-full border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] px-3 hover:border-[hsl(var(--brand-300))] hover:bg-[hsl(var(--brand-50))] hover:text-[hsl(var(--brand-700))] disabled:opacity-60"
        />
      </div>

      {/* Live chip row: what you are looking at right now. Chips spring in and out. */}
      <div className="relative flex shrink-0 flex-wrap items-center gap-1.5" role="status">
        <ChipList>
          <PopIn key="count" className="inline-flex max-w-full min-w-0">
            <span className="wb-chip" data-tone={isTruncated ? 'brand' : undefined}>
              {(loading || state.streaming) && <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-[hsl(var(--brand-500))] motion-reduce:animate-none" />}
              <span className="sr-only">{countChip}</span>
              <span aria-hidden className="tabular-nums">
                {countBits[0]}
                {countBits[1] != null ? <CountUp value={countBits[1]} duration={0.5} /> : null}
                {countBits[2]}
              </span>
            </span>
          </PopIn>
          {sort ? (
            <PopIn key="sort" className="inline-flex max-w-full min-w-0">
              <RemovableChip removeLabel={`Remove sort by ${sort.col}`} onRemove={() => setSort(null)}>
                <span className="inline-flex items-center gap-1">
                  <Turn open={sort.dir === 'desc'} deg={180} className="shrink-0"><ArrowUp aria-hidden className="size-3" /></Turn>
                  <span className="truncate">{sort.col}<span className="sr-only">, {sort.dir === 'asc' ? 'ascending' : 'descending'}</span></span>
                </span>
              </RemovableChip>
            </PopIn>
          ) : null}
          {searching && !loading ? (
            <PopIn key="search" className="inline-flex max-w-full min-w-0">
              <RemovableChip removeLabel={`Remove search ${query.trim()}`} onRemove={() => { setQuery(''); setPage(0); }}>
                <span className="tabular-nums">{view.length.toLocaleString()} {view.length === 1 ? 'match' : 'matches'} for “{query.trim()}”</span>
              </RemovableChip>
            </PopIn>
          ) : null}
        </ChipList>
        {isTruncated && onOpenFilters && (
          <Button variant="outline" size="xs" onClick={onOpenFilters} className="ml-auto h-6 rounded-full px-2.5 text-[12px]">
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
            <div ref={wrapRef} className="relative" style={{ width: tableWidth, minWidth: '100%' }}>
              {/* Header band: brand tint with a very faint lattice that fades toward the left, behind the labels. */}
              <div
                aria-hidden
                className={cn('tx tx--lattice pointer-events-none !sticky left-0 top-0 z-[9] -mb-8 w-full border-b border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] transition-shadow duration-150 motion-reduce:transition-none', scroll.y && 'shadow-[0_2px_6px_-3px_hsl(var(--foreground)/0.2)]')}
                style={{ height: HEAD_H, '--tx-opacity': 0.75, '--tx-opacity-dark': 0.3, '--tx-at': '340px 50%', '--tx-fade': '280px 150%', '--tx-size': '12px 12px' }}
              />
              {/* The selection marker: a tint over the row and a bar on the left edge (pinned while scrolling sideways). */}
              {mk ? (
                <>
                  <motion.span
                    aria-hidden
                    data-marker="tint"
                    initial={false}
                    animate={{ y: mk.top, height: mk.h, opacity: mk.show ? 1 : 0 }}
                    transition={{ y: mk.snap || reduce ? { duration: 0 } : SPRING, height: mk.snap || reduce ? { duration: 0 } : SPRING, opacity: { duration: reduce ? 0 : 0.15 } }}
                    className="pointer-events-none absolute left-0 top-0 z-[6] w-full bg-[hsl(var(--brand-500)/0.12)]"
                  />
                  <div className="sticky left-0 z-[6] h-0 w-0">
                    <motion.span
                      aria-hidden
                      data-marker="bar"
                      initial={false}
                      animate={{ y: mk.top + 6, height: Math.max(0, mk.h - 12), opacity: mk.show ? 1 : 0 }}
                      transition={{ y: mk.snap || reduce ? { duration: 0 } : SPRING, height: mk.snap || reduce ? { duration: 0 } : SPRING, opacity: { duration: reduce ? 0 : 0.15 } }}
                      className="pointer-events-none absolute left-0 top-0 w-[3px] rounded-full bg-[hsl(var(--brand-500))]"
                    />
                  </div>
                </>
              ) : null}
              <HoverCopy wrapRef={wrapRef} scrollerRef={scrollerRef} />
              <table
                style={{ width: '100%', tableLayout: 'fixed' }}
                className="border-separate border-spacing-0 text-[13px]"
              >
                <colgroup>
                  <col style={{ width: GUTTER_W }} />
                  {widths.map((w, k) => <col key={visibleCols[k]} style={{ width: w }} />)}
                </colgroup>
                <thead>
                  <tr style={{ height: HEAD_H }}>
                    <th scope="col" style={{ height: HEAD_H }} className={cn(th, thPinned, gutter, 'z-20 font-normal')}><span aria-hidden>#</span><span className="sr-only">Row number</span></th>
                    {visibleCols.map((c, k) => {
                      const on = sort?.col === c;
                      const pinned = k === 0;
                      return (
                        <th
                          key={c}
                          scope="col"
                          aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                          style={{ height: HEAD_H, ...(pinned ? { left: GUTTER_W } : null) }}
                          className={cn(th, 'group/th p-0', pinned && cn('z-20', thPinned), numeric[k] && 'text-right', on && 'font-semibold')}
                        >
                          <button
                            type="button"
                            onClick={() => cycleSort(c)}
                            title={`Sort by ${c}`}
                            style={{ height: HEAD_H - 1 }}
                            className={cn('flex w-full items-center gap-1 px-3 transition-colors duration-150 hover:bg-[hsl(var(--brand-200)/0.5)] motion-reduce:transition-none', FOCUS, 'focus-visible:-outline-offset-2', numeric[k] && 'flex-row-reverse')}
                          >
                            <span className="truncate">{c}</span>
                            <Turn open={on && sort.dir === 'desc'} deg={180} className="shrink-0">
                              {on ? <ArrowUp aria-hidden className="size-3" /> : <ChevronsUpDown aria-hidden className="size-3 opacity-0 transition-opacity duration-150 group-hover/th:opacity-50 motion-reduce:transition-none" />}
                            </Turn>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody ref={tbodyRef}>
                  {pageRows.map(({ r, n }, idx) => {
                    const on = selected === n;
                    const bg = on ? 'bg-[hsl(var(--wb-card))]' : 'bg-[hsl(var(--wb-card))] group-hover:bg-[hsl(var(--wb-row-hover))]';
                    const rowIntro = intro && !reduce && idx < 14 ? { animation: 'wb-fade 240ms var(--ease-out) backwards', animationDelay: `${idx * 25}ms` } : null;
                    const line = 'border-b border-[hsl(var(--wb-line)/0.7)]';
                    return (
                      <tr
                        key={n}
                        data-n={n}
                        aria-current={on ? 'true' : undefined}
                        onClick={() => { if (on && detailOpen) setDetailOpen(false); else { setSelected(n); setDetailOpen(true); } }}
                        style={{ height: rowH, ...rowIntro }}
                        className="group cursor-default"
                      >
                        <td style={{ height: rowH }} className={cn(gutter, line, bg, on && 'font-semibold text-[hsl(var(--brand-700))]')}>{n}</td>
                        {colIdx.map((i, k) => {
                          const kind = kinds[k];
                          const raw = r[i] || '';
                          const copyable = isMonoKind(kind) && !isMissing(raw);
                          return (
                            <td
                              key={i}
                              title={raw || undefined}
                              data-copy={copyable ? raw : undefined}
                              style={{ height: rowH, ...(k === 0 ? { left: GUTTER_W } : null) }}
                              className={cn(
                                'overflow-hidden text-ellipsis whitespace-nowrap px-3 text-foreground',
                                line,
                                bg,
                                k === 0 && cn('sticky z-[5]', pinEdge),
                                isMonoKind(kind) && 'pr-7 font-[family-name:var(--font-mono)] text-[12px]',
                                numeric[k] && 'text-right tabular-nums',
                                on && kind !== 'gene' && kind !== 'class' && 'font-semibold'
                              )}
                            >
                              {renderCellBody(kind, raw, { compact, freq: freqRanges[visibleCols[k]] })}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!loading && !view.length && searching && (
            <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
              <span aria-hidden className="mb-1 flex size-10 items-center justify-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-700))]"><SearchX className="size-[18px]" /></span>
              <p className="text-[13px] text-muted-foreground">No rows match “{query.trim()}” in the loaded {rows.length.toLocaleString()} rows.</p>
              <Button variant="outline" size="sm" onClick={() => { setQuery(''); setPage(0); }}><X aria-hidden /> Clear search</Button>
            </div>
          )}
        </div>

        {/* Focus ring for the scroller, drawn on the card edge so sticky cells cannot cover it. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-30 rounded-2xl ring-2 ring-inset ring-[hsl(var(--brand-500))] opacity-0 peer-focus-visible:opacity-100" />

        {/* Footer: where you are in the loaded rows, the page size, and row density. */}
        <div className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[hsl(var(--wb-line))] px-3 py-1 text-[12px] tabular-nums text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1">
            <button type="button" onClick={() => setPage(Math.max(0, pg - 1))} disabled={pg === 0} aria-label="Previous page" title="Previous page" className={cn('wb-iconbtn !size-6 disabled:opacity-40', FOCUS)}><ChevronLeft aria-hidden className="size-3.5" /></button>
            <span className="min-w-0 truncate px-1" aria-live="polite">
              {view.length ? `${firstShown.toLocaleString()}–${lastShown.toLocaleString()} of ${view.length.toLocaleString()}` : loading ? 'Loading rows' : '0 rows'}
              {isTruncated && !searching ? ' loaded' : ''}
            </span>
            <button type="button" onClick={() => setPage(Math.min(pageCount - 1, pg + 1))} disabled={pg >= pageCount - 1} aria-label="Next page" title="Next page" className={cn('wb-iconbtn !size-6 disabled:opacity-40', FOCUS)}><ChevronRight aria-hidden className="size-3.5" /></button>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Select value={String(limit)} onValueChange={(v) => chooseLimit(Number(v))} disabled={loading}>
              <SelectTrigger size="sm" aria-label="Rows per page" className="!h-7 !gap-1 !pl-2.5 !pr-1.5 !text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent side="top" align="end">
                {limitOptions.map((l) => (
                  <SelectItem key={l} value={String(l)}>{l === 500 ? 'All loaded' : `${l} rows`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                    'relative inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:text-foreground motion-reduce:transition-none',
                    density === id && 'text-[hsl(var(--brand-700))]',
                    FOCUS
                  )}
                >
                  {density === id ? (
                    <motion.span
                      layoutId="results-density-thumb"
                      aria-hidden
                      transition={reduce ? { duration: 0 } : SPRING}
                      style={{ borderRadius: 9999 }}
                      className="absolute inset-0 border border-[hsl(var(--brand-200))] bg-[hsl(var(--wb-card))]"
                    />
                  ) : null}
                  <Icon aria-hidden className="relative size-3.5" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Slide-over detail inside the panel: every column of the selected row, grouped. */}
      <AnimatePresence initial={false}>
        {showDetail ? (
          <RowDetail
            key="detail"
            n={selRow.n}
            row={selRow.r}
            header={header}
            meta={meta}
            freqRanges={freqRanges}
            visible={visibleCols}
            narrow={narrow}
            canPrev={selAt > 0}
            canNext={selAt >= 0 && selAt < view.length - 1}
            onStep={stepRow}
            onClose={() => { setDetailOpen(false); scrollerRef.current?.focus(); }}
          />
        ) : null}
      </AnimatePresence>
    </Frame>
  );
}
