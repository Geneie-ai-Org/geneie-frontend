import React from 'react';
import { FileText } from 'lucide-react';

/**
 * Same unlock rules as variant chat + job downloadGate.
 * Shared by the sidebar button and the Automatic pipeline banner CTA.
 */
export function getClinicalReportGate({
  downloadGate = null,
  chatEligibility = null,
  gaTriageStatus = '',
} = {}) {
  const gateBlocked = downloadGate?.blocked === true;
  const scope = (chatEligibility?.scope || '').toLowerCase();
  // PGx-only chat does not unlock the clinical disease report.
  const chatReady = chatEligibility?.allowed === true && scope !== 'pgx_only';
  const chatPending = chatEligibility?.allowed == null;
  const chatBlocked = !chatReady;
  const ga = String(gaTriageStatus || '').toLowerCase();
  const gaInFlight = ga === 'running' || ga === 'pending' || ga === 'queued';
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
    if (gaInFlight) return 'Waiting for GA…';
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

  // While GA runs, allow opening the modal for manual Include (title promised this).
  const blocked = gateBlocked || (chatBlocked && !gaInFlight && ga !== 'failed');
  let label = gateBlocked ? gateLabel() : chatBlocked ? chatLabel() : 'Review & report';
  let title = gateBlocked
    ? downloadGate?.message || 'A job is still running'
    : chatBlocked
    ? gaInFlight
      ? 'GA ranking is still running. You can open and assign Include manually, or wait for pre-checked picks.'
      : scope === 'pgx_only' && filterAlreadyApplied
      ? 'Filter is applied — waiting for GA / chat unlock before the disease report is ready.'
      : scope === 'pgx_only'
      ? 'PGx chat is open — apply ACMG or a phenotype filter to unlock the clinical report.'
      : chatEligibility?.message || 'Chat must be enabled before generating a report'
    : 'Review GA Include picks, edit if needed, then generate the PDF';
  if (gaInFlight) {
    label = 'Waiting for GA…';
    title =
      'Ranking is still running. Open to assign manually, or wait and reopen for pre-checked Include.';
  } else if (!gateBlocked && ga === 'failed') {
    label = 'Generate report';
    title = 'GA failed — assign Include manually, then generate the PDF';
  }

  return { blocked, label, title };
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
  onRequestOpen,
}) {
  const { blocked, label, title } = getClinicalReportGate({
    downloadGate,
    chatEligibility,
    gaTriageStatus,
  });

  if (isGuest) return null;
  if (!conversationId || !variantData) return null;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => {
          if (!blocked && typeof onRequestOpen === 'function') onRequestOpen();
        }}
        disabled={blocked}
        title={title}
        className={`w-full min-h-9 px-2.5 py-2 rounded-lg inline-flex items-center justify-center gap-2 text-xs font-medium text-center leading-snug border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-sidebar)] ${
          !blocked
            ? 'border-[var(--border-subtle)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]'
            : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-tertiary)] cursor-not-allowed'
        }`}
      >
        <FileText className="w-3.5 h-3.5 shrink-0" />
        <span className="min-w-0">{label}</span>
      </button>
    </div>
  );
}
