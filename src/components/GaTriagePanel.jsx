import React, { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, RefreshCw, ListChecks } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
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

function humanEnrichment(bucket) {
  const s = String(bucket || '').trim();
  if (!s) return '—';
  const map = {
    KEEP_STRONG_REVIEW: 'Keep — strong',
    KEEP_REVIEW: 'Keep — review',
    FILTER_LOW_SUPPORT: 'Filtered — low support',
    FILTER_COMMON_OR_BENIGN: 'Filtered — common/benign',
  };
  if (map[s]) return map[s];
  return s
    .replace(/^KEEP_/i, 'Keep — ')
    .replace(/^FILTER_/i, 'Filtered — ')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function MetaChip({ label, value, tone = 'neutral', title }) {
  if (!value || value === '—') return null;
  const color =
    tone === 'warn'
      ? 'var(--error)'
      : tone === 'accent'
        ? 'var(--accent-teal)'
        : 'var(--text-secondary)';
  const border =
    tone === 'warn'
      ? 'color-mix(in srgb, var(--error) 35%, transparent)'
      : 'var(--border-subtle)';
  return (
    <span
      title={title || undefined}
      className="inline-flex items-baseline gap-1 rounded-md border px-2 py-0.5 text-2xs leading-snug max-w-full"
      style={{ borderColor: border, color }}
    >
      <span className="text-[var(--text-tertiary)] shrink-0">{label}</span>
      <span className="font-medium truncate">{value}</span>
    </span>
  );
}

/**
 * Analyst GA triage: ranked candidates + download full ga_triage.tsv.
 * Decision-support only — does not drive Clinical result / Additional findings / PDF.
 */
export default function GaTriagePanel({
  conversationId,
  isGuest = false,
  variantData = null,
  /** Changes when filter/enrichment eligibility updates — restarts peek after ACMG re-runs GA. */
  refreshKey = null,
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
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

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Peek on mount + poll while GA is in flight so the sidebar updates without a hard refresh.
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

  if (isGuest || !conversationId || !variantData) return null;

  const status = data?.status || 'absent';
  const ready = status === 'completed';
  const running = status === 'running' || status === 'pending' || status === 'queued';
  const candidates = Array.isArray(data?.top_candidates) ? data.top_candidates : [];
  const canDownload = ready && data?.can_download_tsv === true;

  const buttonLabel = running
    ? 'GA triage running…'
    : ready
      ? `GA triage (${data?.top_candidate_count ?? candidates.length})`
      : status === 'failed'
        ? 'GA triage failed'
        : 'GA triage';

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Open Genome Analyst triage top candidates (decision-support only)"
        className="w-full h-10 rounded-lg flex items-center justify-center gap-2 text-xs font-medium whitespace-nowrap transition-colors border border-[var(--border-subtle)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-sidebar)]"
      >
        {running ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <ListChecks className="w-4 h-4" />
        )}
        {buttonLabel}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-3xl w-[min(96vw,48rem)] max-h-[85vh] overflow-hidden flex flex-col gap-0 p-0"
          style={{ background: 'var(--bg-app)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="px-5 pt-5 pb-3 border-b border-[var(--border-subtle)] shrink-0">
            <DialogTitle className="text-base font-semibold text-[var(--text-primary)]">
              Top review candidates
            </DialogTitle>
            <DialogDescription className="text-xs mt-1 text-[var(--text-tertiary)]">
              Genome Analyst ranking for review. Enrichment still leads; this does not pick
              Clinical result, Additional findings, or the PDF.
            </DialogDescription>
          </div>

          <div className="px-5 py-3 flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] shrink-0">
            <button
              type="button"
              onClick={() => load()}
              disabled={loading}
              className="h-8 px-3 rounded-md text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!canDownload || downloading}
              title={
                canDownload
                  ? 'Download full triage TSV'
                  : 'Download available after triage completes'
              }
              className={`h-8 px-3 rounded-md text-xs font-medium inline-flex items-center gap-1.5 ${
                canDownload && !downloading
                  ? 'bg-[var(--accent-teal)] text-[var(--bg-app)] hover:brightness-110'
                  : 'bg-[var(--bg-surface)] text-[var(--text-tertiary)] cursor-not-allowed'
              }`}
            >
              {downloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Download full table
            </button>
            {data?.variant_count != null ? (
              <span className="text-2xs text-[var(--text-tertiary)] ml-auto">
                {candidates.length} shown
                {data.variant_count != null ? ` · ${data.variant_count} reviewed` : ''}
              </span>
            ) : null}
          </div>

          <div className="flex-1 overflow-auto px-5 py-3 min-h-0">
            {error && (
              <p className="text-xs text-[var(--error)] mb-2" title={error}>
                {error}
              </p>
            )}
            {loading && !data ? (
              <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] py-8 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading triage…
              </div>
            ) : !ready ? (
              <p className="text-xs text-[var(--text-secondary)] py-6 leading-relaxed">
                {data?.message ||
                  (running
                    ? 'Triage is still running.'
                    : status === 'failed'
                      ? data?.error || 'Triage failed.'
                      : 'Triage has not run for this case yet. It starts after enrichment when enabled.')}
              </p>
            ) : candidates.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)] py-6">
                {data?.message || 'No top candidates stored.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {candidates.map((row, index) => {
                  const change = formatChange(row.variant);
                  const enrichment = humanEnrichment(row.final_bucket || row.final_report);
                  const gaRec = humanGaLabel(row.label);
                  const conflict = row.has_final_ga_conflict
                    ? row.final_ga_conflict
                    : row.conflicts;
                  return (
                    <li
                      key={`${row.gene || 'g'}-${row.variant_id || row.variant || index}`}
                      className="rounded-lg border border-[var(--border-subtle)] px-3.5 py-3"
                      style={{ background: 'var(--bg-surface)' }}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-2xs font-semibold"
                          style={{
                            background: 'var(--bg-app)',
                            color: 'var(--text-tertiary)',
                            border: '1px solid var(--border-subtle)',
                          }}
                          aria-label={`Rank ${index + 1}`}
                        >
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="text-sm font-semibold text-[var(--text-primary)]">
                              {row.gene || 'Unknown gene'}
                            </span>
                            <span
                              className="text-xs text-[var(--text-secondary)] font-mono break-all"
                              title={change.full || undefined}
                            >
                              {change.primary}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <MetaChip
                              label="GA"
                              value={gaRec}
                              title={row.label || undefined}
                              tone="accent"
                            />
                            <MetaChip label="Score" value={row.score != null ? String(row.score) : null} />
                            <MetaChip
                              label="Enrichment"
                              value={enrichment}
                              title={row.final_bucket || row.final_report || undefined}
                            />
                            <MetaChip
                              label="ACMG"
                              value={row.ga_acmg_2015 || row.ga_acmg_point || null}
                            />
                            {conflict ? (
                              <MetaChip
                                label="Flag"
                                value={shortText(conflict, 48)}
                                title={String(conflict)}
                                tone="warn"
                              />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {ready && data?.clinical_use_note ? (
              <p className="text-2xs text-[var(--text-tertiary)] mt-3 leading-relaxed">
                {data.clinical_use_note}
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
