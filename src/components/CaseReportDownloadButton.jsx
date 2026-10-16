import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import RunTimer from '@/components/ui/RunTimer';
import { useRunTimer } from '@/hooks/useRunTimer';
import CaseReportPreviewDialog from '@/components/workspace/CaseReportPreviewDialog';

/**
 * Same unlock rules as variant chat + job downloadGate.
 * Shared by the sidebar button and the Automatic pipeline banner CTA.
 */
const GA_STALL_MS = 15 * 60 * 1000;

export function getClinicalReportGate({
  downloadGate = null,
  chatEligibility = null,
  gaTriageStatus = '',
  gaStartedAt = null,
} = {}) {
  const gateBlocked = downloadGate?.blocked === true;
  const scope = (chatEligibility?.scope || '').toLowerCase();
  // PGx-only chat does not unlock the clinical disease report.
  const chatReady = chatEligibility?.allowed === true && scope !== 'pgx_only';
  const chatPending = chatEligibility?.allowed == null;
  const chatBlocked = !chatReady;
  const ga = String(gaTriageStatus || '').toLowerCase();
  const gaInFlight = ga === 'running' || ga === 'pending' || ga === 'queued';
  // A GA job that never finishes must not lock the report forever: past this, manual picks open up.
  const gaStartedMs = gaStartedAt ? Date.parse(gaStartedAt) : NaN;
  const gaStalled =
    gaInFlight && Number.isFinite(gaStartedMs) && Date.now() - gaStartedMs > GA_STALL_MS;
  // Filter already applied (phenotype/ACMG) — do not keep nagging "Apply filter…"
  // while disease chat is still pgx_only (common while GA / advanced-chat index runs).
  const filterAlreadyApplied =
    Number(chatEligibility?.filtered_variant_count ?? chatEligibility?.filteredVariantCount) >
      0 ||
    Number(
      chatEligibility?.variants_under_consideration ??
        chatEligibility?.variantsUnderConsideration
    ) > 0 ||
    Boolean(
      chatEligibility?.active_proprietary_filter ||
        chatEligibility?.activeProprietaryFilter
    );

  // Keep button labels short (sidebar is narrow). Put the full reason in `title`.
  const gateLabel = () => {
    if (downloadGate?.kind === 'enriching') return 'Waiting for enrichment…';
    if (downloadGate?.kind === 'busy') return 'Applying filter…';
    if (downloadGate?.kind === 'syncing') return 'Syncing…';
    return 'Report unavailable';
  };

  const chatLabel = () => {
    if (chatPending) return 'Checking eligibility…';
    if (scope === 'pgx_only' && filterAlreadyApplied) {
      return 'Waiting for report unlock…';
    }
    if (scope === 'pgx_only') {
      return 'Apply filter for report';
    }
    if (chatEligibility?.reason === 'CHAT_REQUIRES_FILTER' || chatEligibility?.reason === 'PGX_ONLY') {
      return filterAlreadyApplied ? 'Waiting for report unlock…' : 'Apply filter for report';
    }
    if (chatEligibility?.reason === 'S3_LINE_COUNT_PENDING') {
      return 'Counting variants…';
    }
    if (chatEligibility?.reason === 'FILTER_JOB_RUNNING') {
      return 'Waiting for filter…';
    }
    return 'Report locked';
  };

  // Locked while GA ranks so the report is always reviewed against the finished ranking.
  // The status line under the button says why and for how long.
  const blocked =
    gateBlocked || (gaInFlight && !gaStalled) || (chatBlocked && !gaInFlight && ga !== 'failed');
  let label = gateBlocked
    ? gateLabel()
    : chatBlocked && !gaInFlight
      ? chatLabel()
      : 'Review & report';
  let title = gateBlocked
    ? downloadGate?.message || 'A job is still running'
    : chatBlocked && !gaInFlight
      ? scope === 'pgx_only' && filterAlreadyApplied
        ? 'Filter is applied — waiting for GA / chat unlock before the disease report is ready.'
        : scope === 'pgx_only'
          ? 'PGx chat is open — apply ACMG or a phenotype filter to unlock the clinical report.'
          : chatEligibility?.message || 'Chat must be enabled before generating a report'
      : 'Review GA Include picks, edit if needed, then generate the PDF';
  if (gaStalled && !gateBlocked) {
    label = 'Review & report';
    title = 'Ranking is taking longer than usual — open the report to pick variants manually.';
  } else if (gaInFlight && !gateBlocked) {
    label = 'Review & report';
    title = 'Ranking variants — you can open the report when ranking finishes.';
  } else if (!gateBlocked && ga === 'failed') {
    label = 'Generate report';
    title = 'GA failed — assign Include manually, then generate the PDF';
  }

  return { blocked, label, title, gaInFlight: gaInFlight && !gateBlocked, gaStalled };
}

/**
 * Opens the clinical-report assignment modal (replaces one-click PDF download).
 * Gated on chat eligibility (same unlock as variant chat) plus job downloadGate.
 * Modal itself is owned by ChatPage so Automatic banner can open it when the sidebar is closed.
 */
export default function CaseReportDownloadButton({
  conversationId,
  variantData,
  isGuest,
  downloadGate = null,
  chatEligibility = null,
  gaTriageStatus = '',
  gaTriageUpdatedAt = null,
  onRequestOpen,
  /** The host already shows the chat-eligibility sentence once; do not repeat it under the button. */
  hideEligibilityReason = false,
  /** Phone-width footers: a blocked button reads just "Report" (the reason is written under it). */
  compact = false,
}) {
  const { blocked, label, title, gaInFlight, gaStalled } = getClinicalReportGate({
    downloadGate,
    chatEligibility,
    gaTriageStatus,
    gaStartedAt: gaTriageUpdatedAt,
  });
  const ga = String(gaTriageStatus || '').toLowerCase();
  const [previewOpen, setPreviewOpen] = useState(false);
  const gaTimer = useRunTimer(
    conversationId ? `${conversationId}:ga-triage` : null,
    gaInFlight,
    gaInFlight ? { startedAt: gaTriageUpdatedAt } : {}
  );

  if (isGuest) return null;
  if (!conversationId || !variantData) return null;

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          if (!blocked && typeof onRequestOpen === 'function') onRequestOpen();
        }}
        disabled={blocked}
        title={title}
        className="h-9 w-full justify-start gap-1.5 px-3.5 text-[13px] [@media(pointer:coarse)]:h-11"
      >
        <FileText aria-hidden />
        <span className="min-w-0 truncate">{compact && blocked && !gaInFlight ? 'Report' : label}</span>
      </Button>
      {/* Read the one-page case report (HTML or PDF) in a viewer. Only offered once the report is unlocked. */}
      {!blocked && (
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setPreviewOpen(true)}
            title="Read the one-page case report here, as a document or the PDF"
            className="h-8 w-full justify-start gap-1.5 px-3.5 text-[12px] text-muted-foreground [@media(pointer:coarse)]:h-11"
          >
            <Eye aria-hidden />
            <span className="min-w-0 truncate">Preview 1-page summary</span>
          </Button>
          <CaseReportPreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} conversationId={conversationId} />
        </>
      )}
      {/* Why the button is locked is shown as text, not only in a tooltip. */}
      {blocked && !gaInFlight && title && !(hideEligibilityReason && title === chatEligibility?.message) && (
        <p className="wb-rise line-clamp-3 px-1 text-[12px] leading-snug text-muted-foreground" title={title}>{title}</p>
      )}
      {/* Ranking status sits beside the button, not as a spinner inside it: the line says
        * what's running, for how long, and what waiting buys. */}
      {gaInFlight && (
        <div className="wb-rise px-1 text-[12px] leading-snug text-muted-foreground" aria-live="polite">
          <div className="flex items-center gap-1.5 text-foreground">
            <span aria-hidden className="inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-[var(--info)] motion-reduce:animate-none" />
            <span>Ranking variants</span>
            <RunTimer running elapsedMs={gaTimer.elapsedMs} startMs={gaTimer.startMs} prefix="· " />
          </div>
          <p className="mt-0.5">
            {gaStalled
              ? 'Taking longer than usual. You can open the report and pick variants manually.'
              : 'You can open the report when it finishes, with top picks pre-checked.'}
          </p>
        </div>
      )}
      {!gaInFlight && ga === 'completed' && (
        <p className="wb-rise inline-flex items-center gap-1.5 px-1 text-[12px] text-muted-foreground">
          <CheckCircle2 className="size-3 shrink-0 text-[var(--success)]" aria-hidden />
          Ranked. Top picks are pre-checked.
        </p>
      )}
      {!gaInFlight && ga === 'failed' && (
        <p role="status" className="wb-rise inline-flex items-center gap-1.5 px-1 text-[12px] text-[var(--error)]">
          <AlertCircle className="size-3 shrink-0" aria-hidden />
          Ranking failed. You can still pick variants manually.
        </p>
      )}
    </div>
  );
}
