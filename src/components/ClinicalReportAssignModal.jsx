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

function assignmentsFromSuggestions(rows) {
  const next = {};
  rows.forEach((row, index) => {
    const key = rowKeyOf(row, index);
    const section = row.suggested_section;
    if (section === INCLUDE || section === 'clinical_result') {
      next[key] = INCLUDE;
    } else if (section === ADDITIONAL || section === 'additional_finding') {
      next[key] = ADDITIONAL;
    }
  });
  return next;
}

function whyText(row) {
  const reasons = Array.isArray(row.pfra_reasons) ? row.pfra_reasons : [];
  const caveats = Array.isArray(row.pfra_caveats) ? row.pfra_caveats : [];
  const parts = [];
  if (row.suggested_bucket) parts.push(`Bucket: ${row.suggested_bucket}`);
  if (row.phenotype_fit) parts.push(`Fit: ${row.phenotype_fit}`);
  if (reasons.length) parts.push(reasons.slice(0, 6).join(' · '));
  if (caveats.length) parts.push(`Caveats: ${caveats.join(' · ')}`);
  return parts.join('\n') || 'No PFRA rationale';
}

/**
 * Slim assignment modal: variant id + Include / Additional only.
 * Unselected rows are excluded by default. Sorted by BE (persona workflow rules).
 * Assignments are keyed by unique row_key so duplicate variant ids don't steal clicks.
 * PFRA pre-checks Include/Additional on load; analyst override always wins before PDF.
 * In Automatic mode, suggested rows are surfaced first and highlighted.
 */
export default function ClinicalReportAssignModal({
  open,
  onOpenChange,
  conversationId,
  automaticMode = false,
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
      // Always apply PFRA pre-checks when present (Automatic + Manual).
      setAssignments(assignmentsFromSuggestions(rows));
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

  const displayRows = useMemo(() => {
    if (!automaticMode) {
      return candidates.map((row, index) => ({ row, index }));
    }
    // Automatic: surface PFRA-suggested rows first so preselection is obvious.
    const withIdx = candidates.map((row, index) => ({ row, index }));
    return [
      ...withIdx.filter(({ row }) => Boolean(row.suggested_section)),
      ...withIdx.filter(({ row }) => !row.suggested_section),
    ];
  }, [candidates, automaticMode]);

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

  const applySuggestions = () => {
    setAssignments(assignmentsFromSuggestions(candidates));
  };

  const canProceed =
    selectedIds.clinical.length >= 1 && !generating && !loading;

  const pfra = meta?.pfra || null;
  const pfraAvailable = Boolean(pfra?.suggestions_available);
  const suggestionCount = Number(pfra?.suggestion_count ?? 0);
  const pfraGateMessage =
    pfra?.gate?.message ||
    (!pfraAvailable
      ? 'Phenotype-driven suggestions unavailable — assign manually.'
      : null);

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
            {automaticMode && pfraAvailable
              ? 'Automatic mode · PFRA pre-selected Include rows below — review, edit if needed, then Proceed.'
              : automaticMode
                ? 'Automatic mode · assign Clinical result manually (PFRA suggestions unavailable).'
                : 'Select Include and/or Additional. Unselected variants are left out.'}
            {meta?.workflow_display_name
              ? ` · ${meta.workflow_display_name}`
              : ''}
            {typeof meta?.working_set_count === 'number'
              ? ` · ${meta.working_set_count.toLocaleString()} under consideration`
              : ''}
            {pfraAvailable
              ? ` · ${suggestionCount} suggestion${suggestionCount === 1 ? '' : 's'} pre-checked`
              : ''}
          </DialogDescription>
          {!loading && pfraAvailable ? (
            <p className="text-2xs mt-2" style={{ color: 'var(--accent-teal)' }}>
              Pre-selected for Clinical result: {selectedIds.clinical.length}
              {selectedIds.additional.length
                ? ` · Additional: ${selectedIds.additional.length}`
                : ''}
              {' · '}unselected stay out of the PDF
            </p>
          ) : null}
          {!loading && pfraGateMessage && !pfraAvailable ? (
            <p className="text-2xs text-[var(--text-tertiary)] mt-2">
              {pfraGateMessage}
            </p>
          ) : null}
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
              {displayRows.map(({ row, index }) => {
                const key = rowKeyOf(row, index);
                const selected = assignments[key];
                const badge = (row.badge || '').trim();
                const suggested = Boolean(row.suggested_section);
                const preselected = selected === INCLUDE || selected === ADDITIONAL;
                return (
                  <li
                    key={key}
                    className="flex items-center gap-2 py-1.5 min-h-[2rem] px-1 rounded-md"
                    style={
                      preselected
                        ? {
                            background:
                              'color-mix(in srgb, var(--accent-teal) 10%, transparent)',
                          }
                        : undefined
                    }
                  >
                    <span
                      className="flex-1 min-w-0 text-xs font-mono text-[var(--text-primary)] truncate"
                      title={whyText(row)}
                    >
                      {suggested ? (
                        <span
                          className="mr-1.5 text-2xs font-sans font-medium"
                          style={{ color: 'var(--accent-teal)' }}
                        >
                          Suggested
                        </span>
                      ) : null}
                      {rowLabel(row)}
                      {row.suggested_bucket === 'PRIMARY_VUS_HIGH' ? (
                        <span className="ml-1 text-2xs text-[var(--text-tertiary)]">
                          (VUS candidate)
                        </span>
                      ) : null}
                    </span>
                    {suggested ? (
                      <span
                        className="flex-shrink-0 text-2xs text-[var(--text-tertiary)] cursor-help"
                        title={whyText(row)}
                      >
                        why
                      </span>
                    ) : null}
                    {badge ? (
                      <span
                        className="flex-shrink-0 text-2xs font-medium text-[var(--text-tertiary)] tabular-nums min-w-[3.25rem] text-right"
                        title={badge}
                      >
                        {badge}
                      </span>
                    ) : (
                      <span className="flex-shrink-0 min-w-[3.25rem]" />
                    )}
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
              {pfraAvailable ? (
                <button
                  type="button"
                  onClick={applySuggestions}
                  className="h-9 px-3 rounded-lg text-xs border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
                  title="Re-apply PFRA pre-checks (you can still edit)"
                >
                  Accept suggestions
                </button>
              ) : null}
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
