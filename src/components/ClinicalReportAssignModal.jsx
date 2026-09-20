import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  fetchClinicalReportCandidates,
  generateClinicalReport,
} from '@/services/backendApi';

const BUCKETS = {
  clinical_result: 'clinical_result',
  additional_finding: 'additional_finding',
  exclude: 'exclude',
};

/**
 * Assign working-set variants to Clinical result summary vs Additional Findings,
 * then generate the clinical PDF (bioinfo two-bucket contract).
 * Multi-primary clinical results and unrestricted additional findings are supported.
 */
export default function ClinicalReportAssignModal({
  open,
  onOpenChange,
  conversationId,
}) {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [assignments, setAssignments] = useState({});

  const load = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchClinicalReportCandidates(conversationId);
      setMeta(data);
      const rows = Array.isArray(data.candidates) ? data.candidates : [];
      setCandidates(rows);
      const next = {};
      rows.forEach((row) => {
        const suggested = row.suggested_bucket;
        if (suggested === 'clinical_result' || suggested === 'additional_finding') {
          next[row.id] = suggested;
        } else {
          next[row.id] = BUCKETS.exclude;
        }
      });
      setAssignments(next);
    } catch (err) {
      setError(err.message || 'Failed to load report candidates');
      setCandidates([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const clinicalIds = useMemo(
    () =>
      candidates
        .filter((c) => assignments[c.id] === BUCKETS.clinical_result)
        .map((c) => c.id),
    [candidates, assignments],
  );
  const additionalIds = useMemo(
    () =>
      candidates
        .filter((c) => assignments[c.id] === BUCKETS.additional_finding)
        .map((c) => c.id),
    [candidates, assignments],
  );

  const setBucket = (id, bucket) => {
    setAssignments((prev) => ({ ...prev, [id]: bucket }));
  };

  const canProceed =
    clinicalIds.length >= 1 && !generating && !loading;

  const handleProceed = async () => {
    if (!canProceed || !conversationId) return;
    setGenerating(true);
    setError(null);
    try {
      await generateClinicalReport(conversationId, {
        clinical_result_variant_ids: clinicalIds,
        additional_finding_variant_ids: additionalIds,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err.message || 'Report generation failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!max-w-3xl w-full max-h-[min(90vh,820px)] flex flex-col p-0 gap-0 overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface-raised)', borderColor: 'var(--border-default)' }}
      >
        <div className="flex-shrink-0 px-5 py-4 border-b border-[var(--border-subtle)]">
          <DialogTitle className="text-base font-semibold text-[var(--text-primary)]">
            Generate clinical report
          </DialogTitle>
          <DialogDescription className="text-xs text-[var(--text-secondary)] mt-1">
            Assign one or more variants to Clinical result summary, and optionally to Additional Findings.
            {meta?.workflow_display_name
              ? ` Workflow: ${meta.workflow_display_name}.`
              : ''}
            {typeof meta?.working_set_count === 'number'
              ? ` Working set: ${meta.working_set_count.toLocaleString()}.`
              : ''}
          </DialogDescription>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading candidates…
            </div>
          )}
          {!loading && candidates.length === 0 && !error && (
            <p className="text-sm text-[var(--text-secondary)] py-6 text-center">
              No variants available in the current working set.
            </p>
          )}
          {!loading &&
            candidates.map((row) => (
              <div
                key={row.id}
                className="rounded-lg border border-[var(--border-subtle)] px-3 py-2.5 space-y-2"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {row.gene || '—'}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)] font-mono">
                    {row.hgvs || row.id}
                  </span>
                </div>
                <div className="text-2xs text-[var(--text-tertiary)] flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>{row.classification || 'Classification n/a'}</span>
                  {row.disease ? <span>{row.disease}</span> : null}
                  {row.tier ? <span>{row.tier}</span> : null}
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  {[
                    [BUCKETS.clinical_result, 'Clinical result'],
                    [BUCKETS.additional_finding, 'Additional findings'],
                    [BUCKETS.exclude, 'Exclude'],
                  ].map(([value, label]) => (
                    <label
                      key={value}
                      className="inline-flex items-center gap-1.5 cursor-pointer text-[var(--text-secondary)]"
                    >
                      <input
                        type="radio"
                        name={`bucket-${row.id}`}
                        checked={assignments[row.id] === value}
                        onChange={() => setBucket(row.id, value)}
                        className="accent-[var(--accent-teal)]"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
        </div>

        <div className="flex-shrink-0 px-5 py-3 border-t border-[var(--border-subtle)] space-y-2">
          {error && (
            <p className="text-xs text-[var(--error)]" title={error}>
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-2xs text-[var(--text-tertiary)]">
              Clinical: {clinicalIds.length} · Additional: {additionalIds.length}
              {clinicalIds.length < 1 ? ' · Need ≥1 clinical result' : ''}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-9 px-3 rounded-lg text-xs border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canProceed}
                onClick={handleProceed}
                className={`h-9 px-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
                  canProceed
                    ? 'bg-[var(--accent-teal)] text-white hover:opacity-90'
                    : 'bg-[var(--bg-surface)] text-[var(--text-tertiary)] cursor-not-allowed border border-[var(--border-subtle)]'
                }`}
              >
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {generating ? 'Generating…' : 'Proceed'}
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
