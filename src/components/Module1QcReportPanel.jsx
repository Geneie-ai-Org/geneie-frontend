import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { fetchModule1QcReport } from '@/services/backendApi';
import { StageMark } from '@/components/motion';
import { QcErrorNotice, QcHeading, QcSkeleton, QcStatusPill, qcSurfaceClass } from '@/components/Module1QcPanel';
import { ViewHereButton, qcReportKind, qcReportName, useQcViewer } from '@/components/Module1QcViewer';

/** "multiqc_report.html" -> "MultiQC report"; an unknown tool keeps its own label. */
function htmlName(fig) {
  const kind = qcReportKind(fig.label, fig.name, fig.s3_key);
  return kind === 'qc' ? (fig.label || fig.name || 'QC report') : qcReportName(kind);
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const fmtInt = (v) => (isNum(v) ? Math.round(v).toLocaleString() : null);
const fmtPct = (v, digits = 1) => (isNum(v) ? `${(v * 100).toFixed(digits)}%` : null);

/**
 * Q30 grading uses the backend's own cut-offs (module1_qc_report.narrative_from_metrics:
 * >= 90% strong, >= 80% acceptable, otherwise concerning), so the chip can never disagree with
 * the saved narrative. Other metrics have no backend verdict, so they get no chip.
 */
function q30Verdict(q30) {
  if (!isNum(q30)) return null;
  if (q30 >= 0.9) return { status: 'pass', label: 'Pass' };
  if (q30 >= 0.8) return { status: 'warn', label: 'Warn' };
  return { status: 'fail', label: 'Fail' };
}

/** Rows for the definition grid, only for metrics the report actually carries. */
export function buildQcMetricRows(metrics) {
  const m = metrics && typeof metrics === 'object' ? metrics : {};
  const rows = [];
  const before = fmtInt(m.total_reads_before);
  const after = fmtInt(m.total_reads_after);
  if (before && after) {
    rows.push({
      key: 'reads',
      label: 'Reads kept',
      value: `${after} of ${before}`,
      detail: fmtPct(m.pass_rate),
    });
  }
  const q30 = fmtPct(m.q30_rate_after);
  if (q30) rows.push({ key: 'q30', label: 'Q30 after filtering', value: q30, verdict: q30Verdict(m.q30_rate_after) });
  const q30Before = fmtPct(m.q30_rate_before);
  if (q30Before) rows.push({ key: 'q30b', label: 'Q30 before filtering', value: q30Before });
  const gc = fmtPct(m.gc_content_after);
  if (gc) rows.push({ key: 'gc', label: 'GC content', value: gc });
  [
    ['low_quality_reads', 'Low quality reads'],
    ['too_short_reads', 'Too short reads'],
    ['adapter_trimmed_reads', 'Adapter trimmed reads'],
    ['too_many_N_reads', 'Too many N reads'],
  ].forEach(([key, label]) => {
    const v = fmtInt(m[key]);
    if (v != null) rows.push({ key, label, value: v });
  });
  return rows;
}

/** Definition grid: label left, tabular figure right, optional verdict chip with text. */
function MetricGrid({ rows }) {
  if (rows.length === 0) return null;
  return (
    <dl className="m-0 divide-y divide-[hsl(var(--wb-line))] overflow-hidden rounded-2xl border border-[hsl(var(--wb-line))]">
      {rows.map((row) => (
        <div key={row.key} className="flex min-h-10 items-center gap-3 px-3.5 py-1.5">
          <dt className="min-w-0 flex-1 text-[13px] text-muted-foreground">{row.label}</dt>
          <dd className="m-0 flex shrink-0 items-center gap-2 text-[13px] font-medium tabular-nums text-foreground">
            {row.value}
            {row.detail ? <span className="font-normal text-muted-foreground">({row.detail})</span> : null}
            {row.verdict ? <QcStatusPill status={row.verdict.status} label={row.verdict.label} /> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Durable Module 1 QC interpretation + charts/snapshots after BAM/QC purge.
 * Chat answers from the same saved report.
 *
 * `nativeCharts`: the interactive read-quality view is shown above, so the saved metric grid and the
 * static chart images (same numbers) are left out. Narrative, HTML reports and snapshots stay.
 *
 * While the live alignment browser is still available (`hideBrowserSnapshots`),
 * omit PNG browser captures so they are not mistaken for an interactive view.
 *
 * Plain content (no surface of its own): it fills a card section or a workspace tab.
 */
const Module1QcReportPanel = ({ conversationId, visible, hideBrowserSnapshots = false, surface = false, runLabel = null, nativeCharts = false }) => {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

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
  }, [conversationId, visible, attempt]);

  const sectionRef = useRef(null);
  const figId = (f) => f.s3_key || f.name;
  const { openViewer, dialog } = useQcViewer({
    // The open report is kept by id, so a refetched report (fresh presigned URL) reaches the frame.
    resolveUrl: (id) => (Array.isArray(report?.artifacts?.figures) ? report.artifacts.figures : []).find((f) => f?.kind === 'html_report' && figId(f) === id)?.url || null,
    refetch: retry,
    loading,
    error,
    fallbackFocus: () => sectionRef.current?.querySelector('[role="alert"] button') || sectionRef.current,
  });

  if (!visible) return null;
  if (!loading && !report && !error) return null;

  const figures = Array.isArray(report?.artifacts?.figures) ? report.artifacts.figures : [];
  const imageFigs = figures
    .filter(
      (f) =>
        f?.url &&
        (f.kind === 'metrics_chart' ||
          f.kind === 'quality_curve' ||
          f.kind === 'browser_snapshot' ||
          (f.content_type || '').startsWith('image/'))
    )
    .filter((f) => !(hideBrowserSnapshots && f.kind === 'browser_snapshot'))
    // The native read-quality view (interactive, same fastp numbers) replaces the static chart images.
    .filter((f) => !(nativeCharts && (f.kind === 'metrics_chart' || f.kind === 'quality_curve')))
    // Charts first; browser PNG last so a frozen chrome shot never looks like the live viewer.
    .sort((a, b) => {
      const rank = (f) => (f.kind === 'browser_snapshot' ? 2 : f.kind === 'metrics_chart' ? 0 : 1);
      return rank(a) - rank(b);
    });
  const htmlFigs = figures.filter((f) => f?.url && f.kind === 'html_report');
  const metricRows = nativeCharts ? [] : buildQcMetricRows(report?.metrics);

  return (
    <section ref={sectionRef} tabIndex={-1} className={`space-y-3 outline-none ${qcSurfaceClass(surface)}`} aria-label="Saved Module 1 QC report" aria-busy={loading || undefined}>
      <QcHeading
        title="Saved QC report"
        hint="Kept after BAM and QC cleanup. Ask about it in chat any time."
        trailing={loading ? <StageMark state="running" size={16} className="shrink-0" /> : null}
      />

      {loading && !report ? <QcSkeleton rows={4} /> : null}

      {error && <QcErrorNotice message={error} onRetry={retry} />}

      <MetricGrid rows={metricRows} />

      {report?.summary_text && (
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-[var(--text-secondary)]">{report.summary_text}</p>
      )}

      {imageFigs.length > 0 && (
        <div className="space-y-3">
          {imageFigs.map((fig) => {
            const isSnapshot = fig.kind === 'browser_snapshot';
            return (
              <figure key={fig.s3_key || fig.name} className="m-0">
                <figcaption className="mb-1.5 px-1 text-xs text-muted-foreground">
                  {isSnapshot
                    ? `${fig.label || 'Alignment browser'} · static snapshot (not interactive)`
                    : fig.label || fig.name}
                </figcaption>
                <a href={fig.url} target="_blank" rel="noopener noreferrer" className="block">
                  {/* bg-white is deliberate in both themes: the chart PNGs are drawn for a white page,
                    * and a transparent one would otherwise disappear into the dark surface. */}
                  <img
                    src={fig.url}
                    alt={
                      isSnapshot
                        ? 'Static alignment browser snapshot (not interactive)'
                        : fig.label || fig.name || 'QC figure'
                    }
                    className="w-full rounded-2xl border border-[hsl(var(--wb-line))] bg-white"
                    // Discourage treating the PNG as a live genome browser.
                    style={isSnapshot ? { pointerEvents: 'none' } : undefined}
                    draggable={false}
                  />
                </a>
              </figure>
            );
          })}
        </div>
      )}

      {htmlFigs.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {htmlFigs.map((fig) => (
            <li key={fig.s3_key || fig.name} className="wb-qc-pair flex min-w-0 items-center gap-1.5">
              <a
                href={fig.url}
                target="_blank"
                rel="noopener noreferrer"
                className="wb-chip max-w-full gap-1.5 font-medium outline-none transition-colors hover:!border-[hsl(var(--brand-300))] hover:!bg-[hsl(var(--brand-50))] hover:text-[hsl(var(--brand-700))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)]"
              >
                <span className="truncate">Open {fig.label || fig.name}</span>
                <ExternalLink className="size-3 shrink-0" aria-hidden />
              </a>
              <ViewHereButton
                name={htmlName(fig)}
                onClick={() => openViewer({
                  id: figId(fig),
                  kind: qcReportKind(fig.label, fig.name, fig.s3_key),
                  name: htmlName(fig),
                  description: (runLabel || report?.sample_name) ? `Sample ${runLabel || report.sample_name}` : 'Saved with this run',
                })}
              />
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </section>
  );
};

export default Module1QcReportPanel;
