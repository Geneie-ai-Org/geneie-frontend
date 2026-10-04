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
  const blocked = gateBlocked || chatBlocked;
  const ga = String(gaTriageStatus || '').toLowerCase();

  const gateLabel = () => {
    if (downloadGate?.kind === 'enriching') return 'Report unlocks after enrichment…';
    if (downloadGate?.kind === 'busy') return 'Applying filter…';
    if (downloadGate?.kind === 'syncing') return 'Syncing latest state…';
    return 'Report unavailable while a job runs';
  };

  const chatLabel = () => {
    if (chatPending) return 'Checking chat eligibility…';
    if (scope === 'pgx_only') {
      return 'PGx chat is open — apply ACMG or phenotype filter for the clinical report…';
    }
    if (chatEligibility?.reason === 'CHAT_REQUIRES_FILTER' || chatEligibility?.reason === 'PGX_ONLY') {
      return 'Report unlocks when chat unlocks (apply a filter)…';
    }
    if (chatEligibility?.reason === 'S3_LINE_COUNT_PENDING') {
      return 'Counting variants…';
    }
    if (chatEligibility?.reason === 'FILTER_JOB_RUNNING') {
      return 'Waiting for filter job…';
    }
    return chatEligibility?.message || 'Report unlocks when chat is enabled';
  };

  let label = gateBlocked ? gateLabel() : chatBlocked ? chatLabel() : 'Review & report';
  let title = gateBlocked
    ? downloadGate?.message || 'A job is still running'
    : chatBlocked
    ? chatEligibility?.message || 'Chat must be enabled before generating a report'
    : 'Review GA Include picks, edit if needed, then generate the PDF';
  if (!blocked && (ga === 'running' || ga === 'pending' || ga === 'queued')) {
    label = 'Waiting for GA…';
    title = 'Ranking is still running. Open to assign manually, or wait and reopen for pre-checked Include.';
  } else if (!blocked && ga === 'failed') {
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
        className={`w-full h-9 rounded-lg flex items-center justify-center gap-2 text-xs font-medium whitespace-nowrap border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-sidebar)] ${
          !blocked
            ? 'border-[var(--border-subtle)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]'
            : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-tertiary)] cursor-not-allowed'
        }`}
      >
        <FileText className="w-3.5 h-3.5" />
        {label}
      </button>
    </div>
  );
}
