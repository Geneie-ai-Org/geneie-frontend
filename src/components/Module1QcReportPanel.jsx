import React, { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { fetchModule1QcReport } from '@/services/backendApi';

/**
 * Durable Module 1 QC interpretation after BAM/QC purge.
 * Chat can also answer from the same saved report.
 */
const Module1QcReportPanel = ({ conversationId, visible }) => {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!conversationId || !visible) {
      setReport(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await fetchModule1QcReport(conversationId);
        if (!cancelled) setReport(data?.has_report ? data.report : null);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Could not load saved QC report.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, visible]);

  if (!visible) return null;
  if (!loading && !report && !error) return null;

  return (
    <div
      className="mt-3 p-3 rounded-lg border"
      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
      aria-label="Saved Module 1 QC report"
    >
      <div className="flex items-center gap-2">
        <FileText className="w-3.5 h-3.5" style={{ color: 'var(--accent-teal)' }} />
        <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
          Saved QC report
        </p>
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--text-tertiary)' }} />}
      </div>
      <p className="text-2xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
        Kept after BAM/QC cleanup — ask about QC in chat anytime.
      </p>
      {error && (
        <p className="text-2xs mt-2" style={{ color: 'var(--error)' }}>
          {error}
        </p>
      )}
      {report?.summary_text && (
        <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {report.summary_text}
        </p>
      )}
    </div>
  );
};

export default Module1QcReportPanel;
