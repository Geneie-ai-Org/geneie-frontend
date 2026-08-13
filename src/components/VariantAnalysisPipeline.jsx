import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Check, Circle, Loader2, Minus, AlertCircle, ChevronDown, ChevronUp, FileText, X, Pencil, Trash2 } from 'lucide-react';
import {
  PIPELINE_STEP_DEFS,
  computePipelineSteps,
  getPipelineBackgroundActive,
  getPipelineStatusLine,
  getPipelineChipSummary,
} from '@/lib/variantPipelineSteps';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function StepIcon({ status, size = 'w-3.5 h-3.5' }) {
  if (status === 'running') {
    return <Loader2 className={`${size} animate-spin`} style={{ color: 'var(--accent-teal)' }} aria-hidden />;
  }
  if (status === 'done') {
    return <Check className={size} style={{ color: 'var(--accent-teal)' }} aria-hidden />;
  }
  if (status === 'failed') {
    return <AlertCircle className={size} style={{ color: 'var(--error)' }} aria-hidden />;
  }
  if (status === 'skipped') {
    return <Minus className={size} style={{ color: 'var(--text-disabled)' }} aria-hidden />;
  }
  return <Circle className={size} style={{ color: 'var(--text-disabled)' }} aria-hidden />;
}

/**
 * Sticky analysis pipeline: compact chip above input, expands to full stepper.
 */
const VariantAnalysisPipeline = ({
  fileName,
  expanded,
  onExpandedChange,
  dismissed,
  onDismiss,
  compactReadyOnly = false,
  isGuest = false,
  onStepAction,
  uploadInProgress = false,
  uploadProgress = null,
  hasUploadedFile,
  columnInterpretationResult,
  hasAnnotatedFile,
  vcfAnnotated,
  requiresAnnovar,
  isRunningAnnovar,
  isApplyingProprietaryFilter,
  annovarJob,
  filterJob,
  chatEligibility,
  activeProprietaryFilter,
  activeVariantFilters,
  filteredVariantCount,
  s3LineCountStatus,
  variantsUnderConsideration,
  onEditSampleInfo,
  onRemoveFile,
  enrichmentState,
  indexingState,
  isRunningExomiser,
  exomiserStatus,
}) => {
  const [removeFileDialogOpen, setRemoveFileDialogOpen] = useState(false);
  const pipelineProps = {
    uploadInProgress,
    uploadProgress,
    hasUploadedFile,
    columnInterpretationResult,
    hasAnnotatedFile,
    requiresAnnovar,
    isRunningAnnovar,
    isApplyingProprietaryFilter,
    annovarJob,
    filterJob,
    chatEligibility,
    activeProprietaryFilter,
    activeVariantFilters,
    filteredVariantCount,
    s3LineCountStatus,
    variantsUnderConsideration,
    isRunningExomiser,
    exomiserStatus,
  };

  const steps = useMemo(() => computePipelineSteps(pipelineProps), [pipelineProps]);

  const backgroundActive = getPipelineBackgroundActive(pipelineProps);
  const statusLine = getPipelineStatusLine(pipelineProps, steps);
  const summary = getPipelineChipSummary(steps, hasUploadedFile);
  const chatReady = !!chatEligibility?.allowed;
  const variantCount = variantsUnderConsideration ?? filteredVariantCount;

  const displayName = fileName || 'Variant file';
  const showReadyMinimal = compactReadyOnly || (dismissed && chatReady && !expanded);

  // While ANNOVAR runs, the component's border doubles as a progress ring.
  const annovarPct =
    isRunningAnnovar && annovarJob?.progress_percent != null
      ? Math.max(0, Math.min(100, Math.round(annovarJob.progress_percent)))
      : null;

  // Measure the section so the ring path (which needs real px, unlike a %-sized
  // <rect>) can start at the top-left corner and travel down the left edge first.
  const sectionRef = useRef(null);
  const [ringSize, setRingSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const update = () => setRingSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Perimeter path: top-left → down left → bottom → up right → across top (counter-clockwise).
  const ringPath = (() => {
    const { w, h } = ringSize;
    if (!w || !h) return '';
    const x0 = 1, y0 = 1, x1 = w - 1, y1 = h - 1;
    const r = Math.min(11, (x1 - x0) / 2, (y1 - y0) / 2);
    return `M${x0},${y0 + r} L${x0},${y1 - r} A${r},${r} 0 0 0 ${x0 + r},${y1} L${x1 - r},${y1} A${r},${r} 0 0 0 ${x1},${y1 - r} L${x1},${y0 + r} A${r},${r} 0 0 0 ${x1 - r},${y0} L${x0 + r},${y0} A${r},${r} 0 0 0 ${x0},${y0 + r} Z`;
  })();

  const chipStatusText = (() => {
    // Enrichment is the final automatic gate before chat — surface it above everything else.
    if (enrichmentState?.active) {
      const pct = enrichmentState.progress != null ? ` · ${Math.round(enrichmentState.progress)}%` : '';
      return `Enriching variants${pct}`;
    }
    if (enrichmentState?.failed) {
      return 'Enrichment failed';
    }
    if (indexingState?.active) {
      return 'Indexing variants for chat…';
    }
    if (indexingState?.failed) {
      return 'Indexing failed';
    }
    if (showReadyMinimal) {
      return variantCount != null
        ? `Ready · ${Number(variantCount).toLocaleString()} variants`
        : 'Ready for chat';
    }
    if (backgroundActive || summary.status === 'running') {
      const pct = isRunningAnnovar && annovarJob?.progress_percent != null
        ? ` · ${Math.round(annovarJob.progress_percent)}%`
        : isApplyingProprietaryFilter && filterJob?.progress_percent != null
          ? ` · ${Math.round(filterJob.progress_percent)}%`
          : isRunningExomiser && exomiserStatus?.progress_percent != null
            ? ` · ${Math.round(exomiserStatus.progress_percent)}%`
            : '';
      return `Step ${summary.stepIndex}/${summary.total} · ${summary.label}${pct}`;
    }
    if (summary.focusId === 'chat' && steps.chat === 'done') {
      return variantCount != null
        ? `Ready · ${Number(variantCount).toLocaleString()} variants`
        : 'Chat ready';
    }
    return `Step ${summary.stepIndex}/${summary.total} · ${summary.label}`;
  })();

  const handleStepClick = (stepId) => {
    if (isGuest && (stepId === 'annovar' || stepId === 'reduce')) return;
    onStepAction?.(stepId);
  };

  return (
    <section
      ref={sectionRef}
      className="relative mb-2 rounded-xl border overflow-hidden transition-all"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor:
          annovarPct != null
            ? 'var(--border-subtle)'
            : chatReady && showReadyMinimal
              ? 'var(--accent-teal)'
              : '',
        boxShadow: expanded ? 'var(--shadow-md)' : 'none',
      }}
      aria-label="Variant analysis pipeline"
    >
      {/* ANNOVAR progress ring */}
      {annovarPct != null && ringSize.w > 0 && (
        <svg
          className="pointer-events-none absolute inset-0 z-10 h-full w-full"
          width={ringSize.w}
          height={ringSize.h}
          viewBox={`0 0 ${ringSize.w} ${ringSize.h}`}
          aria-hidden
        >
          <path
            d={ringPath}
            fill="none"
            stroke="var(--accent-teal)"
            strokeWidth="2"
            strokeLinecap="round"
            pathLength="100"
            strokeDasharray={`${annovarPct} 100`}
            style={{ transition: 'stroke-dasharray 0.35s ease' }}
          />
        </svg>
      )}

      {/* Compact chip header */}
      <div className="flex items-center gap-2 px-3 py-2 min-h-[40px]">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: 'var(--accent-teal-soft)' }}
        >
          {chatReady ? (
            <Check className="w-3.5 h-3.5" style={{ color: 'var(--accent-teal)' }} />
          ) : (
            <FileText className="w-3.5 h-3.5" style={{ color: 'var(--accent-teal)' }} />
          )}
        </div>

        <button
          type="button"
          onClick={() => onExpandedChange?.(!expanded)}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }} title={displayName}>
              {displayName}
            </p>
            {(hasAnnotatedFile || vcfAnnotated) && (
              <span
                className="shrink-0 inline-flex items-center gap-0.5 px-1.5 h-[18px] rounded-full text-2xs font-medium uppercase tracking-wide"
                style={{ backgroundColor: 'var(--accent-teal-soft)', color: 'var(--accent-teal)' }}
                title={hasAnnotatedFile ? 'ANNOVAR annotations added by Geneie' : 'This VCF already contains ANNOVAR annotations'}
              >
                Annotated
              </span>
            )}
          </div>
          <p
            className="text-2xs truncate leading-tight mt-0.5"
            style={{
              color: enrichmentState?.active || indexingState?.active
                ? 'var(--accent-teal)'
                : enrichmentState?.failed || indexingState?.failed
                  ? 'var(--error)'
                  : chatReady && showReadyMinimal
                    ? 'var(--accent-teal)'
                    : 'var(--text-secondary)',
            }}
          >
            {chipStatusText}
          </p>
        </button>

        <div className="flex items-center gap-0.5 shrink-0">
          {!isGuest && onEditSampleInfo && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEditSampleInfo(); }}
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
              style={{ color: 'var(--text-tertiary)' }}
              title="Edit sample info"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {onRemoveFile && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setRemoveFileDialogOpen(true); }}
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
              style={{ color: 'var(--text-tertiary)' }}
              title="Remove variant file"
              aria-label="Remove variant file"
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--error)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onExpandedChange?.(!expanded)}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse pipeline' : 'Expand pipeline'}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>

        <AlertDialog open={removeFileDialogOpen} onOpenChange={setRemoveFileDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove this variant file?</AlertDialogTitle>
              <AlertDialogDescription>
                All filters and variant data for this conversation will be cleared. You&apos;ll need to upload the file again to run analysis.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => { setRemoveFileDialogOpen(false); onRemoveFile?.(); }}>
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Enrichment status strip — automatic post-filter gate before chat */}
      {enrichmentState?.active && (
        <div className="px-3 pb-2.5 pt-0">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-3 h-3 border-2 rounded-full animate-spin shrink-0" style={{ borderColor: 'var(--accent-teal)', borderTopColor: 'transparent' }} />
            <span className="text-2xs truncate" style={{ color: 'var(--text-secondary)' }}>
              {enrichmentState.message || 'Enriching your variants…'}
            </span>
          </div>
          <div className="w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-surface-hover)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max(4, Math.min(100, Number(enrichmentState.progress ?? 5)))}%`,
                backgroundColor: 'var(--accent-teal)',
              }}
            />
          </div>
        </div>
      )}
      {enrichmentState?.failed && (
        <div className="px-3 pb-2.5 pt-0">
          <div className="p-2 rounded-lg border text-2xs leading-relaxed" style={{ borderColor: 'var(--error)', backgroundColor: 'var(--error-soft)', color: 'var(--error)' }}>
            <span className="font-medium">Enrichment failed. </span>
            {enrichmentState.message || 'Reset your filters and apply them again to retry.'}
          </div>
        </div>
      )}

      {indexingState?.active && (
        <div className="px-3 pb-2.5 pt-0">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 border-2 rounded-full animate-spin shrink-0" style={{ borderColor: 'var(--accent-teal)', borderTopColor: 'transparent' }} />
            <span className="text-2xs truncate" style={{ color: 'var(--text-secondary)' }}>
              {indexingState.message || 'Indexing variants for chat…'}
            </span>
          </div>
        </div>
      )}
      {indexingState?.failed && (
        <div className="px-3 pb-2.5 pt-0">
          <div className="p-2 rounded-lg border text-2xs leading-relaxed" style={{ borderColor: 'var(--error)', backgroundColor: 'var(--error-soft)', color: 'var(--error)' }}>
            <span className="font-medium">Indexing failed. </span>
            {indexingState.message || 'Try applying filters again to retry.'}
          </div>
        </div>
      )}

      {/* Expanded stepper + status */}
      {expanded && (
        <div
          className="px-3 pb-3 pt-0 border-t"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 py-2">
            {PIPELINE_STEP_DEFS.map((def, index) => {
              const status = steps[def.id];
              const isLast = index === PIPELINE_STEP_DEFS.length - 1;
              const annovarDone = def.id === 'annovar' && status === 'done';
              const clickable =
                (!isGuest || (def.id !== 'annovar' && def.id !== 'reduce')) && !annovarDone;
              const guestLocked = isGuest && (def.id === 'annovar' || def.id === 'reduce');

              return (
                <li key={def.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={guestLocked}
                    onClick={() => handleStepClick(def.id)}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-2xs sm:text-xs transition-colors ${
                      clickable && !guestLocked ? 'hover:bg-white/5 cursor-pointer' : 'cursor-default opacity-60'
                    }`}
                    style={{
                      color:
                        status === 'done' || status === 'skipped'
                          ? 'var(--accent-teal)'
                          : status === 'failed'
                            ? 'var(--error)'
                            : 'var(--text-secondary)',
                      fontWeight: status === 'running' ? 600 : 400,
                    }}
                    title={
                      guestLocked
                        ? 'Sign in for full analysis'
                        : `View ${def.label}`
                    }
                  >
                    <StepIcon status={status} size="w-3 h-3" />
                    <span>{def.shortLabel || def.label}</span>
                  </button>
                  {!isLast && (
                    <span className="text-2xs px-0.5" style={{ color: 'var(--text-disabled)' }} aria-hidden>
                      →
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          <p
            className="text-2xs leading-relaxed px-0.5"
            style={{
              color: chatReady ? 'var(--accent-teal)' : 'var(--text-secondary)',
            }}
          >
            {backgroundActive && (
              <span className="font-medium" style={{ color: 'var(--accent-teal)' }}>
                Background processing —{' '}
              </span>
            )}
            {statusLine}
          </p>

          {isGuest && (
            <p className="text-2xs mt-1.5 px-0.5" style={{ color: 'var(--warning)' }}>
              Sign in to run ANNOVAR, apply filters, and chat with your full variant set.
            </p>
          )}
        </div>
      )}
    </section>
  );
};

export default VariantAnalysisPipeline;
