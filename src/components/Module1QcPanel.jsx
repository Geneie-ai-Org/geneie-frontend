import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, FileText, Loader2, RotateCw } from 'lucide-react';
import { fetchModule1QcArtifacts } from '@/services/backendApi';

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
        <h4 className="text-xs font-semibold text-foreground">{title}</h4>
        {hint ? <p className="mt-0.5 text-2xs text-muted-foreground">{hint}</p> : null}
      </div>
      {trailing}
    </div>
  );
}

/**
 * QC reports for a Module 1 run while BAM/QC are still retained (pre–chat unlock).
 * Primary action opens the HTML report (fastp / MultiQC) in a new tab. Plain content: it
 * draws no surface of its own, so it sits in a card section or a workspace tab alike.
 */
const Module1QcPanel = ({ conversationId, hasQc }) => {
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

  if (!hasQc) return null;

  const primary = payload?.primary;
  const artifacts = Array.isArray(payload?.artifacts) ? payload.artifacts : [];
  const secondary = artifacts.filter((a) => a.key !== primary?.key && a.url);
  const empty = !loading && !error && !primary?.url && artifacts.length === 0;

  return (
    <section className="space-y-2.5" aria-label="Module 1 quality control reports">
      <QcHeading
        title="Reports"
        hint="From this run. Available until chat unlocks."
        trailing={loading ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden /> : null}
      />

      {loading && !payload ? (
        <div className="space-y-2" aria-hidden>
          <div className="h-9 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        </div>
      ) : null}

      {error && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-[var(--error)] bg-[var(--error-soft)] p-2.5">
          <p className="min-w-0 text-xs text-foreground">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 text-2xs font-medium text-foreground hover:bg-muted"
          >
            <RotateCw className="h-3 w-3" aria-hidden />
            Retry
          </button>
        </div>
      )}

      {!loading && !error && primary?.url && (
        <a
          href={primary.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/55"
        >
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate">Open {kindLabel(primary.kind)} report</span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </a>
      )}

      {empty && (
        <p className="text-xs text-muted-foreground">
          {payload?.message || 'No QC files yet. They appear here once the run has produced them.'}
        </p>
      )}

      {secondary.length > 0 && (
        <ul className="m-0 list-none space-y-0.5 p-0">
          {secondary.map((file) => (
            <li key={file.key}>
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-8 items-center gap-1.5 text-xs text-[var(--text-secondary)] underline-offset-2 hover:text-foreground hover:underline"
              >
                <span className="truncate font-mono">{file.name}</span>
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default Module1QcPanel;
