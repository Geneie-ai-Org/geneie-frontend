import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CountUp, StageMark, StateButton } from '@/components/motion';
import { SegmentedPill } from '@/components/UploadWizardKit';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  downloadGaTriageArtifact,
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
  const caveats = Array.isArray(row.pfra_caveats) ? row.pfra_caveats : [];
  const parts = [];
  if (row.ga_label) parts.push(row.ga_label);
  if (row.ga_score != null && row.ga_score !== '') parts.push(`Score ${row.ga_score}`);
  if (row.phenotype_fit) parts.push(`Phenotype: ${row.phenotype_fit}`);
  if (caveats.length) parts.push(`Flags: ${caveats.join(' · ')}`);
  return parts.join('\n') || 'No GA rationale on this row';
}

/**
 * One review step: GA ranking + Include / Additional + PDF.
 * Primary/Strong pre-check Include. Analyst override always wins.
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
  const [downloadingTsv, setDownloadingTsv] = useState(false);

  const load = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchClinicalReportCandidates(conversationId);
      setMeta(data);
      const rows = Array.isArray(data.candidates) ? data.candidates : [];
      setCandidates(rows);
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
    // Automatic: surface GA Include picks first.
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
  const gaReady = Boolean(pfra?.ga_top_used && pfraAvailable);
  const pfraGateMessage =
    pfra?.gate?.message ||
    (!pfraAvailable
      ? 'GA ranking unavailable — assign Include manually, then Proceed.'
      : null);
  const handleDownloadTsv = async () => {
    if (!conversationId || downloadingTsv) return;
    setDownloadingTsv(true);
    setError(null);
    try {
      await downloadGaTriageArtifact(conversationId, 'tsv');
    } catch (err) {
      setError(err.message || 'GA table download failed');
    } finally {
      setDownloadingTsv(false);
    }
  };

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

  const includeCount = selectedIds.clinical.length;
  const additionalCount = selectedIds.additional.length;

  const rowOptions = [
    { value: INCLUDE, label: 'Include' },
    { value: ADDITIONAL, label: 'Additional' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(88vh,760px)] w-full flex-col gap-0 overflow-hidden p-0 ring-0 sm:max-w-xl">
        {/* Header: what this is, and the one number that matters */}
        <div className="shrink-0 border-b border-[hsl(var(--wb-line))] px-5 py-4 pr-14">
          <DialogTitle className="text-base font-semibold leading-snug text-foreground">Choose variants for the report</DialogTitle>
          <DialogDescription className="mt-1 text-[13px] leading-snug text-muted-foreground">
            {gaReady
              ? 'Ranking pre-checked the Primary and Strong variants as Include. Change anything, then generate the report.'
              : automaticMode
                ? 'Ranking is not ready. Mark the variants to include, then generate the report.'
                : 'Mark variants as Include or Additional. Unmarked variants stay out of the PDF.'}
          </DialogDescription>
          <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground tabular-nums" role="status">
            <span className="wb-chip" data-tone={includeCount > 0 ? 'brand' : undefined}>
              <CountUp value={includeCount} duration={0.3} /> Include
            </span>
            <span className="wb-chip">
              <CountUp value={additionalCount} duration={0.3} /> Additional
            </span>
            {typeof meta?.working_set_count === 'number' && (
              <span className="px-1">{meta.working_set_count.toLocaleString()} under consideration</span>
            )}
            {meta?.workflow_display_name && <span className="wb-chip">{meta.workflow_display_name}</span>}
          </p>
          {!loading && pfraGateMessage && !pfraAvailable ? (
            <p className="mt-1.5 text-xs text-muted-foreground">{pfraGateMessage}</p>
          ) : null}
        </div>

        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
          {loading && (
            <ul className="m-0 list-none space-y-1.5 p-0" aria-busy="true" aria-label="Loading candidates">
              {[0, 1, 2, 3, 4].map((i) => (
                <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="wb-shimmer h-4 w-40 rounded-full" />
                  <span className="wb-shimmer ml-auto h-7 w-36 rounded-full" />
                </li>
              ))}
            </ul>
          )}
          {!loading && error && candidates.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center" role="alert">
              <StageMark state="failed" size={26} />
              <p className="text-[13px] font-medium text-foreground">Could not load the candidates</p>
              <p className="text-[13px] text-muted-foreground">{error}</p>
              <Button type="button" variant="outline" size="sm" onClick={load} className="mt-1">
                Try again
              </Button>
            </div>
          )}
          {!loading && candidates.length === 0 && !error && (
            <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">
              No variants are in the current working set. Apply a filter, then come back.
            </p>
          )}
          {!loading && candidates.length > 0 && (
            <ul className="m-0 list-none space-y-0.5 p-0">
              {displayRows.map(({ row, index }) => {
                const key = rowKeyOf(row, index);
                const selected = assignments[key];
                const badge = (row.badge || '').trim();
                const suggested = Boolean(row.suggested_section);
                const why = whyText(row);
                return (
                  <li
                    key={key}
                    className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border px-3 py-2 transition-colors duration-150 motion-reduce:transition-none ${
                      selected ? 'border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-50))]' : 'border-transparent hover:bg-[hsl(var(--wb-pill))]'
                    }`}
                  >
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="truncate font-mono text-xs text-foreground" title={why}>
                        {rowLabel(row)}
                        {Array.isArray(row.pfra_caveats) && row.pfra_caveats.includes('VUS_CANDIDATE_NOT_ACTIONABLE') ? (
                          <span className="ml-1.5 font-sans text-xs text-muted-foreground">VUS candidate</span>
                        ) : null}
                      </p>
                      {(suggested || badge) && (
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          {suggested && <span className="font-medium text-[hsl(var(--brand-700))]">Include pick</span>}
                          {badge && <span className="tabular-nums">{badge}</span>}
                        </p>
                      )}
                      {suggested && why && (
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer select-none rounded-full outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)]">Why</summary>
                          <p className="mt-0.5 whitespace-pre-line">{why}</p>
                        </details>
                      )}
                    </div>
                    {/* One sliding thumb per row (own layoutId), so rows never trade thumbs. Choosing the
                        active option again clears it, as before. */}
                    <SegmentedPill
                      className="shrink-0"
                      ariaLabel={`Assign ${rowLabel(row)}`}
                      value={selected}
                      onChange={(next) => setBucket(key, next)}
                      options={rowOptions}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer: one primary, quiet extras */}
        <div className="shrink-0 space-y-2 border-t border-[hsl(var(--wb-line))] px-5 py-3">
          {error && candidates.length > 0 && (
            <p role="alert" className="text-[13px] text-[var(--error)]">
              {error}
            </p>
          )}
          {!loading && includeCount < 1 && candidates.length > 0 && (
            <p className="text-xs text-muted-foreground">Mark at least one variant as Include to generate the report.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {gaReady ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDownloadTsv}
                  disabled={downloadingTsv}
                >
                  <Download aria-hidden />
                  {downloadingTsv ? 'Downloading…' : 'Ranking table'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={applySuggestions}
                  disabled={suggestionCount === 0}
                  title={`Reset to the ${suggestionCount} Include pick${suggestionCount === 1 ? '' : 's'} (Primary and Strong)`}
                >
                  Use ranking picks
                </Button>
              </>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <StateButton
                size="lg"
                state={generating ? 'running' : 'idle'}
                icon={FileText}
                labels={{ idle: 'Generate report', running: 'Generating report' }}
                disabled={!canProceed}
                onClick={handleProceed}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
