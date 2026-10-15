import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  Download,
  ListChecks,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { downloadGaTriageArtifact, fetchGaTriage } from '@/services/backendApi';

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
  neutral: { bg: 'var(--segment-track)', fg: 'var(--text-secondary)' },
};

function StatusChip({ tone = 'neutral', children, title, dot = true }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span
      title={title || undefined}
      className="inline-flex h-5 max-w-full shrink-0 items-center gap-1.5 rounded-full px-2 text-2xs font-medium"
      style={{ background: t.bg, color: t.fg }}
    >
      {dot ? <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: t.fg }} /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

function countLine(data) {
  const counts = data?.ga_label_counts && typeof data.ga_label_counts === 'object' ? data.ga_label_counts : {};
  const reviewed = data?.variant_count;
  const parts = [];
  if (reviewed != null) parts.push(`${Number(reviewed).toLocaleString()} variants reviewed`);
  const pick = (needle, label) => {
    const n = Object.entries(counts).reduce((acc, [k, v]) => {
      if (String(k).toLowerCase().includes(needle)) return acc + Number(v || 0);
      return acc;
    }, 0);
    if (n) parts.push(`${n.toLocaleString()} ${label}`);
  };
  pick('primary', 'primary');
  pick('strong clinical', 'strong');
  pick('follow-up', 'follow-up');
  pick('vus', 'VUS/weak');
  pick('not causative', 'not causative');
  return parts.join(' · ');
}

function numericScore(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const SORTS = [
  { id: 'rank', label: 'GA rank' },
  { id: 'score', label: 'Score' },
  { id: 'gene', label: 'Gene' },
];

function DetailItem({ label, children, mono = false }) {
  if (children == null || children === '' || children === '—') return null;
  return (
    <div className="min-w-0">
      <dt className="text-2xs font-medium text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 break-words text-xs text-foreground ${mono ? 'font-mono' : ''}`}>
        {children}
      </dd>
    </div>
  );
}

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

  const handleDownload = async () => {
    if (!conversationId || downloading) return;
    setDownloading(true);
    setError(null);
    try {
      await downloadGaTriageArtifact(conversationId, 'tsv');
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

  if (isGuest || !conversationId || !variantData) return null;

  const statusChip = running ? (
    <StatusChip tone="info">Running</StatusChip>
  ) : ready ? (
    <StatusChip tone="success">Complete</StatusChip>
  ) : failed ? (
    <StatusChip tone="error">Failed</StatusChip>
  ) : (
    <StatusChip tone="neutral">Not started</StatusChip>
  );

  const filtersActive = query.trim() !== '' || labelFilter !== 'all';

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      {/* Summary header */}
      <div className="shrink-0 space-y-2 border-b border-border px-4 pb-3 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <ListChecks className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <h2 className="truncate text-sm font-semibold">Top review candidates</h2>
            {statusChip}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => load()}
              disabled={loading}
              className="max-md:h-11"
            >
              {loading ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <RefreshCw aria-hidden />}
              Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={!canDownload || downloading}
              className="max-md:h-11"
            >
              {downloading ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Download aria-hidden />}
              Download TSV
            </Button>
          </div>
        </div>
        <p className="text-xs tabular-nums text-muted-foreground">
          {ready
            ? countLine(data) || `${candidates.length} shown`
            : 'Genome Analyst ranking. Decision support only.'}
          {!canDownload ? (
            <span className="block">Download is available once triage completes.</span>
          ) : null}
        </p>
      </div>

      {/* Filters */}
      {ready && candidates.length > 0 ? (
        <div className="shrink-0 space-y-2 border-b border-border px-4 py-2">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by gene or variant"
                aria-label="Filter candidates by gene or variant"
                className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 md:text-[13px] max-md:h-11 [&::-webkit-search-cancel-button]:hidden"
              />
            </div>
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span className="max-sm:sr-only">Sort</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 md:text-[13px] max-md:h-11"
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {labelCounts.length > 1 ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by GA call">
              {[['all', `All ${rows.length}`], ...labelCounts.map(([l, n]) => [l, `${l} ${n}`])].map(([id, text]) => {
                const active = labelFilter === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setLabelFilter(id)}
                    className="inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/55 max-md:min-h-11 max-md:px-3"
                    style={{
                      borderColor: active ? 'hsl(var(--primary))' : 'var(--border-strong)',
                      background: active ? 'var(--accent-teal-soft)' : 'transparent',
                      color: active ? 'hsl(var(--primary))' : 'var(--text-secondary)',
                    }}
                  >
                    {text}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <div
            role="alert"
            className="m-4 flex items-start gap-2 rounded-md border px-3 py-2 text-xs"
            style={{
              background: 'var(--error-soft)',
              borderColor: 'color-mix(in srgb, var(--error) 30%, transparent)',
            }}
          >
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" style={{ color: 'var(--error)' }} aria-hidden />
            <span className="min-w-0 flex-1 text-foreground">
              <span className="font-medium">{error}.</span>{' '}
              <span className="text-muted-foreground">Check your connection and try again.</span>
            </span>
            <Button type="button" variant="outline" size="xs" onClick={() => load()} className="shrink-0 max-md:h-9">
              Retry
            </Button>
          </div>
        ) : null}

        {loading && !data ? (
          <div className="space-y-1 p-4" role="status" aria-label="Loading triage">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : !ready ? (
          <div className="mx-auto flex max-w-sm flex-col items-center px-6 py-12 text-center">
            {running ? (
              <Loader2 className="mb-3 size-5 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
            ) : failed ? (
              <AlertCircle className="mb-3 size-5" style={{ color: 'var(--error)' }} aria-hidden />
            ) : (
              <ListChecks className="mb-3 size-5 text-muted-foreground" aria-hidden />
            )}
            <p className="text-sm font-medium">
              {running ? 'Triage is running' : failed ? 'Triage failed' : 'Triage has not run yet'}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {data?.message ||
                (running
                  ? 'This list fills in by itself when it finishes.'
                  : failed
                    ? data?.error || 'Something went wrong. Refresh to check again.'
                    : 'It starts after enrichment, once the case has annotated variants.')}
            </p>
          </div>
        ) : candidates.length === 0 ? (
          <div className="mx-auto max-w-sm px-6 py-12 text-center">
            <p className="text-sm font-medium">No top candidates</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {data?.message || 'Triage finished without any candidates to review.'}
            </p>
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="mx-auto max-w-sm px-6 py-12 text-center">
            <p className="text-sm font-medium">No candidates match</p>
            <p className="mt-1 text-xs text-muted-foreground">Try a different gene, variant or GA call.</p>
            {filtersActive ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 max-md:h-11"
                onClick={() => {
                  setQuery('');
                  setLabelFilter('all');
                }}
              >
                <X aria-hidden /> Clear filters
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visibleRows.map((r) => {
              const open = expandedKey === r.key;
              const detailId = `ga-detail-${r.rank}`;
              return (
                <li key={r.key}>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={detailId}
                    onClick={() => setExpandedKey(open ? null : r.key)}
                    className="grid h-9 w-full grid-cols-[1.5rem_minmax(3rem,auto)_minmax(0,1fr)_auto_2.25rem_1rem] items-center gap-x-2 px-4 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/55 max-md:h-11"
                    style={{ background: open ? 'var(--bg-surface-sunken)' : undefined }}
                  >
                    <span
                      className="text-2xs tabular-nums text-muted-foreground"
                      aria-label={`GA rank ${r.rank}`}
                    >
                      {r.rank}
                    </span>
                    <span className="truncate text-[13px] font-semibold">{r.row.gene || 'Unknown gene'}</span>
                    <span className="truncate font-mono text-xs text-muted-foreground" title={r.change.full || undefined}>
                      {r.change.primary}
                    </span>
                    <span className="flex items-center gap-1">
                      {r.conflict ? <StatusChip tone="error" title={String(r.conflict)}>Flag</StatusChip> : null}
                      <StatusChip tone={r.tone} title={r.row.label || undefined}>
                        {r.label}
                      </StatusChip>
                    </span>
                    <span className="text-right text-xs tabular-nums text-foreground">
                      {r.score != null ? r.score : '—'}
                    </span>
                    <ChevronDown
                      aria-hidden
                      className={`size-3.5 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {open ? (
                    <dl
                      id={detailId}
                      className="grid grid-cols-1 gap-x-4 gap-y-2.5 px-4 pb-3 pl-[3.5rem] pt-1 sm:grid-cols-2"
                      style={{ background: 'var(--bg-surface-sunken)' }}
                    >
                      <div className="min-w-0 sm:col-span-2">
                        <dt className="text-2xs font-medium text-muted-foreground">Variant</dt>
                        <dd className="mt-0.5 break-all font-mono text-xs text-foreground">
                          {r.change.full || r.row.variant || '—'}
                        </dd>
                      </div>
                      <DetailItem label="GA call">{r.row.label || r.label}</DetailItem>
                      <DetailItem label="Score">{r.score != null ? String(r.score) : null}</DetailItem>
                      <DetailItem label="ACMG">{r.row.ga_acmg_2015 || r.row.ga_acmg_point || null}</DetailItem>
                      <DetailItem label="Phenotype match">{r.row.phenotype_match || null}</DetailItem>
                      {r.conflict ? (
                        <div className="min-w-0 sm:col-span-2">
                          <dt className="text-2xs font-medium" style={{ color: 'var(--error)' }}>Flag</dt>
                          <dd className="mt-0.5 break-words text-xs text-foreground">{String(r.conflict)}</dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {ready && data?.clinical_use_note ? (
          <p className="px-4 py-3 text-2xs leading-relaxed text-muted-foreground">{data.clinical_use_note}</p>
        ) : null}
      </div>

      {ready && candidates.length > 0 ? (
        <div className="shrink-0 border-t border-border px-4 py-2 text-2xs tabular-nums text-muted-foreground">
          Showing {visibleRows.length} of {candidates.length}. Primary and strong calls pre-check Include;
          you still confirm before the PDF.
        </div>
      ) : null}
    </div>
  );
}
