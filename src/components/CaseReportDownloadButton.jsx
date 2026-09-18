import React, { useState, useCallback } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { downloadCaseReport } from '@/services/backendApi';

/**
 * Download a branded Geneie case report PDF for the active conversation.
 * Uses GET /api/case-report/{conversationId}.pdf (Bearer).
 */
export default function CaseReportDownloadButton({
  conversationId,
  variantData,
  isGuest,
  downloadGate = null,
}) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState(null);

  const gateBlocked = downloadGate?.blocked === true;

  const handleDownload = useCallback(async () => {
    if (!conversationId || isDownloading || gateBlocked) return;
    setIsDownloading(true);
    setError(null);
    try {
      await downloadCaseReport(conversationId);
    } catch (err) {
      setError(err.message || 'Case report download failed');
    } finally {
      setIsDownloading(false);
    }
  }, [conversationId, isDownloading, gateBlocked]);

  if (isGuest) return null;
  if (!conversationId || !variantData) return null;

  const gateLabel = () => {
    if (downloadGate?.kind === 'enriching') return 'Report unlocks after enrichment…';
    if (downloadGate?.kind === 'busy') return 'Applying filter…';
    if (downloadGate?.kind === 'syncing') return 'Syncing latest state…';
    return 'Report unavailable while a job runs';
  };

  const label = isDownloading
    ? 'Preparing report…'
    : gateBlocked
      ? gateLabel()
      : 'Download report';

  const title = gateBlocked
    ? downloadGate?.message || 'A job is still running'
    : 'Download Geneie case report PDF';

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={handleDownload}
        disabled={gateBlocked || isDownloading}
        title={title}
        className={`w-full h-9 rounded-lg flex items-center justify-center gap-2 text-xs font-medium whitespace-nowrap border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-sidebar)] ${
          !gateBlocked && !isDownloading
            ? 'border-[var(--border-subtle)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]'
            : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-tertiary)] cursor-not-allowed'
        }`}
      >
        {isDownloading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <FileText className="w-3.5 h-3.5" />
        )}
        {label}
      </button>
      {error && (
        <p className="text-2xs text-[var(--error)] truncate" title={error}>
          {error}
        </p>
      )}
    </div>
  );
}
