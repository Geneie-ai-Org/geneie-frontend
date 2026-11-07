import React, { useEffect, useState } from 'react';
import { ExternalLink, FileText, Loader2 } from 'lucide-react';
import { fetchModule1QcReport } from '@/services/backendApi';

/**
 * Durable Module 1 QC interpretation + charts/snapshots after BAM/QC purge.
 * Chat answers from the same saved report.
 *
 * While the live alignment browser is still available (`hideBrowserSnapshots`),
 * omit PNG browser captures so they are not mistaken for an interactive view.
 */
const Module1QcReportPanel = ({ conversationId, visible, hideBrowserSnapshots = false }) => {
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

  const figures = Array.isArray(report?.artifacts?.figures) ? report.artifacts.figures : [];
  const imageFigs = figures
    .filter(
      (f) =>
        f?.url &&
        (f.kind === 'metrics_chart' ||
          f.kind === 'quality_curve' ||
          f.kind === 'coverage_plot' ||
          f.kind === 'browser_snapshot' ||
          (f.content_type || '').startsWith('image/') ||
          (f.content_type || '').includes('svg'))
    )
    .filter((f) => !(hideBrowserSnapshots && f.kind === 'browser_snapshot'))
    // Coverage + metrics first; browser PNG last so a frozen chrome shot never looks like the live viewer.
    .sort((a, b) => {
      const rank = (f) => {
        if (f.kind === 'coverage_plot') return 0;
        if (f.kind === 'metrics_chart') return 1;
        if (f.kind === 'browser_snapshot') return 3;
        return 2;
      };
      return rank(a) - rank(b);
    });
  const htmlFigs = figures.filter((f) => f?.url && f.kind === 'html_report');
  const figureCaption = (fig) => {
    if (fig.kind === 'browser_snapshot') {
      return `${fig.label || 'Alignment browser'} · static snapshot (not interactive)`;
    }
    if (fig.kind === 'coverage_plot') {
      return fig.label || 'Coverage (HsMetrics)';
    }
    return fig.label || fig.name;
  };
  const htmlCaption = (fig) => {
    const role = fig.role || '';
    if (role === 'fastqc_raw_html' || (fig.label || '').toLowerCase().includes('fastqc (raw')) {
      return fig.label || `FastQC (raw reads) · ${fig.name || 'report'}`;
    }
    if (role === 'fastqc_html' || (fig.label || '').toLowerCase().includes('fastqc')) {
      return fig.label || `FastQC · ${fig.name || 'report'}`;
    }
    return fig.label || fig.name || 'QC HTML report';
  };

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
        Text, coverage (HsMetrics), FastQC raw, charts, and alignment snapshots kept after BAM/QC
        cleanup — ask in chat anytime.
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

      {imageFigs.length > 0 && (
        <div className="mt-3 space-y-3">
          {imageFigs.map((fig) => {
            const isSnapshot = fig.kind === 'browser_snapshot';
            return (
              <figure key={fig.s3_key || fig.name} className="m-0">
                <figcaption className="text-2xs mb-1" style={{ color: 'var(--text-tertiary)' }}>
                  {figureCaption(fig)}
                </figcaption>
                <a href={fig.url} target="_blank" rel="noopener noreferrer" className="block">
                  <img
                    src={fig.url}
                    alt={
                      isSnapshot
                        ? 'Static alignment browser snapshot (not interactive)'
                        : fig.label || fig.name || 'QC figure'
                    }
                    className="w-full rounded-md border"
                    style={{
                      borderColor: 'var(--border-subtle)',
                      backgroundColor: '#fff',
                      // Discourage treating the PNG as a live genome browser.
                      ...(isSnapshot ? { pointerEvents: 'none' } : null),
                    }}
                    draggable={false}
                  />
                </a>
              </figure>
            );
          })}
        </div>
      )}

      {htmlFigs.length > 0 && (
        <ul className="mt-2 space-y-1" aria-label="Saved QC HTML including FastQC raw">
          {htmlFigs.map((fig) => (
            <li key={fig.s3_key || fig.name}>
              <a
                href={fig.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-2xs inline-flex items-center gap-1"
                style={{ color: 'var(--accent-teal)' }}
              >
                Open {htmlCaption(fig)}
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Module1QcReportPanel;
