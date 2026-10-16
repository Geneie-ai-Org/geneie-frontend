import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Download,
  ListChecks,
  RefreshCw,
  Search,
  SearchX,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadGaTriageArtifact, fetchGaTriage } from '@/services/backendApi';
import { cn } from '@/lib/utils';
import { Collapse, CountUp, SelectionMarker, SPRING, StateButton, Turn } from '@/components/motion';

// Full-alpha 2px ring (the global one is 45% alpha, under 3:1 on white).
const FOCUS = 'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]';

function shortText(val, max = 80) {
  const s = String(val || '').trim();
  if (!s) return '—';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Prefer c. / p. fragments so the change line is readable in a narrow column. */
function formatChange(variant) {
  const raw = String(variant || '').trim();
  if (!raw) return { primary: '—', full: '' };
  const cMatch = raw.match(/c\.[^:\s]+/);
  const pMatch = raw.match(/p\.\([^)]+\)|p\.[A-Za-z0-9*]+/);
  if (cMatch || pMatch) {
    const parts = [cMatch?.[0], pMatch?.[0]].filter(Boolean);
    return { primary: parts.join(' '), full: raw };
  }
  return { primary: shortText(raw, 64), full: raw };
}

function humanGaLabel(label) {
  const s = String(label || '').trim();
  if (!s) return '—';
  const lower = s.toLowerCase();
  if (lower.startsWith('primary phenotype')) return 'Primary match';
  if (lower.includes('strong clinical')) return 'Strong candidate';
  if (lower.includes('follow-up') || lower.includes('follow up')) return 'Follow-up';
  if (lower.includes('review candidate')) return 'Review candidate';
  if (lower.includes('low priority')) return 'Low priority';
  return shortText(s, 40);
}

/** Status colour carries meaning only: confident calls read as success, follow-up as info. */
function toneForLabel(label) {
  if (label === 'Primary match' || label === 'Strong candidate') return 'success';
  if (label === 'Follow-up') return 'info';
  return 'neutral';
}

const TONES = {
  success: { bg: 'var(--success-soft)', fg: 'var(--success)' },
  info: { bg: 'var(--info-soft)', fg: 'var(--info)' },
  warning: { bg: 'var(--warning-soft)', fg: 'var(--warning)' },
  error: { bg: 'var(--error-soft)', fg: 'var(--error)' },
  neutral: { bg: 'hsl(var(--wb-pill))', fg: 'hsl(var(--muted-foreground))' },
};

/** A call pill: a dot plus the word, tinted by meaning. */
function CallPill({ tone = 'neutral', children, title }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span
      title={title || undefined}
      className="inline-flex h-[22px] max-w-full shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium"
      style={{ background: t.bg, color: t.fg, borderColor: `color-mix(in srgb, ${t.fg} 22%, transparent)` }}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: t.fg }} />
      <span className="truncate">{children}</span>
    </span>
  );
}

function countParts(data) {
  const counts = data?.ga_label_counts && typeof data.ga_label_counts === 'object' ? data.ga_label_counts : {};
  const reviewed = data?.variant_count;
  const parts = [];
  if (reviewed != null) parts.push({ n: Number(reviewed), label: 'reviewed' });
  const pick = (needle, label) => {
    const n = Object.entries(counts).reduce((acc, [k, v]) => {
      if (String(k).toLowerCase().includes(needle)) return acc + Number(v || 0);
      return acc;
    }, 0);
    if (n) parts.push({ n, label });
  };
  pick('primary', 'primary');
  pick('strong clinical', 'strong');
  pick('follow-up', 'follow-up');
  pick('vus', 'VUS or weak');
  pick('not causative', 'not causative');
  return parts;
}

function numericScore(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Rank and gene read low to high, score reads high to low. */
const SORTS = [
  ['rank', 'Rank'],
  ['gene', 'Gene'],
  ['score', 'Score'],
];

function DetailItem({ label, children, mono = false }) {
  if (children == null || children === '' || children === '—') return null;
  return (
    <div className="min-w-0">
      <dt className="text-[12px] font-medium text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 break-words text-[13px] text-foreground', mono && 'font-mono')}>{children}</dd>
    </div>
  );
}

function Notice({ icon: Icon = ListChecks, tone = 'brand', title, children, action }) {
  return (
    <div className="wb-card mx-auto flex w-full flex-col items-center gap-2 px-6 py-10 text-center">
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
      <p className="max-w-xs text-[13px] leading-5 text-muted-foreground">{children}</p>
      {action ? <div className="mt-1.5">{action}</div> : null}
    </div>
  );
}

function CardSkeleton({ rows = 5 }) {
  return (
    <ul className="space-y-2" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="wb-card flex items-center gap-3 px-3.5 py-3">
          <span className="size-7 shrink-0 animate-pulse rounded-full bg-[hsl(var(--brand-100))] motion-reduce:animate-none" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 w-24 animate-pulse rounded-full bg-[hsl(var(--brand-100))] motion-reduce:animate-none" />
            <span className="block h-2.5 w-40 animate-pulse rounded-full bg-[hsl(var(--brand-100))] motion-reduce:animate-none" />
          </span>
          <span className="h-5 w-24 animate-pulse rounded-full bg-[hsl(var(--brand-100))] motion-reduce:animate-none" />
        </li>
      ))}
    </ul>
  );
}

const PILL_FIELD =
  'h-8 w-full rounded-full border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] pl-8 pr-8 text-[13px] text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground hover:border-[hsl(var(--brand-300))] focus-visible:border-[hsl(var(--brand-500))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[hsl(var(--ring))] motion-reduce:transition-none max-md:h-11 max-md:text-base';

/**
 * Genome Analyst triage list. Plain workspace content: it fills its parent, scrolls its own
 * body and carries no drawer chrome. Review + TSV also live in ClinicalReportAssignModal;
 * GA ranking pre-checks Include, the analyst still confirms the PDF.
 */
export default function GaTriagePanel({
  conversationId,
  isGuest = false,
  variantData = null,
  /** Changes when filter/enrichment eligibility updates — restarts peek after ACMG re-runs GA. */
  refreshKey = null,
}) {
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [labelFilter, setLabelFilter] = useState('all');
  const [sortBy, setSortBy] = useState('rank');
  const [expandedKey, setExpandedKey] = useState(null);
  const [focusKey, setFocusKey] = useState(null); // the card that holds keyboard focus (drives the sliding tint)
  const [justDownloaded, setJustDownloaded] = useState(false);
  const reduce = useReducedMotion();
  const intro = useRef(true); // cards rise with a stagger on first load only
  // Boolean dep only — parent often replaces `variantData` with a new object each
  // pipeline tick; object identity in the effect deps cancelled the in-flight timer
  // and left the button stuck on "GA triage running…".
  const hasVariantData = Boolean(variantData);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!conversationId) return null;
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
    try {
      const payload = await fetchGaTriage(conversationId);
      setData(payload);
      return payload;
    } catch (err) {
      if (!quiet) {
        setError(err.message || 'Failed to load GA triage');
      }
      return null;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [conversationId]);

  // Peek on mount + poll while GA is in flight so the list updates without a hard refresh.
  useEffect(() => {
    if (!conversationId || isGuest || !hasVariantData) {
      setData(null);
      return undefined;
    }
    let cancelled = false;
    let timer = null;
    let inFlight = false;

    const peek = async () => {
      try {
        const payload = await fetchGaTriage(conversationId);
        if (cancelled) return null;
        setData(payload);
        const status = String(payload?.status || '').toLowerCase();
        inFlight = status === 'running' || status === 'pending' || status === 'queued';
        return payload;
      } catch {
        // Keep last known label; retry if we still believe a job is in flight.
        return null;
      }
    };

    const schedule = () => {
      if (cancelled || !inFlight) return;
      timer = setTimeout(async () => {
        await peek();
        if (!cancelled) schedule();
      }, 4000);
    };

    (async () => {
      await peek();
      if (!cancelled) schedule();
    })();

    const onFocus = () => {
      if (cancelled) return;
      peek().then(() => {
        if (!cancelled) schedule();
      });
    };
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [conversationId, isGuest, hasVariantData, refreshKey]);

  useEffect(() => {
    if (!justDownloaded) return undefined;
    const t = setTimeout(() => setJustDownloaded(false), 1800);
    return () => clearTimeout(t);
  }, [justDownloaded]);

  const handleDownload = async () => {
    if (!conversationId || downloading) return;
    setDownloading(true);
    setError(null);
    try {
      await downloadGaTriageArtifact(conversationId, 'tsv');
      setJustDownloaded(true);
    } catch (err) {
      setError(err.message || 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const status = String(data?.status || 'absent').toLowerCase();
  const ready = status === 'completed';
  const running = status === 'running' || status === 'pending' || status === 'queued';
  const failed = status === 'failed';
  const candidates = Array.isArray(data?.top_candidates) ? data.top_candidates : [];
  const canDownload = ready && data?.can_download_tsv === true;

  // Keep the GA rank on every row, so a re-sort never renumbers.
  const rows = useMemo(
    () =>
      candidates.map((row, index) => {
        const label = humanGaLabel(row.label);
        return {
          row,
          rank: index + 1,
          key: `${row.gene || 'g'}-${row.variant_id || row.variant || index}`,
          label,
          tone: toneForLabel(label),
          change: formatChange(row.variant),
          score: numericScore(row.score),
          conflict: row.ga_conflict || row.conflicts || null,
        };
      }),
    [candidates]
  );

  const labelCounts = useMemo(() => {
    const m = new Map();
    for (const r of rows) m.set(r.label, (m.get(r.label) || 0) + 1);
    return [...m.entries()];
  }, [rows]);

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (labelFilter !== 'all' && r.label !== labelFilter) return false;
      if (!q) return true;
      return (
        String(r.row.gene || '').toLowerCase().includes(q) ||
        String(r.row.variant || '').toLowerCase().includes(q)
      );
    });
    if (sortBy === 'gene') {
      out = [...out].sort((a, b) => String(a.row.gene || '').localeCompare(String(b.row.gene || '')) || a.rank - b.rank);
    } else if (sortBy === 'score') {
      out = [...out].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || a.rank - b.rank);
    }
    return out;
  }, [rows, query, labelFilter, sortBy]);

  const listShown = ready && visibleRows.length > 0;
  useEffect(() => {
    if (!listShown) return undefined;
    const t = setTimeout(() => { intro.current = false; }, 900);
    return () => clearTimeout(t);
  }, [listShown]);

  if (isGuest || !conversationId || !variantData) return null;

  const jobState = running ? 'running' : ready ? 'done' : failed ? 'failed' : 'pending';
  const jobWord = running ? 'Running' : ready ? 'Done' : failed ? 'Failed' : 'Not started';

  const filtersActive = query.trim() !== '' || labelFilter !== 'all';
  const hasRows = ready && candidates.length > 0;
  const chips = ready ? countParts(data) : [];

  // Up and Down move between candidate rows; the rows stay normal tab stops.
  const onListKey = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const btns = [...e.currentTarget.querySelectorAll('[data-cand]')];
    const at = btns.indexOf(document.activeElement);
    if (at < 0) return;
    e.preventDefault();
    const next = e.key === 'ArrowDown' ? Math.min(btns.length - 1, at + 1) : Math.max(0, at - 1);
    btns[next]?.focus();
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 px-4 pb-4 pt-1 text-foreground">
      {/* Summary card: title, job status, counts, and the one primary action. */}
      <section className="wb-card shrink-0 space-y-2.5 px-3.5 py-3" aria-label="Triage summary">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-700))]">
              <ListChecks className="size-3.5" />
            </span>
            <h2 className="truncate text-[14px] font-semibold">Top review candidates</h2>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => load()}
              disabled={loading}
              aria-label="Refresh triage"
              title="Refresh triage"
              className={cn('wb-iconbtn disabled:opacity-60 max-md:size-11', FOCUS)}
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin motion-reduce:animate-none')} aria-hidden />
            </button>
            <StateButton
              size="sm"
              state={downloading ? 'running' : justDownloaded ? 'done' : 'idle'}
              labels={{ idle: 'Download TSV', running: 'Preparing…', done: 'Downloaded' }}
              icon={Download}
              onClick={handleDownload}
              disabled={!canDownload}
              aria-describedby={!canDownload ? 'ga-download-reason' : undefined}
              className="h-8 max-md:h-11"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="wb-status" data-state={jobState}>{jobWord}</span>
          {ready && chips.length ? (
            chips.map((c) => <span key={c.label} className="wb-chip tabular-nums"><CountUp value={c.n} startAt={0} />{' '}{c.label}</span>)
          ) : ready ? (
            <span className="wb-chip tabular-nums"><CountUp value={candidates.length} startAt={0} /> shown</span>
          ) : (
            <span className="text-[13px] text-muted-foreground">Genome Analyst ranking. Decision support only.</span>
          )}
        </div>
        {!canDownload ? (
          <p id="ga-download-reason" className="text-[12px] text-muted-foreground">
            {running ? 'Download unlocks when triage is done.' : 'Download is available once triage is done.'}
          </p>
        ) : null}
      </section>

      {error ? (
        <div
          role="alert"
          className="flex shrink-0 items-start gap-2.5 rounded-2xl border px-3.5 py-3 text-[13px]"
          style={{ background: 'var(--error-soft)', borderColor: 'color-mix(in srgb, var(--error) 28%, transparent)' }}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--error)' }} aria-hidden />
          <span className="min-w-0 flex-1 text-foreground">
            <span className="font-medium">{String(error).replace(/[.\s]+$/, '')}.</span>{' '}
            <span className="text-muted-foreground">Check your connection, then retry.</span>
          </span>
          <Button type="button" variant="outline" size="xs" onClick={() => load()} className="h-6 shrink-0 px-2.5 max-md:h-9">
            Retry
          </Button>
        </div>
      ) : null}

      {/* Search, sort and call filters, only once there is a list to work on. */}
      {hasRows ? (
        <div className="shrink-0 space-y-2">
          <div className="flex items-center gap-1.5">
            <label className="relative flex min-w-0 flex-1 items-center">
              <Search aria-hidden className="pointer-events-none absolute left-3 size-3.5 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery(''); } }}
                placeholder={`Search ${candidates.length} candidates`}
                aria-label="Search candidates by gene or variant"
                className={cn(PILL_FIELD, '[&::-webkit-search-cancel-button]:hidden')}
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className={cn('absolute right-1.5 inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-[hsl(var(--brand-100))] hover:text-[hsl(var(--brand-700))] motion-reduce:transition-none max-md:size-8', FOCUS)}
                >
                  <X aria-hidden className="size-3" />
                </button>
              ) : null}
            </label>
            <div role="group" aria-label="Sort candidates" className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-pill))] p-0.5 max-md:p-1">
              {SORTS.map(([id, text]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={sortBy === id}
                  onClick={() => setSortBy(id)}
                  title={id === 'score' ? 'Sort by score, high to low' : `Sort by ${text.toLowerCase()}, low to high`}
                  className={cn(
                    'relative inline-flex h-7 items-center rounded-full border border-transparent px-2.5 text-[12px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground motion-reduce:transition-none max-md:h-9',
                    sortBy === id && 'text-[hsl(var(--brand-700))]',
                    FOCUS
                  )}
                >
                  {sortBy === id ? (
                    <motion.span
                      layoutId="ga-sort-thumb"
                      aria-hidden
                      transition={reduce ? { duration: 0 } : SPRING}
                      style={{ borderRadius: 9999 }}
                      className="absolute -inset-px border border-[hsl(var(--brand-200))] bg-[hsl(var(--wb-card))]"
                    />
                  ) : null}
                  <span className="relative">{text}</span>
                </button>
              ))}
            </div>
          </div>
          {labelCounts.length > 1 ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by GA call">
              {[['all', 'All', rows.length], ...labelCounts.map(([l, n]) => [l, l, n])].map(([id, text, n]) => {
                const active = labelFilter === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setLabelFilter(id)}
                    className={cn(
                      'relative inline-flex h-7 items-center rounded-full border px-3 text-[12px] tabular-nums transition-colors duration-150 motion-reduce:transition-none max-md:h-9',
                      active
                        ? 'border-transparent font-semibold text-[hsl(var(--brand-700))]'
                        : 'border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] font-medium text-muted-foreground hover:border-[hsl(var(--brand-300))] hover:bg-[hsl(var(--brand-50))] hover:text-[hsl(var(--brand-700))]',
                      FOCUS
                    )}
                  >
                    {active ? (
                      <motion.span
                        layoutId="ga-filter-pill"
                        aria-hidden
                        transition={reduce ? { duration: 0 } : SPRING}
                        style={{ borderRadius: 9999 }}
                        className="absolute -inset-px border border-[hsl(var(--brand-300))] bg-[hsl(var(--brand-100))]"
                      />
                    ) : null}
                    <span className="relative inline-flex items-center gap-1.5">
                      {active ? <Check aria-hidden className="size-3" /> : null}
                      {text}
                      <span className={active ? 'text-[hsl(var(--brand-700))]' : 'text-muted-foreground'}>{n}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Body: the only scroll region. */}
      <motion.div layoutScroll className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
        {loading && !data ? (
          <div role="status" aria-label="Loading triage" aria-busy="true"><CardSkeleton rows={6} /></div>
        ) : !ready ? (
          running ? (
            // A multi-minute job is a state, not a spinner: cards that will be filled in, plus one status line.
            <div role="status" aria-busy="true" className="space-y-3">
              <p className="px-1 text-[13px] text-muted-foreground">
                {data?.message || 'Triage is running. This list fills in by itself when it is done.'}
              </p>
              <CardSkeleton rows={4} />
            </div>
          ) : failed ? (
            <Notice
              icon={AlertCircle}
              tone="error"
              title="Triage failed"
              action={(
                <Button type="button" variant="outline" size="sm" className="max-md:h-11" onClick={() => load()} disabled={loading}>
                  <RefreshCw aria-hidden /> Check again
                </Button>
              )}
            >
              {data?.message || data?.error || 'The ranking stopped before it finished. Refresh to check again.'}
            </Notice>
          ) : (
            <Notice title="Triage has not run yet">
              {data?.message || 'It starts after enrichment, once the case has annotated variants.'}
            </Notice>
          )
        ) : candidates.length === 0 ? (
          <Notice title="No top candidates">
            {data?.message || 'Triage finished without any candidates to review.'}
          </Notice>
        ) : visibleRows.length === 0 ? (
          <Notice
            icon={SearchX}
            title="No candidates match"
            action={filtersActive ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="max-md:h-11"
                onClick={() => {
                  setQuery('');
                  setLabelFilter('all');
                }}
              >
                <X aria-hidden /> Clear filters
              </Button>
            ) : null}
          >
            Try a different gene, variant or GA call.
          </Notice>
        ) : (
          <ul
            aria-label={`Top review candidates, ${visibleRows.length} shown`}
            onKeyDown={onListKey}
            onFocus={(e) => { const k = e.target?.dataset?.cand; if (k) setFocusKey(k); }}
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocusKey(null); }}
            className="relative flex flex-col gap-2"
          >
            <AnimatePresence mode="popLayout">
              {visibleRows.map((r, idx) => {
                const open = expandedKey === r.key;
                const detailId = `ga-detail-${r.rank}`;
                return (
                  <motion.li
                    key={r.key}
                    layout={reduce ? false : 'position'}
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1], delay: intro.current && !reduce ? Math.min(idx, 12) * 0.03 : 0 } }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, transition: { duration: 0.16 } }}
                    transition={{ layout: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } }}
                    className={cn(
                      'wb-card relative overflow-hidden transition-colors duration-150 motion-reduce:transition-none',
                      open ? 'border-[hsl(var(--brand-300))]' : 'hover:border-[hsl(var(--brand-300))]'
                    )}
                  >
                    {focusKey === r.key ? <SelectionMarker group="ga-cand" /> : null}
                    <button
                      type="button"
                      data-cand={r.key}
                      aria-expanded={open}
                      aria-controls={detailId}
                      onClick={() => setExpandedKey(open ? null : r.key)}
                      className={cn('relative z-[2] flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-[hsl(var(--wb-row-hover))] motion-reduce:transition-none max-md:min-h-11', FOCUS, 'focus-visible:-outline-offset-2')}
                    >
                      <span
                        className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-pill))] text-[12px] font-semibold tabular-nums text-foreground"
                        title={`GA rank ${r.rank}`}
                      >
                        {r.rank}
                      </span>
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-[14px] font-semibold">{r.row.gene || 'Unknown gene'}</span>
                          {r.conflict ? (
                            <AlertCircle
                              className="size-3.5 shrink-0"
                              style={{ color: 'var(--error)' }}
                              role="img"
                              aria-label={`Flag: ${String(r.conflict)}`}
                            />
                          ) : null}
                          <span className="ml-auto"><CallPill tone={r.tone} title={r.row.label || undefined}>{r.label}</CallPill></span>
                        </span>
                        <span className="flex min-w-0 items-center justify-between gap-2">
                          <span className="truncate font-mono text-[12px] text-muted-foreground" title={r.change.full || undefined}>{r.change.primary}</span>
                          <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                            Score <span className="font-medium text-foreground">{r.score != null ? r.score : '—'}</span>
                          </span>
                        </span>
                      </span>
                      <span aria-hidden className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-card))] text-muted-foreground">
                        <Turn open={open} deg={180}><ChevronDown className="size-3.5" /></Turn>
                      </span>
                    </button>
                    <Collapse open={open} id={detailId}>
                      <div className="border-t border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-pill)/0.5)] px-4 pb-3.5 pt-3">
                        <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                          <div className="min-w-0 sm:col-span-2">
                            <dt className="text-[12px] font-medium text-muted-foreground">Variant</dt>
                            <dd className="mt-0.5 break-all font-mono text-[12px] text-foreground">
                              {r.change.full || r.row.variant || '—'}
                            </dd>
                          </div>
                          <DetailItem label="GA call">{r.row.label || r.label}</DetailItem>
                          <DetailItem label="Score">{r.score != null ? String(r.score) : null}</DetailItem>
                          <DetailItem label="ACMG">{r.row.ga_acmg_2015 || r.row.ga_acmg_point || null}</DetailItem>
                          <DetailItem label="Phenotype match">{r.row.phenotype_match || null}</DetailItem>
                          {r.conflict ? (
                            <div
                              className="min-w-0 rounded-xl border px-3 py-2 sm:col-span-2"
                              style={{ background: 'var(--error-soft)', borderColor: 'color-mix(in srgb, var(--error) 25%, transparent)' }}
                            >
                              <dt className="text-[12px] font-medium" style={{ color: 'var(--error)' }}>Flag</dt>
                              <dd className="mt-0.5 break-words text-[13px] text-foreground">{String(r.conflict)}</dd>
                            </div>
                          ) : null}
                        </dl>
                      </div>
                    </Collapse>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}

        {ready && data?.clinical_use_note ? (
          <p className="px-2 pb-1 pt-3 text-[12px] leading-relaxed text-muted-foreground">{data.clinical_use_note}</p>
        ) : null}
      </motion.div>

      {hasRows ? (
        <div className="flex shrink-0 items-start gap-2 text-[12px] text-muted-foreground">
          <span className="wb-chip shrink-0 tabular-nums" data-tone={filtersActive ? 'brand' : undefined}>
            <CountUp value={visibleRows.length} duration={0.4} /> of {candidates.length}
          </span>
          <span className="min-w-0 pt-0.5 leading-snug">Primary and strong calls pre-check Include. You still confirm before the PDF.</span>
        </div>
      ) : null}
    </div>
  );
}
