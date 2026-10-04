import React, { useEffect, useState } from 'react';
import { ExternalLink, FileText, Loader2 } from 'lucide-react';
import { fetchModule1QcArtifacts } from '@/services/backendApi';

function kindLabel(kind) {
  if (kind === 'fastp') return 'fastp';
  if (kind === 'multiqc') return 'MultiQC';
  if (kind === 'fastqc') return 'FastQC';
  return 'QC';
}

/**
 * QC reports for a Module 1 run while BAM/QC are still retained (pre–chat unlock).
 * Primary action opens the HTML report (fastp / MultiQC) in a new tab.
 */
const Module1QcPanel = ({ conversationId, hasQc }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [payload, setPayload] = useState(null);

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
  }, [conversationId, hasQc]);

  if (!hasQc) return null;

  const primary = payload?.primary;
  const artifacts = Array.isArray(payload?.artifacts) ? payload.artifacts : [];
  const secondary = artifacts.filter((a) => a.key !== primary?.key && a.url);

  return (
    <div
      className="mt-3 p-3 rounded-lg border"
      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
      aria-label="Module 1 quality control reports"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            Quality control
          </p>
          <p className="text-2xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Reports from this run. Available until chat unlocks.
          </p>
        </div>
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" style={{ color: 'var(--text-tertiary)' }} />}
      </div>

      {error && (
        <p className="text-2xs mt-2" style={{ color: 'var(--error)' }}>
          {error}
        </p>
      )}

      {!loading && !error && primary?.url && (
        <a
          href={primary.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium"
          style={{ color: 'var(--accent-teal)' }}
        >
          <FileText className="w-3.5 h-3.5" />
          Open {kindLabel(primary.kind)} report
          <ExternalLink className="w-3 h-3" />
        </a>
      )}

      {!loading && !error && !primary?.url && artifacts.length === 0 && (
        <p className="text-2xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
          {payload?.message || 'No QC files found yet.'}
        </p>
      )}

      {secondary.length > 0 && (
        <ul className="mt-2 space-y-1">
          {secondary.map((file) => (
            <li key={file.key}>
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-2xs inline-flex items-center gap-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                {file.name}
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Module1QcPanel;
