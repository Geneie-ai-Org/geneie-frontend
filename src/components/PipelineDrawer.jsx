import React, { useEffect, useRef, useState } from 'react';
import { Dna, FileText, Pencil, Trash2 } from 'lucide-react';
import { PHENOTYPE_RUNNING_MESSAGE } from '@/lib/filterDisplayNames';
import RunTimer from '@/components/ui/RunTimer';
import { useRunTimer } from '@/hooks/useRunTimer';
import { formatDuration } from '@/lib/formatDuration';
import {
  MODULE1_STAGE_GROUPS,
  getModule1FailureMessage,
  getModule1StageGroup,
  module1FinishedSuccessfully,
} from '@/lib/module1PipelinePhases';
import Module1QcSection, { module1HasQcArtifacts } from '@/components/Module1QcSection';
import PipelineJobCard from '@/components/PipelineJobCard';
import { Button } from '@/components/ui/button';
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

/** Variant-file steps that follow the upload; `upload` is the first row of a VCF run. */
const ANALYSIS_STEP_DEFS = PIPELINE_STEP_DEFS.filter((def) => def.id !== 'upload');

function timerMs(timer) {
  if (!timer) return 0;
  return (timer.running ? timer.elapsedMs : timer.durationMs) ?? 0;
}

/**
 * Pipeline state, rendered as a drawer that sits *behind* the chat composer.
 *
 * The composer is the primary object on the page; this is the secondary one. So the
 * drawer carries no border and no shadow and uses `--bg-surface-sunken`.
 *
 * Every route reads as the same two phases, one pill each:
 *   FASTQ + VCF   Reads → VCF (Module 1 job)   →  Annotated & ready (variant steps)
 *   FASTQ only    Reads → VCF                  →  Annotated & ready, waiting to start
 *   VCF only      VCF uploaded (upload step)   →  Annotated & ready
 * Each pill's tint fills with that phase's progress and opens to its steps. `expanded`
 * is the second phase's steps, which is what the page opens when there is work to show.
 */
const PipelineDrawer = ({
  module1Job = null,
  onModule1StartOver,
  fileName,
  conversationId = null,
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
  /** 'card' (default): the drawer behind the composer. 'panel': plain content for a workspace tab. */
  variant = 'card',
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

  const steps = computePipelineSteps(pipelineProps);

  /* ── Per-step timing ─────────────────────────────────────────────────────────────
   * Server-reported start/finish times where the job has them (annotation, filter,
   * phenotype prioritization); observed client-side for the steps that run in this
   * tab (upload, interpretation). Keyed per conversation so two open analyses don't
   * share one stopwatch.
   */
  const timerKey = (stepId) => (conversationId ? `${conversationId}:${stepId}` : null);
  const jobTiming = (job) => ({
    startedAt: job?.started_at ?? null,
    completedAt: job?.completed_at ?? null,
    durationSeconds: job?.duration_seconds ?? null,
  });

  /* Phenotype prioritization and the ACMG filter are the same pipeline step, so one of
   * the two owns its clock: whichever is live, else whichever finished last. Picking
   * "exomiser if it has any status" instead would report a stale Exomiser total while
   * the ACMG filter is the run actually in flight. */
  const reduceJob = (() => {
    const live = (status, flag) =>
      flag || ['running', 'queued', 'pending'].includes((status || '').trim().toLowerCase());
    if (live(exomiserStatus?.status, isRunningExomiser)) return exomiserStatus;
    if (live(filterJob?.status, isApplyingProprietaryFilter)) return filterJob;
    const finishedAt = (job) => Date.parse(job?.completed_at || '') || 0;
    return finishedAt(exomiserStatus) >= finishedAt(filterJob) ? exomiserStatus : filterJob;
  })();

  const stepTimers = {
    upload: useRunTimer(timerKey('upload'), steps.upload === 'running'),
    interpret: useRunTimer(timerKey('interpret'), steps.interpret === 'running'),
    annovar: useRunTimer(timerKey('annovar'), steps.annovar === 'running', jobTiming(annovarJob)),
    reduce: useRunTimer(timerKey('reduce'), steps.reduce === 'running', jobTiming(reduceJob)),
    chat: null,
  };
  /* Enrichment and indexing are the two waits the five-step model doesn't own, and they
   * are the last thing between a filter and a usable chat — so they get a clock too.
   * Neither is timestamped server-side, so these are observed in this tab. */
  const enrichmentTimer = useRunTimer(timerKey('enrichment'), Boolean(enrichmentState?.active));
  const indexingTimer = useRunTimer(timerKey('indexing'), Boolean(indexingState?.active));

  const backgroundActive = getPipelineBackgroundActive(pipelineProps);
  const statusLine = getPipelineStatusLine(pipelineProps, steps);
  const summary = getPipelineChipSummary(steps, hasUploadedFile);
  const chatReady = chatEligibility?.allowed === true;
  const pgxOnlyScope = chatReady && (chatEligibility?.scope || '').toLowerCase() === 'pgx_only';
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

  // The card carries the live status and progress itself, so a starting job no longer forces
  // the step list open. A job finishing still tidies it away (unless the user opened it), and a
  // failure opens it so the step that broke is visible.
  useEffect(() => {
    const wasBusy = wasBusyRef.current;
    wasBusyRef.current = !!busy;
    if (busy && !wasBusy) {
      userIntentRef.current = null;
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
    // Do not advertise PGx-only unlock in the chip — Chat stays pending until full disease chat.
    if (pgxOnlyScope && steps.annovar !== 'done' && steps.annovar !== 'skipped') {
      return settled('Needs annotation');
    }
    if (pgxOnlyScope) return settled('Needs a filter');
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
    // Chip + CTA already say the next step (e.g. Needs annotation / Run annotation).
    if (gatedAction) return null;
    return statusLine;
  })();

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

  /* ── Reads → VCF (FASTQ route) ─────────────────────────────────────────────────── */
  const isFastqRoute = Boolean(module1Job);
  const module1Running = module1Job?.status === 'queued' || module1Job?.status === 'running';
  const module1Timer = useRunTimer(
    module1Job?.jobId ? `module1:${module1Job.jobId}` : null,
    module1Running,
    {
      startedAt: module1Job?.startedAt ?? null,
      completedAt: module1Job?.completedAt ?? null,
      durationSeconds: module1Job?.durationSeconds ?? null,
    }
  );
  const module1Failed = module1Job?.status === 'failed';
  // Once the VCF is in the conversation the reads phase is behind us, even if the job
  // record still says it is importing.
  const module1Done = module1FinishedSuccessfully(module1Job) || (isFastqRoute && hasUploadedFile && !uploadInProgress);
  const module1ActiveGroup = getModule1StageGroup(module1Job?.phase);
  const module1Pending = isFastqRoute && !hasUploadedFile && !module1Failed;

  /* ── Status: one vocabulary (Queued, Running, Done, Failed) and one sentence ─────── */
  // `null` means "waiting for you": no chip at all, because a status word next to a button
  // that says "Run annotation" is exactly the contradiction this card removes.
  const status = (() => {
    if (module1Failed || failed) return 'failed';
    if (module1Pending) return module1Job.status === 'queued' ? 'queued' : 'running';
    if (busy || uploadInProgress) return 'running';
    // A transient "Checking…" next to a Run button would contradict it; only show it with no action offered.
    if (stateLoading && !gatedAction) return 'running';
    if (chatReady && !pgxOnlyScope) return 'done';
    return null;
  })();

  // A next step the user has to start. Offered as a button, never next to a status word.
  const nextAction = hasUploadedFile && !busy && !failed && gatedAction && !showGuestFilterCta ? gatedAction : null;

  const sentence = (() => {
    if (module1Failed) return getModule1FailureMessage(module1Job);
    if (module1Pending) {
      if (module1Job.status === 'complete') return 'Importing the VCF into this conversation…';
      const group = MODULE1_STAGE_GROUPS.find((g) => g.id === module1ActiveGroup);
      return `${group?.label || 'Processing'}…`;
    }
    if (status === 'running' || status === 'failed') return detailText || stateText;
    // The sentence must agree with the button beside it ("Needs a filter" next to "Run annotation"
    // was the old contradiction), so it names the same step.
    if (nextAction?.label) return `Next step: ${nextAction.label.charAt(0).toLowerCase()}${nextAction.label.slice(1)}.`;
    return stateText;
  })();
  const note = (() => {
    if (module1Pending || module1Failed) return null;
    if (status === 'running' || status === 'failed') return null;
    if (nextAction) return detailText || stateText;
    return detailText && detailText !== sentence ? detailText : null;
  })();

  const progress = module1Pending
    ? (typeof module1Job.progressPercent === 'number' ? module1Job.progressPercent : null)
    : status === 'running' ? progressPct : null;

  /* ── Step list (collapsed by default) ─────────────────────────────────────────── */
  const guestFrozen = (id) =>
    isGuest && id === 'reduce' && steps.annovar !== 'done' && steps.annovar !== 'skipped';
  const stepTime = (timer) => {
    const ms = timerMs(timer);
    return ms >= 1000 ? formatDuration(ms) : null;
  };
  const firstStep = isFastqRoute
    ? {
        id: 'reads',
        label: 'Reads to VCF',
        status: module1Failed ? 'failed' : module1Done ? 'done' : 'running',
        time: stepTime(module1Timer),
      }
    : {
        id: 'upload',
        label: 'Upload',
        status: steps.upload === 'done' ? 'done' : steps.upload === 'running' ? 'running' : 'pending',
        time: stepTime(stepTimers.upload),
        onClick: () => handleStepClick('upload'),
        title: 'View Upload',
      };
  const stepRows = [
    firstStep,
    ...ANALYSIS_STEP_DEFS.map((def) => {
      const frozen = guestFrozen(def.id);
      const annovarDone = def.id === 'annovar' && steps[def.id] === 'done';
      return {
        id: def.id,
        label: def.label,
        // With nothing in flight and a next step offered, a stale "running" would sit beside that
        // button and contradict it; show it as the current stop instead.
        status: frozen ? 'pending' : steps[def.id] === 'running' && nextAction ? 'waiting' : steps[def.id],
        time: frozen ? null : stepTime(stepTimers[def.id]),
        detail: frozen ? 'Sign in for full analysis' : undefined,
        onClick: frozen || annovarDone ? undefined : () => handleStepClick(def.id),
        title: frozen ? 'Sign in for full analysis' : `View ${def.label}`,
      };
    }),
  ];

  const activeTimer = module1Pending
    ? module1Timer
    : enrichmentState?.active
      ? enrichmentTimer
      : indexingState?.active
        ? indexingTimer
        : ['upload', 'interpret', 'annovar', 'reduce'].map((id) => stepTimers[id]).find((t) => t?.running) || null;
  const activeMs = activeTimer ? timerMs(activeTimer) : 0;
  const timerNode = status === 'running' && activeTimer && activeMs >= 1000 ? (
    <RunTimer
      running={activeTimer.running}
      elapsedMs={activeTimer.elapsedMs}
      durationMs={activeTimer.durationMs}
      startMs={activeTimer.startMs}
      prefix="Elapsed "
    />
  ) : null;

  const title = (isFastqRoute ? module1Job.sampleName : null) || displayName;

  const iconButtons = hasUploadedFile && ((!isGuest && onEditSampleInfo) || onRemoveFile) ? (
    <span className="flex items-center gap-0.5">
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
    </span>
  ) : null;

  return (
    <div className={variant === 'panel' ? 'h-full min-h-0' : 'pipeline-drawer'} aria-label="Analysis pipeline">
      <PipelineJobCard
        variant={variant === 'panel' ? 'panel' : 'flat'}
        ariaLabel="Analysis pipeline"
        title={title}
        icon={
          isFastqRoute ? (
            <Dna className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          )
        }
        engine={showAnnotatedBadge ? { label: 'Annotated' } : null}
        status={status}
        statusText={sentence}
        pct={progress}
        timer={timerNode}
        note={note}
        action={
          nextAction ? (
            <Button type="button" variant="outline" size="sm" onClick={nextAction.onClick} className="max-sm:h-11">
              {nextAction.label}
            </Button>
          ) : null
        }
        steps={stepRows}
        stepsOpen={Boolean(expanded)}
        onStepsToggle={toggle}
        stepsLabel="Steps"
        headerExtra={iconButtons}
      >
        {module1Failed && onModule1StartOver && (
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onModule1StartOver} className="max-sm:h-11">
              Start over
            </Button>
          </div>
        )}

        {guestPipelineCta?.message && (
          <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 text-xs leading-relaxed text-[var(--text-secondary)]">{guestPipelineCta.message}</p>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {guestPipelineCta.action && (
                <Button type="button" variant="outline" size="sm" onClick={guestPipelineCta.action.onClick} className="max-sm:h-11">
                  {guestPipelineCta.action.label}
                </Button>
              )}
              {guestPipelineCta.secondaryAction && (
                <Button type="button" variant="ghost" size="sm" onClick={guestPipelineCta.secondaryAction.onClick} className="max-sm:h-11">
                  {guestPipelineCta.secondaryAction.label}
                </Button>
              )}
            </div>
          </div>
        )}
        {!guestPipelineCta?.message && guestPipelineCta?.action && (
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={guestPipelineCta.action.onClick} className="max-sm:h-11">
              {guestPipelineCta.action.label}
            </Button>
          </div>
        )}

        {/* QC report for a FASTQ run, outside the step list so it stays one click away. */}
        {isFastqRoute && module1HasQcArtifacts(module1Job) && (
          <Module1QcSection job={module1Job} variant={variant === 'panel' ? 'panel' : 'card'} />
        )}
      </PipelineJobCard>

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
    </div>
  );
};

export default PipelineDrawer;
