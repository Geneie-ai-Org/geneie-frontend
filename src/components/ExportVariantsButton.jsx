import React, { useState, useCallback, useEffect } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { getExportEligibility, exportVariants } from '@/services/backendApi';

/**
 * Download of the current working set.
 *
 * Readiness comes from two independent sources and both must agree:
 *  - `downloadGate` (from useVariantPipeline) — is any pipeline job still in flight?
 *    Enrichment counts as in-flight, so users never receive a half-enriched schema (F4).
 *  - `GET /api/export-variants-eligibility` — is there anything to export, and how many rows?
 *
 * `row_count` is then reconciled against the count the UI already promised the user; a
 * mismatch blocks the download rather than silently handing over a different file (F7/B-FE4).
 */
export default function ExportVariantsButton({
  conversationId,
  variantData,
  filteredCount,
  isGuest,
  downloadGate = null,
  uiCount = null,
}) {
  const [eligibility, setEligibility] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState(null);

  const gateBlocked = downloadGate?.blocked === true;

  const checkEligibility = useCallback(async () => {
    if (!conversationId || isGuest) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getExportEligibility(conversationId);
      setEligibility(data);
    } catch (err) {
      setEligibility(null);
      setError(err.message || 'Failed to check export eligibility');
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, isGuest]);

  useEffect(() => {
    if (conversationId && !isGuest && (variantData || filteredCount !== null)) {
      // `gateBlocked` is a dep so eligibility is re-fetched the moment a job finishes.
      checkEligibility();
    } else {
      setEligibility(null);
    }
  }, [conversationId, isGuest, variantData, filteredCount, gateBlocked, checkEligibility]);

  const handleExport = useCallback(async () => {
    if (!conversationId || isExporting) return;
    setIsExporting(true);
    setError(null);
    try {
      await exportVariants(conversationId);
    } catch (err) {
      setError(err.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [conversationId, isExporting]);

  if (isGuest) return null;
  if (!conversationId || !variantData) return null;

  const rowCount = eligibility?.row_count ?? 0;
  const message = eligibility?.message || '';

  // Counts legitimately disagree while a job is running, so only reconcile once it settles.
  const countMismatch =
    !gateBlocked &&
    eligibility?.can_export === true &&
    uiCount != null &&
    Number.isFinite(Number(uiCount)) &&
    Number(rowCount) !== Number(uiCount);

  const canExport = eligibility?.can_export === true && !gateBlocked && !countMismatch;

  // On >1000 files with no filter the export is the full annotated file, not the chat set (B-FE1).
  const annotatedOnly =
    canExport && (downloadGate?.annotatedOnly === true || eligibility?.source === 's3_annotated');

  const gateLabel = () => {
    if (downloadGate?.kind === 'enriching') {
      const pct = downloadGate.progress != null ? ` ${Math.round(downloadGate.progress)}%` : '';
      return `Enriching variants…${pct}`;
    }
    if (downloadGate?.kind === 'busy') return 'Applying filter…';
    return 'Checking export…';
  };

  const label = isExporting
    ? 'Exporting…'
    : gateBlocked
      ? gateLabel()
      : countMismatch
        ? 'Counts out of sync — refresh'
        : canExport
          ? annotatedOnly
            ? `Download ${rowCount.toLocaleString()} annotated variants`
            : `Download ${rowCount.toLocaleString()} variants`
          : isLoading && !eligibility
            ? 'Checking export…'
            : rowCount > 0
              ? 'Download'
              : 'Nothing to download yet';

  const subLine = countMismatch
    ? `Export has ${Number(rowCount).toLocaleString()} rows but this view shows ${Number(uiCount).toLocaleString()}.`
    : gateBlocked && downloadGate?.kind === 'enriching'
      ? downloadGate.message || 'Download unlocks when enrichment finishes.'
      : annotatedOnly
        ? 'Full annotated file — apply a filter to enable chat.'
        : null;

  const title = countMismatch
    ? 'Variant counts disagree — refresh before downloading'
    : gateBlocked
      ? downloadGate?.message || 'A job is still running'
      : canExport
        ? `Download ${rowCount.toLocaleString()} variants as TSV`
        : message;

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={countMismatch ? checkEligibility : handleExport}
        disabled={(!canExport && !countMismatch) || isExporting}
        title={title}
        className={`w-full h-10 rounded-lg flex items-center justify-center gap-2 text-[13px] font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-sidebar)] ${
          canExport && !isExporting
            ? 'bg-[var(--accent-teal)] text-[var(--bg-app)] hover:brightness-110'
            : countMismatch
              ? 'bg-[var(--bg-surface)] text-[var(--error)] hover:brightness-110'
              : 'bg-[var(--bg-surface)] text-[var(--text-tertiary)] cursor-not-allowed'
        }`}
      >
        {isExporting ? (
          <div className="w-3.5 h-3.5 rounded-full animate-spin" />
        ) : countMismatch ? (
          <RefreshCw className="w-4 h-4" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        {label}
      </button>
      {subLine && (
        <p
          className="text-[11px] leading-snug"
          style={{ color: countMismatch ? 'var(--error)' : 'var(--text-tertiary)' }}
        >
          {subLine}
        </p>
      )}
      {error && (
        <p className="text-[11px] text-[var(--error)] truncate" title={error}>
          {error}
        </p>
      )}
    </div>
  );
}
