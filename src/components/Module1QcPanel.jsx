import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ExternalLink, FileText, RotateCw, X } from 'lucide-react';
import { fetchModule1QcArtifacts } from '@/services/backendApi';
import { StageMark } from '@/components/motion';
import { Button } from '@/components/ui/button';
import { ViewHereButton, qcReportKind, qcReportName, useQcViewer } from '@/components/Module1QcViewer';

function kindLabel(kind) {
  if (kind === 'fastp') return 'fastp';
  if (kind === 'multiqc') return 'MultiQC';
  if (kind === 'fastqc') return 'FastQC';
  return 'QC';
}

/** Section heading shared by the three QC blocks, so they read as one document. */
export function QcHeading({ title, hint = null, trailing = null }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h4 className="text-[13px] font-semibold text-foreground">{title}</h4>
        {hint ? <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{hint}</p> : null}
      </div>
      {trailing}
    </div>
  );
}

/** Surface for a QC block: a hairline card in a workspace tab, plain content inside a job card. */
export const qcSurfaceClass = (surface) => (surface ? 'wb-card p-4' : '');

const QC_STATUS = {
  pass: { state: 'done', label: 'Pass', Icon: Check },
  warn: { state: 'pending', label: 'Warn', Icon: AlertTriangle },
  fail: { state: 'failed', label: 'Fail', Icon: X },
};

/** pass / warn / fail as a pill with an icon and the word, so the colour never carries it alone. */
export function QcStatusPill({ status, label, className = '' }) {
  const cfg = QC_STATUS[status];
  if (!cfg) return null;
  const warn = status === 'warn'
    ? '!border-transparent !bg-[var(--warning-soft)] !text-[var(--warning)]'
    : '';
  return (
    <span data-state={cfg.state} className={`wb-status wb-pop before:!hidden !pl-1.5 ${warn} ${className}`}>
      <cfg.Icon className="size-3" strokeWidth={2.4} aria-hidden />
      {label || cfg.label}
    </span>
  );
}

/** A failed load: what happened, with the one next action as a pill. */
export function QcErrorNotice({ message, onRetry, retryLabel = 'Retry' }) {
  return (
    <div role="alert" className="wb-rise flex items-start justify-between gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--error)_18%,transparent)] bg-[color-mix(in_srgb,var(--error)_6%,hsl(var(--wb-card)))] p-3">
      <p className="flex min-w-0 items-start gap-2 text-[13px] text-foreground">
        <StageMark state="failed" size={16} className="mt-0.5 shrink-0" />
        <span className="min-w-0 break-words">{message}</span>
      </p>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry} className="shrink-0 rounded-full">
          <RotateCw className="size-3.5" aria-hidden />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

/** Placeholder rows that match the final row height (no layout jump when content arrives). */
export function QcSkeleton({ rows = 1 }) {
  return (
    <div className="space-y-2" aria-hidden role="presentation">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="wb-shimmer h-10 rounded-full" />
      ))}
    </div>
  );
}

/**
 * QC reports for a Module 1 run while BAM/QC are still retained (pre–chat unlock).
 * Primary action opens the HTML report (fastp / MultiQC) in a new tab. Plain content: it
 * draws no surface of its own, so it sits in a card section or a workspace tab alike.
 */
const Module1QcPanel = ({ conversationId, hasQc, surface = false, runLabel = null }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [payload, setPayload] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!conversationId || !hasQc) {
      setPayload(null);
      setError(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await fetchModule1QcArtifacts(conversationId);
        if (!cancelled) setPayload(data);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Could not load QC reports.');
          setPayload(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, hasQc, attempt]);

  const sectionRef = useRef(null);
  const artifactsNow = Array.isArray(payload?.artifacts) ? payload.artifacts : [];
  const { openViewer, dialog } = useQcViewer({
    // The open report is kept by key, so a refetched payload (fresh presigned URL) reaches the frame.
    resolveUrl: (key) => (payload?.primary?.key === key ? payload.primary.url : artifactsNow.find((a) => a.key === key)?.url) || null,
    refetch: retry,
    loading,
    error,
    fallbackFocus: () => sectionRef.current?.querySelector('[role="alert"] button') || sectionRef.current,
  });

  if (!hasQc) return null;

  const primary = payload?.primary;
  const sample = runLabel || payload?.sample_name || null;
  const artifacts = Array.isArray(payload?.artifacts) ? payload.artifacts : [];
  const secondary = artifacts.filter((a) => a.key !== primary?.key && a.url);
  const empty = !loading && !error && !primary?.url && artifacts.length === 0;

  return (
    <section ref={sectionRef} tabIndex={-1} className={`space-y-2.5 outline-none ${qcSurfaceClass(surface)}`} aria-label="Module 1 quality control reports" aria-busy={loading || undefined}>
      <QcHeading
        title="Reports"
        hint="From this run. Available until chat unlocks."
        trailing={loading ? <StageMark state="running" size={16} className="shrink-0" /> : null}
      />

      {loading && !payload ? <QcSkeleton /> : null}

      {error && <QcErrorNotice message={error} onRetry={retry} />}

      {/* Kept mounted while the payload is refetched ("Refresh link" in the viewer), so the "View here" button keeps focus. */}
      {!error && primary?.url && (
        <div className="wb-qc-line wb-qc-pair">
          <a
            href={primary.url}
            target="_blank"
            rel="noopener noreferrer"
            className="wb-row wb-rise text-[13px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)]"
          >
            <FileText className="size-4 shrink-0 text-[hsl(var(--brand-500))]" aria-hidden />
            <span className="min-w-0 flex-1 truncate">Open {kindLabel(primary.kind)} report</span>
            <ExternalLink className="wb-chev size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </a>
          <ViewHereButton
            name={qcReportName(qcReportKind(primary.kind, primary.name))}
            onClick={() => openViewer({
              id: primary.key,
              kind: qcReportKind(primary.kind, primary.name),
              description: sample ? `Sample ${sample}` : 'From this run',
            })}
          />
        </div>
      )}

      {empty && (
        <p className="text-[13px] text-muted-foreground">
          {payload?.message || 'No QC files yet. They appear here once the run has produced them.'}
        </p>
      )}

      {secondary.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {secondary.map((file) => (
            <li key={file.key} className="min-w-0">
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="wb-chip max-w-full gap-1.5 outline-none transition-colors hover:!border-[hsl(var(--brand-300))] hover:!bg-[hsl(var(--brand-50))] hover:text-[hsl(var(--brand-700))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)]"
              >
                <span className="truncate font-mono">{file.name}</span>
                <ExternalLink className="size-3 shrink-0" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </section>
  );
};

export default Module1QcPanel;
