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

const INCLUDE = 'clinical_result';
const ADDITIONAL = 'additional_finding';

function rowKeyOf(row, index) {
  return row.row_key || `${row.id || 'row'}__${index}`;
}

/**
 * Slim assignment modal: variant id + Include / Additional only.
 * Unselected rows are excluded by default. Sorted by BE (persona workflow rules).
 * Assignments are keyed by unique row_key so duplicate variant ids don't steal clicks.
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
      setAssignments({});
    } catch (err) {
      setError(err.message || 'Failed to load report candidates');
      setCandidates([]);
      setMeta(null);
      setAssignments({});
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const selectedIds = useMemo(() => {
    const clinical = [];
    const additional = [];
    const seenClinical = new Set();
    const seenAdditional = new Set();
    candidates.forEach((row, index) => {
      const key = rowKeyOf(row, index);
      const bucket = assignments[key];
      const vid = row.id;
      if (!vid) return;
      if (bucket === INCLUDE && !seenClinical.has(vid)) {
        seenClinical.add(vid);
        clinical.push(vid);
      } else if (bucket === ADDITIONAL && !seenAdditional.has(vid) && !seenClinical.has(vid)) {
        seenAdditional.add(vid);
        additional.push(vid);
      }
    });
    return { clinical, additional };
  }, [candidates, assignments]);

  const setBucket = (key, bucket) => {
    setAssignments((prev) => {
      if (prev[key] === bucket) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: bucket };
    });
  };

  const canProceed =
    selectedIds.clinical.length >= 1 && !generating && !loading;

  const handleProceed = async () => {
    if (!canProceed || !conversationId) return;
    setGenerating(true);
    setError(null);
    try {
      await generateClinicalReport(conversationId, {
        clinical_result_variant_ids: selectedIds.clinical,
        additional_finding_variant_ids: selectedIds.additional,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err.message || 'Report generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const rowLabel = (row) =>
    row.display_id ||
    (row.gene && row.hgvs ? `${row.gene} ${row.hgvs}` : null) ||
    row.hgvs ||
    row.gene ||
    row.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!max-w-2xl w-full max-h-[min(90vh,820px)] flex flex-col p-0 gap-0 overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface-raised)', borderColor: 'var(--border-default)' }}
      >
        <div className="flex-shrink-0 px-5 py-3 border-b border-[var(--border-subtle)]">
          <DialogTitle className="text-base font-semibold text-[var(--text-primary)]">
            Generate clinical report
          </DialogTitle>
          <DialogDescription className="text-xs text-[var(--text-secondary)] mt-1">
            Select Include and/or Additional. Unselected variants are left out.
            {meta?.workflow_display_name
              ? ` · ${meta.workflow_display_name}`
              : ''}
            {typeof meta?.working_set_count === 'number'
              ? ` · ${meta.working_set_count.toLocaleString()} under consideration`
              : ''}
          </DialogDescription>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2">
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
          {!loading && candidates.length > 0 && (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {candidates.map((row, index) => {
                const key = rowKeyOf(row, index);
                const selected = assignments[key];
                return (
                  <li
                    key={key}
                    className="flex items-center gap-3 py-1.5 min-h-[2rem]"
                  >
                    <span
                      className="flex-1 min-w-0 text-xs font-mono text-[var(--text-primary)] truncate"
                      title={rowLabel(row)}
                    >
                      {rowLabel(row)}
                    </span>
                    <div className="flex-shrink-0 flex items-center gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setBucket(key, INCLUDE)}
                        className={`h-7 px-2 rounded-md border transition-colors ${
                          selected === INCLUDE
                            ? 'border-[var(--accent-teal)] bg-[var(--accent-teal)]/15 text-[var(--accent-teal)]'
                            : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                        }`}
                      >
                        Include
                      </button>
                      <button
                        type="button"
                        onClick={() => setBucket(key, ADDITIONAL)}
                        className={`h-7 px-2 rounded-md border transition-colors ${
                          selected === ADDITIONAL
                            ? 'border-[var(--accent-teal)] bg-[var(--accent-teal)]/15 text-[var(--accent-teal)]'
                            : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                        }`}
                      >
                        Additional
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex-shrink-0 px-5 py-3 border-t border-[var(--border-subtle)] space-y-2">
          {error && (
            <p className="text-xs text-[var(--error)]" title={error}>
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-2xs text-[var(--text-tertiary)]">
              Include: {selectedIds.clinical.length} · Additional: {selectedIds.additional.length}
              {selectedIds.clinical.length < 1 ? ' · select ≥1 Include' : ''}
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
