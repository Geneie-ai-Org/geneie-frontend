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

/**
 * Analyst GA triage: open a top-candidates table + download full ga_triage.tsv.
 * Decision-support only — does not drive Clinical result / Additional findings / PDF.
 */
export default function GaTriagePanel({ conversationId, isGuest = false, variantData = null }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

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
        setData(null);
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

  // Initial peek + poll while GA is in flight so the sidebar updates without a hard refresh.
  useEffect(() => {
    if (!conversationId || isGuest || !variantData) {
      setData(null);
      return undefined;
    }
    let cancelled = false;
    let timer = null;

    const peek = async () => {
      try {
        const payload = await fetchGaTriage(conversationId);
        if (cancelled) return null;
        setData(payload);
        return payload;
      } catch {
        if (!cancelled) setData(null);
        return null;
      }
    };

    const schedule = (payload) => {
      const status = String(payload?.status || '').toLowerCase();
      const inFlight = status === 'running' || status === 'pending' || status === 'queued';
      if (!inFlight || cancelled) return;
      timer = setTimeout(async () => {
        const next = await peek();
        if (!cancelled) schedule(next);
      }, 8000);
    };

    (async () => {
      const payload = await peek();
      if (!cancelled) schedule(payload);
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [conversationId, isGuest, variantData]);

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
          className="max-w-5xl w-[min(96vw,64rem)] max-h-[85vh] overflow-hidden flex flex-col gap-0 p-0"
          style={{ background: 'var(--bg-app)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="px-5 pt-5 pb-3 border-b border-[var(--border-subtle)] shrink-0">
            <DialogTitle className="text-base font-semibold text-[var(--text-primary)]">
              Genome Analyst triage
            </DialogTitle>
            <DialogDescription className="text-xs mt-1 text-[var(--text-tertiary)]">
              Decision-support for review only. Enrichment FINAL_* still leads; this does not
              select Clinical result, Additional findings, or the PDF.
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
                  ? 'Download full ga_triage.tsv'
                  : 'TSV available after GA triage completes with an uploaded artifact'
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
              Download TSV
            </button>
            {data?.sample_id ? (
              <span className="text-2xs text-[var(--text-tertiary)] ml-auto">
                Sample {data.sample_id}
                {data.variant_count != null ? ` · ${data.variant_count} variants reviewed` : ''}
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
                Loading GA triage…
              </div>
            ) : !ready ? (
              <p className="text-xs text-[var(--text-secondary)] py-6 leading-relaxed">
                {data?.message ||
                  (running
                    ? 'GA triage is still running.'
                    : status === 'failed'
                      ? data?.error || 'GA triage failed.'
                      : 'GA triage has not run for this case yet. It starts after enrichment when enabled.')}
              </p>
            ) : candidates.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)] py-6">
                {data?.message || 'No top candidates stored.'}
              </p>
            ) : (
              <>
                <p className="text-2xs text-[var(--text-tertiary)] mb-2 leading-snug">
                  {data?.message}
                </p>
                <div className="overflow-x-auto rounded-md border border-[var(--border-subtle)]">
                  <table className="w-full text-left text-xs border-collapse min-w-[52rem]">
                    <thead>
                      <tr className="bg-[var(--bg-surface)] text-[var(--text-tertiary)]">
                        <th className="px-2.5 py-2 font-medium">#</th>
                        <th className="px-2.5 py-2 font-medium">Gene</th>
                        <th className="px-2.5 py-2 font-medium">Variant</th>
                        <th className="px-2.5 py-2 font-medium">GA label</th>
                        <th className="px-2.5 py-2 font-medium">Score</th>
                        <th className="px-2.5 py-2 font-medium">Reportability</th>
                        <th className="px-2.5 py-2 font-medium">GA ACMG</th>
                        <th className="px-2.5 py-2 font-medium">FINAL bucket</th>
                        <th className="px-2.5 py-2 font-medium">Conflict</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((row, index) => (
                        <tr
                          key={`${row.gene || 'g'}-${row.variant_id || row.variant || index}`}
                          className="border-t border-[var(--border-subtle)] align-top"
                        >
                          <td className="px-2.5 py-2 text-[var(--text-tertiary)]">{index + 1}</td>
                          <td className="px-2.5 py-2 font-medium text-[var(--text-primary)]">
                            {row.gene || '—'}
                          </td>
                          <td
                            className="px-2.5 py-2 text-[var(--text-secondary)] max-w-[14rem]"
                            title={row.variant || ''}
                          >
                            {shortText(row.variant, 56)}
                          </td>
                          <td
                            className="px-2.5 py-2 text-[var(--text-secondary)] max-w-[12rem]"
                            title={row.label || ''}
                          >
                            {shortText(row.label, 48)}
                          </td>
                          <td className="px-2.5 py-2 text-[var(--text-primary)]">{row.score ?? '—'}</td>
                          <td
                            className="px-2.5 py-2 text-[var(--text-secondary)] max-w-[10rem]"
                            title={row.reportability || ''}
                          >
                            {shortText(row.reportability, 36)}
                          </td>
                          <td className="px-2.5 py-2 text-[var(--text-secondary)]">
                            {row.ga_acmg_2015 || row.ga_acmg_point || '—'}
                          </td>
                          <td
                            className="px-2.5 py-2 text-[var(--text-secondary)] max-w-[10rem]"
                            title={row.final_bucket || row.final_report || ''}
                          >
                            {shortText(row.final_bucket || row.final_report, 32)}
                          </td>
                          <td
                            className="px-2.5 py-2 max-w-[12rem]"
                            style={{
                              color: row.has_final_ga_conflict
                                ? 'var(--error)'
                                : 'var(--text-tertiary)',
                            }}
                            title={row.final_ga_conflict || row.conflicts || ''}
                          >
                            {row.has_final_ga_conflict
                              ? shortText(row.final_ga_conflict, 60)
                              : shortText(row.conflicts, 40)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data?.clinical_use_note ? (
                  <p className="text-2xs text-[var(--text-tertiary)] mt-3 leading-relaxed">
                    {data.clinical_use_note}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
