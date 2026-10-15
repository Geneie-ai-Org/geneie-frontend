import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronRight,
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

function StatusChip({ tone = 'neutral', children, title, dot = true, pulse = false }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span
      title={title || undefined}
      className="inline-flex h-5 max-w-full shrink-0 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium"
      style={{ background: t.bg, color: t.fg }}
    >
      {dot ? (
        <span
          aria-hidden
          className={`size-1.5 shrink-0 rounded-full ${pulse ? 'motion-safe:animate-pulse' : ''}`}
          style={{ background: t.fg }}
        />
      ) : null}
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

/** Column headers are the sort controls. Rank and gene read low to high, score reads high to low. */
const SORT_DIRECTION = { rank: 'ascending', gene: 'ascending', score: 'descending' };

function DetailItem({ label, children, mono = false }) {
  if (children == null || children === '' || children === '—') return null;
  return (
    <div className="min-w-0">
      <dt className="text-[12px] font-medium text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 break-words text-[13px] text-foreground ${mono ? 'font-mono' : ''}`}>
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
    <StatusChip tone="info" pulse>Running</StatusChip>
  ) : ready ? (
    <StatusChip tone="success">Done</StatusChip>
  ) : failed ? (
    <StatusChip tone="error">Failed</StatusChip>
  ) : (
    <StatusChip tone="neutral">Not started</StatusChip>
  );

  const filtersActive = query.trim() !== '' || labelFilter !== 'all';
  const hasRows = ready && candidates.length > 0;

  const renderSortHeader = (id, label, className = '') => {
    const active = sortBy === id;
    const Arrow = SORT_DIRECTION[id] === 'descending' ? ArrowDown : ArrowUp;
    return (
      <th key={id} scope="col" aria-sort={active ? SORT_DIRECTION[id] : 'none'} className={`h-8 px-2 font-medium ${className}`}>
        <button
          type="button"
          onClick={() => setSortBy(id)}
          title={`Sort by ${label.toLowerCase()}`}
          className={`inline-flex h-6 items-center gap-1 rounded px-1 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55 ${
            active ? 'text-foreground' : ''
          }`}
        >
          {label}
          {active ? <Arrow className="size-3" aria-hidden /> : null}
        </button>
      </th>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      {/* Summary header: title and status, counts, one primary action top right. */}
      <div className="shrink-0 space-y-1.5 border-b border-border px-4 pb-3 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <ListChecks className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <h2 className="truncate text-[13px] font-semibold">Top review candidates</h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => load()}
              disabled={loading}
              aria-label="Refresh triage"
              title="Refresh triage"
              className="text-muted-foreground max-md:size-11"
            >
              {loading ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <RefreshCw aria-hidden />}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleDownload}
              disabled={!canDownload || downloading}
              aria-describedby={!canDownload ? 'ga-download-reason' : undefined}
              className="max-md:h-11"
            >
              {downloading ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Download aria-hidden />}
              {downloading ? 'Preparing…' : 'Download TSV'}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {statusChip}
          <p className="min-w-0 text-[13px] tabular-nums text-muted-foreground">
            {ready
              ? countLine(data) || `${candidates.length} shown`
              : 'Genome Analyst ranking. Decision support only.'}
          </p>
        </div>
        {!canDownload ? (
          <p id="ga-download-reason" className="text-[12px] text-muted-foreground">
            {running ? 'Download unlocks when triage is done.' : 'Download is available once triage is done.'}
          </p>
        ) : null}
      </div>

      {/* Search and call filter */}
      {hasRows ? (
        <div className="shrink-0 space-y-2 border-b border-border px-4 py-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${candidates.length} candidates by gene or variant`}
              aria-label="Search candidates by gene or variant"
              className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-8 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 max-md:h-11 max-md:text-base"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55 max-md:size-10"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            ) : null}
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
                    className={`inline-flex h-6 items-center rounded-full border px-2.5 text-[12px] font-medium tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/55 max-md:min-h-11 max-md:px-3 ${
                      active
                        ? 'border-[hsl(var(--signal))] bg-[var(--accent-teal-soft)] text-foreground'
                        : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {text}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Body. scroll-pt keeps a focused row clear of the sticky column header. */}
      <div className="min-h-0 flex-1 scroll-pt-9 overflow-y-auto">
        {error ? (
          <div
            role="alert"
            className="m-4 flex items-start gap-2 rounded-md border px-3 py-2 text-[13px]"
            style={{
              background: 'var(--error-soft)',
              borderColor: 'color-mix(in srgb, var(--error) 30%, transparent)',
            }}
          >
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" style={{ color: 'var(--error)' }} aria-hidden />
            <span className="min-w-0 flex-1 text-foreground">
              <span className="font-medium">{error}.</span>{' '}
              <span className="text-muted-foreground">Check your connection, then retry.</span>
            </span>
            <Button type="button" variant="outline" size="xs" onClick={() => load()} className="shrink-0 max-md:h-9">
              Retry
            </Button>
          </div>
        ) : null}

        {loading && !data ? (
          <div className="space-y-1 p-4" role="status" aria-label="Loading triage" aria-busy="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : !ready ? (
          running ? (
            // A multi-minute job is a state, not a spinner: rows that will be filled in, plus one status line.
            <div role="status" aria-busy="true" className="px-4 py-4">
              <p className="mb-3 text-[13px] text-muted-foreground">
                {data?.message || 'Triage is running. This list fills in by itself when it is done.'}
              </p>
              <div className="space-y-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-sm flex-col items-center px-6 py-12 text-center">
              {failed ? (
                <AlertCircle className="mb-3 size-5" style={{ color: 'var(--error)' }} aria-hidden />
              ) : (
                <ListChecks className="mb-3 size-5 text-muted-foreground" aria-hidden />
              )}
              <p className="text-[15px] font-medium">{failed ? 'Triage failed' : 'Triage has not run yet'}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {data?.message ||
                  (failed
                    ? data?.error || 'The ranking stopped before it finished. Refresh to check again.'
                    : 'It starts after enrichment, once the case has annotated variants.')}
              </p>
              {failed ? (
                <Button type="button" variant="outline" size="sm" className="mt-3 max-md:h-11" onClick={() => load()} disabled={loading}>
                  <RefreshCw aria-hidden /> Check again
                </Button>
              ) : null}
            </div>
          )
        ) : candidates.length === 0 ? (
          <div className="mx-auto max-w-sm px-6 py-12 text-center">
            <p className="text-[15px] font-medium">No top candidates</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {data?.message || 'Triage finished without any candidates to review.'}
            </p>
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="mx-auto max-w-sm px-6 py-12 text-center">
            <p className="text-[15px] font-medium">No candidates match</p>
            <p className="mt-1 text-[13px] text-muted-foreground">Try a different gene, variant or GA call.</p>
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
          <table className="w-full table-fixed border-collapse text-[13px]">
            <caption className="sr-only">Top review candidates, {visibleRows.length} shown</caption>
            <colgroup>
              <col className="w-[3.25rem]" />
              <col className="w-[5.75rem]" />
              <col />
              <col className="w-36" />
              <col className="w-12" />
            </colgroup>
            <thead className="sticky top-0 z-20 bg-background text-[12px] text-muted-foreground shadow-[0_1px_0_hsl(var(--border))]">
              <tr>
                {renderSortHeader('rank', 'Rank', 'pl-3 text-right')}
                {renderSortHeader('gene', 'Gene', 'text-left')}
                <th scope="col" className="h-8 px-2 text-left font-medium">Change</th>
                <th scope="col" className="h-8 px-2 text-left font-medium">GA call</th>
                {renderSortHeader('score', 'Score', 'pr-2 text-right')}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => {
                const open = expandedKey === r.key;
                const detailId = `ga-detail-${r.rank}`;
                const toggle = () => setExpandedKey(open ? null : r.key);
                return (
                  <React.Fragment key={r.key}>
                    <tr
                      onClick={toggle}
                      className={`h-9 cursor-pointer border-b border-[var(--border-subtle)] transition-colors hover:bg-muted max-md:h-11 ${
                        open ? 'bg-[var(--bg-surface-sunken)]' : ''
                      }`}
                    >
                      <td className="pl-3 pr-2 text-right text-[12px] tabular-nums text-muted-foreground">{r.rank}</td>
                      <td className="px-2">
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-controls={detailId}
                          className="flex h-8 w-full min-w-0 items-center gap-1 rounded text-left font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/55"
                        >
                          <ChevronRight
                            aria-hidden
                            className={`size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
                          />
                          <span className="truncate">{r.row.gene || 'Unknown gene'}</span>
                          {r.conflict ? (
                            <AlertCircle
                              className="size-3.5 shrink-0"
                              style={{ color: 'var(--error)' }}
                              role="img"
                              aria-label={`Flag: ${String(r.conflict)}`}
                            />
                          ) : null}
                        </button>
                      </td>
                      <td className="truncate px-2 font-mono text-[12px] text-muted-foreground" title={r.change.full || undefined}>
                        {r.change.primary}
                      </td>
                      <td className="px-2">
                        <StatusChip tone={r.tone} title={r.row.label || undefined}>
                          {r.label}
                        </StatusChip>
                      </td>
                      <td className="pl-1 pr-3 text-right tabular-nums text-foreground">
                        {r.score != null ? r.score : '—'}
                      </td>
                    </tr>
                    {open ? (
                      <tr id={detailId} className="border-b border-[var(--border-subtle)]" style={{ background: 'var(--bg-surface-sunken)' }}>
                        <td colSpan={5} className="px-4 pb-3 pl-[3.25rem] pt-1">
                          <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
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
                              <div className="min-w-0 sm:col-span-2">
                                <dt className="text-[12px] font-medium" style={{ color: 'var(--error)' }}>Flag</dt>
                                <dd className="mt-0.5 break-words text-[13px] text-foreground">{String(r.conflict)}</dd>
                              </div>
                            ) : null}
                          </dl>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}

        {ready && data?.clinical_use_note ? (
          <p className="px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">{data.clinical_use_note}</p>
        ) : null}
      </div>

      {hasRows ? (
        <div className="shrink-0 border-t border-border px-4 py-2 text-[12px] tabular-nums text-muted-foreground">
          Showing {visibleRows.length} of {candidates.length}. Primary and strong calls pre-check Include;
          you still confirm before the PDF.
        </div>
      ) : null}
    </div>
  );
}
