import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import ClinicalReportAssignModal from './ClinicalReportAssignModal';

/**
 * Opens the clinical-report assignment modal (replaces one-click PDF download).
 * Gated on chat eligibility (same unlock as variant chat) plus job downloadGate.
 */
export default function CaseReportDownloadButton({
  conversationId,
  variantData,
  isGuest,
  downloadGate = null,
  chatEligibility = null,
}) {
  const [open, setOpen] = useState(false);

  const gateBlocked = downloadGate?.blocked === true;
  const chatReady = chatEligibility?.allowed === true;
  const chatPending = chatEligibility?.allowed == null;
  const chatBlocked = !chatReady;
  const blocked = gateBlocked || chatBlocked;

  if (isGuest) return null;
  if (!conversationId || !variantData) return null;

  const gateLabel = () => {
    if (downloadGate?.kind === 'enriching') return 'Report unlocks after enrichment…';
    if (downloadGate?.kind === 'busy') return 'Applying filter…';
    if (downloadGate?.kind === 'syncing') return 'Syncing latest state…';
    return 'Report unavailable while a job runs';
  };

  const chatLabel = () => {
    if (chatPending) return 'Checking chat eligibility…';
    if (chatEligibility?.reason === 'CHAT_REQUIRES_FILTER') {
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

  const label = gateBlocked ? gateLabel() : chatBlocked ? chatLabel() : 'Generate report';
  const title = gateBlocked
    ? downloadGate?.message || 'A job is still running'
    : chatBlocked
      ? chatEligibility?.message || 'Chat must be enabled before generating a report'
      : 'Assign variants and generate Geneie clinical report PDF';

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => {
          if (!blocked) setOpen(true);
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
      <ClinicalReportAssignModal
        open={open}
        onOpenChange={setOpen}
        conversationId={conversationId}
      />
    </div>
  );
}
