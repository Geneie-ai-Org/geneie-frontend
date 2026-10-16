import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { StateButton } from '@/components/motion';
import { useDoneFlash } from '@/components/motion/useDoneFlash';
import { getExportEligibility, exportVariants } from '@/services/backendApi';

/** Status dot for the working states: a small pulse, never a spinner beside a label that says otherwise. */
function WorkingDot() {
  return <span aria-hidden className="inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-[var(--info)] motion-reduce:animate-none" />;
}

/**
 * Download of the current working set.
 *
 * Readiness comes from two independent sources and both must agree:
 *  - `downloadGate` (from useVariantPipeline) — is any pipeline job still in flight?
 *    Enrichment counts as in-flight, so users never receive a half-enriched schema.
 *  - `GET /api/export-variants-eligibility` — is there anything to export, and how many rows?
 *
 * `row_count` is then reconciled against the count the UI already promised the user; a
 * mismatch blocks the download rather than silently handing over a different file.
 */
export default function ExportVariantsButton({
  conversationId,
  variantData,
  filteredCount,
  isGuest,
  downloadGate = null,
  uiCount = null,
  onReconcileUiCount = null,
  /** The chat-eligibility sentence the host already shows once; this control never repeats it. */
  eligibilityMessage = null,
}) {
  const [eligibility, setEligibility] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState(null);

  const gateBlocked = downloadGate?.blocked === true;

  // After a download that finished without an error the label reads "Downloaded" for a moment.
  const { done: downloaded } = useDoneFlash(isExporting, { ok: !error });

  // Read through refs: the parent passes a new `onReconcileUiCount` on every render, and as a
  // dependency it re-created checkEligibility each time — re-fetching eligibility on every
  // sidebar re-render (several per second while jobs poll).
  const latestRef = useRef({ gateBlocked, uiCount, onReconcileUiCount });
  latestRef.current = { gateBlocked, uiCount, onReconcileUiCount };

  const applyEligibility = useCallback((data) => {
    setEligibility(data);
    const { gateBlocked: blocked, uiCount: count, onReconcileUiCount: reconcile } = latestRef.current;
    if (
      !blocked &&
      data?.can_export === true &&
      data?.source === 'postgres' &&
      count != null &&
      Number.isFinite(Number(count)) &&
      Number.isFinite(Number(data.row_count)) &&
      Number(data.row_count) !== Number(count) &&
      typeof reconcile === 'function'
    ) {
      // Postgres/export is source of truth after enrichment dedupe; sync Under consideration.
      reconcile(Number(data.row_count));
    }
  }, []);

  const checkEligibility = useCallback(async () => {
    if (!conversationId || isGuest) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getExportEligibility(conversationId);
      applyEligibility(data);
    } catch (err) {
      setEligibility(null);
      setError(err.message || 'Failed to check export eligibility');
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, isGuest, applyEligibility]);

  // `hasVariantData` (a boolean), not `variantData`: the parent replaces that object on every
  // pipeline tick, which re-fetched eligibility each time.
  const hasVariantData = Boolean(variantData);
  useEffect(() => {
    if (conversationId && !isGuest && (hasVariantData || filteredCount !== null)) {
      // `gateBlocked` is a dep so eligibility is re-fetched the moment a job finishes.
      checkEligibility();
    } else {
      setEligibility(null);
    }
  }, [conversationId, isGuest, hasVariantData, filteredCount, gateBlocked, checkEligibility]);

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

  // On >1000 files with no filter the export is the full annotated file, not the chat set.
  const annotatedOnly =
    canExport && (downloadGate?.annotatedOnly === true || eligibility?.source === 's3_annotated');

  const gateLabel = () => {
    if (downloadGate?.kind === 'enriching') {
      const pct = downloadGate.progress != null ? ` ${Math.round(downloadGate.progress)}%` : '';
      return `Enriching variants…${pct}`;
    }
    if (downloadGate?.kind === 'busy') return 'Applying filter…';
    if (downloadGate?.kind === 'syncing') return 'Syncing latest state…';
    return 'Checking export…';
  };

  const label = isExporting
    ? 'Preparing download…'
    : gateBlocked
      ? gateLabel()
      : countMismatch
        ? 'Counts out of sync. Refresh'
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
    : gateBlocked && downloadGate?.kind === 'syncing'
      ? downloadGate.message || 'State syncing after filter change. Download unlocks automatically.'
    : gateBlocked && downloadGate?.kind === 'enriching'
      ? downloadGate.message || 'Download unlocks when enrichment finishes.'
      : annotatedOnly
        ? null
        : !canExport && !isLoading && message && message !== eligibilityMessage
          ? message
          : null;

  const title = countMismatch
    ? 'Variant counts disagree. Refresh before downloading'
    : gateBlocked
      ? downloadGate?.message || 'A job is still running'
      : canExport
        ? `Download ${rowCount.toLocaleString()} variants as TSV`
        : message;

  // Working states carry a small dot (status), never a spinner beside a label that says otherwise.
  const working = isExporting || gateBlocked || (isLoading && !eligibility);
  const interactive = (canExport || countMismatch) && !isExporting && !gateBlocked;

  return (
    <div className="space-y-1">
      <StateButton
        state={isExporting ? 'running' : downloaded ? 'done' : 'idle'}
        labels={{ idle: label, running: 'Preparing download…', done: 'Downloaded' }}
        icon={working ? WorkingDot : countMismatch ? RefreshCw : Download}
        variant="outline"
        size="sm"
        onClick={countMismatch ? checkEligibility : handleExport}
        disabled={!interactive && !isExporting}
        title={title}
        aria-busy={isExporting || undefined}
        className={`h-9 max-md:h-11 w-full min-w-0 justify-start gap-1.5 px-3.5 text-[13px] tabular-nums disabled:opacity-100 [&>span:last-child]:min-w-0 [&>span:last-child]:truncate ${
          countMismatch ? '!border-[var(--error)] !text-[var(--error)]' : interactive ? '' : 'text-muted-foreground'
        }`}
      />
      {subLine && (
        <p
          role="status"
          className={`wb-rise px-1 text-[12px] leading-snug ${countMismatch ? 'text-[var(--error)]' : 'text-muted-foreground'}`}
        >
          {subLine}
        </p>
      )}
      {error && (
        <p role="alert" className="wb-rise flex flex-wrap items-center gap-x-2 px-1 text-[12px] leading-snug text-[var(--error)]">
          <span>{error}</span>
          <button
            type="button"
            onClick={eligibility ? handleExport : checkEligibility}
            disabled={isExporting || isLoading}
            className="rounded font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
          >
            Try again
          </button>
        </p>
      )}
    </div>
  );
}
