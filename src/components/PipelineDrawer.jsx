import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertCircle, ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react';
import { PHENOTYPE_RUNNING_MESSAGE } from '@/lib/filterDisplayNames';
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

function stepTextStyle(status, locked) {
  if (locked) return { color: 'var(--text-tertiary)', fontWeight: 400 };
  if (status === 'done') return { color: 'var(--text-primary)', fontWeight: 600 };
  if (status === 'failed') return { color: 'var(--error)', fontWeight: 600 };
  if (status === 'running') return { color: 'var(--text-primary)', fontWeight: 600 };
  // `skipped` is struck through rather than dimmed — a step that will never run must not
  // read as one that hasn't run yet.
  if (status === 'skipped') {
    return { color: 'var(--text-tertiary)', fontWeight: 400, textDecoration: 'line-through' };
  }
  return { color: 'var(--text-tertiary)', fontWeight: 400 };
}

/** A step is "behind you" once it can no longer become active. */
function isStepPassed(status) {
  return status === 'done' || status === 'skipped';
}

/**
 * Status as a shape, not just a weight. Colour and font-weight alone put `done` and
 * `pending` two hairs apart at 12px, which made the row unreadable at a glance; every
 * status now owns a distinct mark in a fixed 14px slot so the labels stay in one lane.
 */
function StepGlyph({ status, locked }) {
  const slot = 'w-3.5 h-3.5 shrink-0 flex items-center justify-center';

  if (locked) {
    return (
      <span className={slot} aria-hidden>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.5" strokeLinecap="round">
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className={slot} aria-hidden>
        <AlertCircle className="w-3 h-3" style={{ color: 'var(--error)' }} />
      </span>
    );
  }
  if (status === 'done') {
    return (
      <span className={slot} aria-hidden>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="3" strokeLinecap="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
    );
  }
  if (status === 'skipped') {
    return (
      <span className={slot} aria-hidden>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.5" strokeLinecap="round">
          <path d="M5 12h14" />
        </svg>
      </span>
    );
  }
  if (status === 'running') {
    return (
      <span className={slot} aria-hidden>
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-teal)' }} />
      </span>
    );
  }
  return (
    <span className={slot} aria-hidden>
      <span
        className="w-[7px] h-[7px] rounded-full border"
        style={{ borderColor: 'var(--text-disabled)' }}
      />
    </span>
  );
}

/**
 * Five segments on the collapsed line
 * this carries position in the pipeline (of the input file) it in 102px without printing a percentage.
 */
function SegmentMeter({ steps }) {
  return (
    <span className="hidden sm:flex items-center gap-[3px] shrink-0" aria-hidden>
      {PIPELINE_STEP_DEFS.map((def) => {
        const status = steps[def.id];
        const color =
          status === 'failed'
            ? 'var(--error)'
            : status === 'running'
              ? 'var(--accent-teal)'
              : isStepPassed(status)
                ? 'var(--text-primary)'
                : 'var(--text-disabled)';
        return (
          <span
            key={def.id}
            className="w-[18px] h-[7px] rounded-[6px]"
            style={{ backgroundColor: color }}
          />
        );
      })}
    </span>
  );
}

/**
 * Pipeline state, rendered as a drawer that sits *behind* the chat composer.
 *
 * The composer is the primary object on the page; this is the secondary one. So the
 * drawer carries no border and no shadow, uses `--bg-surface-sunken`, and collapses to
 * a single line that clears the composer's top edge. It never disappears entirely —
 * the file and its variant count stay glanceable.
 *
 * Progress is deliberately unnumbered. The backend reports percentages in lumps
 * (queued 5, exporting 30, tertiary 65, literature 85), so a printed number invites
 * watching a value that jumps. Instead the collapsed status line shimmers and a stroke
 * travels the drawer's perimeter, carrying the percentage as distance only.
 */
const PipelineDrawer = ({
  fileName,
  expanded,
  onExpandedChange,
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
  gatedMessage = null,
  gatedAction = null,
  guestPipelineCta = null,
}) => {
  const reduceMotion = useReducedMotion();
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

  const steps = computePipelineSteps(pipelineProps);
  const backgroundActive = getPipelineBackgroundActive(pipelineProps);
  const statusLine = getPipelineStatusLine(pipelineProps, steps);
  const summary = getPipelineChipSummary(steps, hasUploadedFile);
  const chatReady = chatEligibility?.allowed === true;
  const variantCount = variantsUnderConsideration ?? filteredVariantCount;
  const displayName = fileName || 'Variant file';
  const guestFilterGateBlocked =
    isGuest && !chatReady && chatEligibility?.reason === 'CHAT_REQUIRES_FILTER';
  const showGuestFilterCta = guestFilterGateBlocked && Boolean(guestPipelineCta?.message);

  const failed =
    enrichmentState?.failed ||
    indexingState?.failed ||
    steps.annovar === 'failed' ||
    steps.reduce === 'failed';

  // Enrichment and indexing are the two async gates the step model doesn't know about,
  // so they own the wording whenever they're live.
  const busy = backgroundActive || enrichmentState?.active || indexingState?.active;

  /* ── Auto-expand once, then auto-collapse ─────────────────────────────────────
   * A job starting is worth surfacing; a job finishing is worth getting out of the
   * way for. A manual collapse mid-job is respected until the next job starts, and a
   * failure holds the drawer open regardless.
   */
  const userIntentRef = useRef(null); // null | 'open' | 'closed'
  const wasBusyRef = useRef(false);
  const expandRef = useRef(onExpandedChange);
  expandRef.current = onExpandedChange;

  useEffect(() => {
    const wasBusy = wasBusyRef.current;
    wasBusyRef.current = !!busy;

    if (busy && !wasBusy) {
      userIntentRef.current = null;
      expandRef.current?.(true);
      return;
    }
    if (!busy && wasBusy && userIntentRef.current !== 'open') {
      expandRef.current?.(false);
    }
  }, [busy]);

  useEffect(() => {
    if (failed) expandRef.current?.(true);
  }, [failed]);

  const toggle = () => {
    userIntentRef.current = expanded ? 'closed' : 'open';
    onExpandedChange?.(!expanded);
  };

  /* ── Perimeter progress ──────────────────────────────────────────────────────── */
  const progressPct = (() => {
    if (enrichmentState?.active) return enrichmentState.progress ?? null;
    if (uploadInProgress) return uploadProgress ?? null;
    if (isRunningAnnovar || annovarJob?.status === 'running') return annovarJob?.progress_percent ?? null;
    if (isRunningExomiser || exomiserStatus?.status === 'running') return exomiserStatus?.progress_percent ?? null;
    if (isApplyingProprietaryFilter || filterJob?.status === 'running') return filterJob?.progress_percent ?? null;
    return null;
  })();

  /* ── Collapsed line ──────────────────────────────────────────────────────────── */
  const { text: stateText, loading: stateLoading } = (() => {
    const working = (text) => ({ text, loading: true });
    const settled = (text) => ({ text, loading: false });

    if (enrichmentState?.active) return working('Enriching…');
    if (enrichmentState?.failed) return settled('Enrichment failed');
    if (indexingState?.active) return working('Indexing…');
    if (indexingState?.failed) return settled('Indexing failed');
    if (uploadInProgress) return working('Uploading…');
    if (steps.annovar === 'failed') return settled('Annotation failed');
    if (steps.reduce === 'failed') return settled('Prioritization failed');
    if (isRunningAnnovar || annovarJob?.status === 'running') return working('Annotating…');
    if (isRunningExomiser || exomiserStatus?.status === 'running') return working(PHENOTYPE_RUNNING_MESSAGE);
    if (isApplyingProprietaryFilter || filterJob?.status === 'running') return working('Applying filter…');
    if (chatReady) {
      return settled(
        variantCount != null
          ? `Ready · ${Number(variantCount).toLocaleString()} variants`
          : 'Ready'
      );
    }
    if (chatEligibility?.reason === 'CHAT_REQUIRES_FILTER') return settled('Needs a filter');
    // Eligibility still resolving server-side — a wait, so it shimmers too.
    if (chatEligibility?.allowed === null) return working('Checking…');
    return summary.status === 'running' ? working(summary.label) : settled(summary.label);
  })();

  const stateColor = failed
    ? 'var(--error)'
    : chatReady && !busy
      ? 'var(--accent-teal)'
      : 'var(--text-tertiary)';

  /* ── Expanded status ─────────────────────────────────────────────────────────── */
  const detailText = (() => {
    if (enrichmentState?.failed) {
      return enrichmentState.message || 'Enrichment failed. Reset your filters and apply them again to retry.';
    }
    if (indexingState?.failed) {
      return indexingState.message || 'Indexing failed. Try applying filters again to retry.';
    }
    if (enrichmentState?.active) return enrichmentState.message || 'Enriching your variants…';
    if (indexingState?.active) return indexingState.message || 'Indexing variants for chat…';
    if (showGuestFilterCta) return null;
    if (isGuest && chatReady && chatEligibility?.message) return chatEligibility.message;
    if (gatedMessage) return gatedMessage;
    return statusLine;
  })();

  const detailColor = failed
    ? 'var(--error)'
    : chatReady && !busy
      ? 'var(--accent-teal)'
      : 'var(--text-secondary)';

  const handleStepClick = (stepId) => {
    if (
      isGuest &&
      stepId === 'reduce' &&
      steps.annovar !== 'done' &&
      steps.annovar !== 'skipped'
    ) {
      return;
    }
    onStepAction?.(stepId);
  };

  const showAnnotatedBadge = hasAnnotatedFile || vcfAnnotated;

  return (
    <section className="pipeline-drawer overflow-hidden" aria-label="Variant analysis pipeline">
      {busy && (
        <PerimeterProgress progress={progressPct} variant="u" radius={16} />
      )}

      {/* Collapsed line — the only thing that clears the composer's top edge. */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="w-full flex items-center gap-1.5 px-3.5 h-7 text-left"
      >
        <span
          className="text-2xs truncate shrink min-w-0"
          style={{ color: 'var(--text-secondary)' }}
          title={displayName}
        >
          {displayName}
        </span>
        <SegmentMeter steps={steps} />
        <span
          className={`text-2xs truncate shrink-0${stateLoading ? ' pipeline-status-shimmer' : ''}`}
          style={stateLoading ? undefined : { color: stateColor }}
        >
          {stateText}
        </span>
        <span className="ml-auto shrink-0 flex items-center" style={{ color: 'var(--text-tertiary)' }}>
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            // The collapse is faster than the expand: opening is the user asking to read
            // something, closing is the interface getting out of the way. The exit timing
            // has to ride on `exit` itself — AnimatePresence replays the element's last
            // props, so a `transition` that branched on `expanded` would never see false.
            exit={{
              height: 0,
              opacity: 0,
              transition: reduceMotion ? { duration: 0 } : { duration: 0.15, ease: [0.23, 1, 0.32, 1] },
            }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pt-0.5">
              <ol className="flex flex-wrap items-center gap-x-0.5 gap-y-1.5 pb-1 w-full">
                {PIPELINE_STEP_DEFS.map((def, index) => {
                  const status = steps[def.id];
                  const isLast = index === PIPELINE_STEP_DEFS.length - 1;
                  const annovarDone = def.id === 'annovar' && status === 'done';
                  const guestLocked =
                    isGuest &&
                    def.id === 'reduce' &&
                    steps.annovar !== 'done' &&
                    steps.annovar !== 'skipped';
                  const clickable = !guestLocked && !annovarDone;
                  const running = status === 'running' && !guestLocked;

                  return (
                    <li
                      key={def.id}
                      className={`flex items-center${isLast ? '' : ' flex-1 min-w-0'}`}
                    >
                      <button
                        type="button"
                        disabled={guestLocked}
                        onClick={() => handleStepClick(def.id)}
                        className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded-[10px] text-2xs sm:text-xs shrink-0 transition-colors ${
                          clickable ? 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05] cursor-pointer' : 'cursor-default opacity-60'
                        }`}
                        style={{
                          ...stepTextStyle(status, guestLocked),
                          // Tint + weight are the whole "you are here" signal here; the
                          // shimmer is reserved for the collapsed status line.
                          ...(running ? { backgroundColor: 'var(--accent-teal-soft)' } : null),
                        }}
                        title={guestLocked ? 'Sign in for full analysis' : `View ${def.label}`}
                      >
                        <StepGlyph status={status} locked={guestLocked} />
                        <span>{def.shortLabel || def.label}</span>
                      </button>
                      {!isLast && (
                        <span
                          // Grows to fill the drawer: the connectors absorb the spare
                          // width, so the row spans it and the labels land on an even
                          // pitch instead of huddling at the left edge.
                          className="h-px flex-1 min-w-[0.875rem]"
                          style={{
                            backgroundColor: isStepPassed(status)
                              ? 'var(--text-disabled)'
                              : 'var(--border-default)',
                          }}
                          aria-hidden
                        />
                      )}
                    </li>
                  );
                })}
              </ol>

              <div className="flex items-start gap-2">
                {detailText ? (
                  <p
                    className="text-2xs leading-relaxed flex-1 min-w-0 px-0.5"
                    style={{ color: detailColor }}
                    aria-live="polite"
                  >
                    {detailText}
                  </p>
                ) : (
                  <span className="flex-1" aria-hidden />
                )}
                {gatedAction && !showGuestFilterCta && (
                  <button
                    type="button"
                    onClick={gatedAction.onClick}
                    className="shrink-0 px-2 py-0.5 rounded-md text-2xs font-medium border transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)]"
                    style={{ borderColor: 'var(--accent-teal)', color: 'var(--accent-teal)' }}
                  >
                    {gatedAction.label}
                  </button>
                )}
              </div>

              {guestPipelineCta?.message && (
                <div className="flex flex-col gap-2 pb-1 px-0.5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-2xs leading-relaxed min-w-0" style={{ color: 'var(--text-secondary)' }}>
                    {guestPipelineCta.message}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {guestPipelineCta.action && (
                      <button
                        type="button"
                        onClick={guestPipelineCta.action.onClick}
                        className="shrink-0 px-2 py-0.5 rounded-md text-2xs font-medium border transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)]"
                        style={{ borderColor: 'var(--accent-teal)', color: 'var(--accent-teal)' }}
                      >
                        {guestPipelineCta.action.label}
                      </button>
                    )}
                    {guestPipelineCta.secondaryAction && (
                      <button
                        type="button"
                        onClick={guestPipelineCta.secondaryAction.onClick}
                        className="shrink-0 px-2 py-0.5 rounded-md text-2xs font-medium transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)]"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {guestPipelineCta.secondaryAction.label}
                      </button>
                    )}
                  </div>
                </div>
              )}
              {!guestPipelineCta?.message && guestPipelineCta?.action && (
                <div className="flex justify-end pb-1 px-0.5">
                  <button
                    type="button"
                    onClick={guestPipelineCta.action.onClick}
                    className="shrink-0 px-2 py-0.5 rounded-md text-2xs font-medium border transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)]"
                    style={{ borderColor: 'var(--accent-teal)', color: 'var(--accent-teal)' }}
                  >
                    {guestPipelineCta.action.label}
                  </button>
                </div>
              )}

              {/* Destructive actions live here, not on the collapsed line. */}
              {(showAnnotatedBadge || (!isGuest && onEditSampleInfo) || onRemoveFile) && (
                <div className="flex items-center gap-1.5 pb-1">
                  {showAnnotatedBadge && (
                    <span
                      className="inline-flex items-center px-1.5 h-[18px] rounded-full text-2xs font-medium uppercase tracking-wide"
                      style={{ backgroundColor: 'var(--accent-teal-soft)', color: 'var(--accent-teal)' }}
                      title={
                        hasAnnotatedFile
                          ? 'ANNOVAR annotations added by Geneie'
                          : 'This VCF already contains ANNOVAR annotations'
                      }
                    >
                      Annotated
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-0.5">
                    {!isGuest && onEditSampleInfo && (
                      <button
                        type="button"
                        onClick={onEditSampleInfo}
                        className="chat-chrome-btn-sm"
                        title="Edit sample info"
                        aria-label="Edit sample info"
                      >
                        <Pencil />
                      </button>
                    )}
                    {onRemoveFile && (
                      <button
                        type="button"
                        onClick={() => setRemoveFileDialogOpen(true)}
                        className="chat-chrome-btn-sm hover:!text-[var(--error)]"
                        title="Remove variant file"
                        aria-label="Remove variant file"
                      >
                        <Trash2 />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AlertDialog open={removeFileDialogOpen} onOpenChange={setRemoveFileDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this variant file?</AlertDialogTitle>
            <AlertDialogDescription>
              All filters and variant data for this conversation will be cleared. You&apos;ll need to
              upload the file again to run analysis.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setRemoveFileDialogOpen(false);
                onRemoveFile?.();
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

export default PipelineDrawer;
