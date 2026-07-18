import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Check, Circle, Loader2, Minus, AlertCircle, ChevronDown, ChevronUp, FileText, X, Pencil } from 'lucide-react';
import {
  PIPELINE_STEP_DEFS,
  computePipelineSteps,
  getPipelineBackgroundActive,
  getPipelineStatusLine,
  getPipelineChipSummary,
} from '@/lib/variantPipelineSteps';

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
}) => {
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
      {/* ANNOVAR progress ring — starts top-left, fills down the left edge first
          (top-left → bottom-left → bottom-right → top-right → back to top-left). */}
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
          <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }} title={displayName}>
            {displayName}
          </p>
          <p
            className="text-[11px] truncate leading-tight mt-0.5"
            style={{ color: chatReady && showReadyMinimal ? 'var(--accent-teal)' : 'var(--text-secondary)' }}
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
      </div>

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
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] sm:text-xs transition-colors ${
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
                    <span className="text-[10px] px-0.5" style={{ color: 'var(--text-disabled)' }} aria-hidden>
                      →
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          <p
            className="text-[11px] leading-relaxed px-0.5"
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
            <p className="text-[10px] mt-1.5 px-0.5" style={{ color: 'var(--warning)' }}>
              Sign in to run ANNOVAR, apply filters, and chat with your full variant set.
            </p>
          )}
        </div>
      )}
    </section>
  );
};

export default VariantAnalysisPipeline;
