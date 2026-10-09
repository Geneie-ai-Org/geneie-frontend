import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertCircle, Check, ChevronDown, ChevronUp, Dna, FileText, Loader2, Pencil, Trash2 } from 'lucide-react';
import { PHENOTYPE_RUNNING_MESSAGE } from '@/lib/filterDisplayNames';
import RunTimer from '@/components/ui/RunTimer';
import { useRunTimer } from '@/hooks/useRunTimer';
import { formatDuration } from '@/lib/formatDuration';
import {
  MODULE1_STAGE_GROUPS,
  getModule1StageGroup,
  module1FinishedSuccessfully,
} from '@/lib/module1PipelinePhases';
import Module1QcSection, { module1HasQcArtifacts } from '@/components/Module1QcSection';
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

/** Variant-file steps that make up the second phase; `upload` belongs to the first. */
const ANALYSIS_STEP_DEFS = PIPELINE_STEP_DEFS.filter((def) => def.id !== 'upload');

/** Module 1 stage nodes shown under "Reads → VCF"; the pill itself stands for "Complete". */
const MODULE1_STEP_GROUPS = MODULE1_STAGE_GROUPS.filter((g) => g.id !== 'complete');

function timerMs(timer) {
  if (!timer) return 0;
  return (timer.running ? timer.elapsedMs : timer.durationMs) ?? 0;
}

function PhaseMark({ status }) {
  if (status === 'done') {
    return (
      <span
        className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: 'var(--accent-teal)' }}
        aria-hidden
      >
        <Check className="w-2.5 h-2.5" strokeWidth={3} style={{ color: 'var(--accent-teal-contrast)' }} />
      </span>
    );
  }
  if (status === 'running') {
    return <Loader2 className="w-4 h-4 shrink-0 animate-spin" style={{ color: 'var(--accent-teal)' }} aria-hidden />;
  }
  if (status === 'failed') {
    return <AlertCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--error)' }} aria-hidden />;
  }
  return (
    <span
      className="w-4 h-4 rounded-full border-[1.5px] shrink-0"
      style={{ borderColor: 'var(--text-disabled)' }}
      aria-hidden
    />
  );
}

/**
 * One of the two phase pills. The tint behind the label fills left to right with the
 * phase's progress; the chevron opens that phase's steps. `action` replaces the time
 * with a button when the phase is waiting on the user (e.g. "Run annotation").
 */
function PhasePill({ label, status, fillPct, ms, open, onToggle, action, waitingLabel }) {
  const time = ms >= 1000 ? formatDuration(ms) : null;
  const dim = status === 'pending';
  return (
    <div
      className="relative flex-1 min-w-0 flex items-center rounded-full border overflow-hidden"
      style={{
        borderColor: open
          ? 'var(--accent-teal)'
          : status === 'failed'
            ? 'var(--error)'
            : 'var(--border-default)',
        borderStyle: dim && action ? 'dashed' : 'solid',
        backgroundColor: 'var(--bg-surface)',
      }}
    >
      <span
        className="absolute inset-y-0 left-0 transition-[width] duration-300"
        style={{ width: `${Math.max(0, Math.min(100, fillPct ?? 0))}%`, backgroundColor: 'var(--accent-teal-soft)' }}
        aria-hidden
      />
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="relative flex-1 min-w-0 flex items-center gap-2 pl-2.5 pr-2 py-1.5 text-left"
      >
        <PhaseMark status={status} />
        <span
          className="flex-1 min-w-0 truncate text-xs font-medium"
          style={{ color: dim ? 'var(--text-tertiary)' : 'var(--text-primary)' }}
        >
          {label}
        </span>
        {!action && (
          <span className="text-2xs tabular-nums shrink-0" style={{ color: 'var(--text-tertiary)' }}>
            {time || (dim ? waitingLabel : '')}
          </span>
        )}
        {!action && (
          <span className="shrink-0 flex items-center" style={{ color: 'var(--text-tertiary)' }}>
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </span>
        )}
      </button>
      {action && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? 'Hide steps' : 'Show steps'}
          className="relative shrink-0 flex items-center px-1"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="relative shrink-0 mr-1 px-2 py-0.5 rounded-full text-2xs font-medium border transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)]"
          style={{ borderColor: 'var(--accent-teal)', color: 'var(--accent-teal)' }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
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

  useEffect(() => {
    if (pgxOnlyScope) expandRef.current?.(true);
  }, [pgxOnlyScope]);

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
    // Chip + CTA already say the next step (e.g. Needs annotation / Run annotation).
    if (gatedAction) return null;
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

  /* ── Phase 1: Reads → VCF (FASTQ) or VCF uploaded ─────────────────────────────── */
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
  const module1Order = MODULE1_STAGE_GROUPS.map((g) => g.id);
  const module1GroupStatus = (groupId) => {
    if (module1Done) return 'done';
    const idx = module1Order.indexOf(groupId);
    const activeIdx = module1Order.indexOf(module1ActiveGroup);
    if (module1Failed) return idx <= activeIdx ? 'failed' : 'pending';
    if (idx < activeIdx) return 'done';
    if (idx === activeIdx) return 'running';
    return 'pending';
  };

  const phase1 = isFastqRoute
    ? {
        label: 'Reads → VCF',
        status: module1Failed ? 'failed' : module1Done ? 'done' : 'running',
        fillPct: module1Done
          ? 100
          : typeof module1Job.progressPercent === 'number'
            ? module1Job.progressPercent
            : 0,
        ms: timerMs(module1Timer),
      }
    : {
        label: 'VCF uploaded',
        status: steps.upload === 'done' ? 'done' : steps.upload === 'running' ? 'running' : 'pending',
        fillPct: steps.upload === 'done' ? 100 : uploadInProgress ? (uploadProgress ?? 0) : 0,
        ms: timerMs(stepTimers.upload),
      };

  /* ── Phase 2: Annotated & ready ───────────────────────────────────────────────── */
  const analysisStatuses = ANALYSIS_STEP_DEFS.map((def) => steps[def.id]);
  const analysisPassed = analysisStatuses.filter(isStepPassed).length;
  const analysisRunning = analysisStatuses.some((st) => st === 'running');
  const phase2Status = !hasUploadedFile || uploadInProgress
    ? 'pending'
    : failed || analysisStatuses.includes('failed')
      ? 'failed'
      : busy || analysisRunning
        ? 'running'
        : chatReady && !pgxOnlyScope
          ? 'done'
          : analysisPassed > 0
            ? 'waiting'
            : 'pending';
  // Steps advance in lumps, so the tint moves a quarter per step plus the running
  // step's own percentage where the backend reports one.
  const phase2FillPct =
    phase2Status === 'done'
      ? 100
      : ((analysisPassed + (analysisRunning && progressPct != null ? progressPct / 100 : 0)) /
          ANALYSIS_STEP_DEFS.length) *
        100;
  const phase2Ms =
    ['interpret', 'annovar', 'reduce'].reduce((sum, id) => sum + timerMs(stepTimers[id]), 0) +
    timerMs(enrichmentTimer) +
    timerMs(indexingTimer);
  // A next step the user has to start lives on the pill itself, not in a second row.
  const phase2Action =
    hasUploadedFile && !busy && !failed && gatedAction && !showGuestFilterCta ? gatedAction : null;

  /* ── Which phase's steps are open ─────────────────────────────────────────────
   * Phase 2 is `expanded` (owned by the page). Phase 1 opens by itself while the reads
   * are processing or have failed, until the user says otherwise. One at a time.
   */
  const [phase1Intent, setPhase1Intent] = useState(null); // null | 'open' | 'closed'
  const phase1Auto = isFastqRoute && !module1Done && (module1Running || module1Failed);
  useEffect(() => {
    setPhase1Intent(null);
  }, [module1Job?.jobId]);
  const phase1Open = !expanded && (phase1Intent ? phase1Intent === 'open' : phase1Auto);
  const togglePhase1 = () => {
    const next = !phase1Open;
    setPhase1Intent(next ? 'open' : 'closed');
    if (next && expanded) {
      userIntentRef.current = 'closed';
      onExpandedChange?.(false);
    }
  };
  const togglePhase2 = () => {
    if (!expanded) setPhase1Intent('closed');
    toggle();
  };

  /* ── Header ───────────────────────────────────────────────────────────────────── */
  const title = (isFastqRoute ? module1Job.sampleName : null) || displayName;
  const header = (() => {
    if (module1Failed) {
      // The full error sits in the red box below; the header only names the state.
      return { text: 'Pipeline failed', loading: false, color: 'var(--error)' };
    }
    if (isFastqRoute && !hasUploadedFile) {
      if (module1Job.status === 'complete') return { text: 'Importing VCF…', loading: true };
      const group = MODULE1_STAGE_GROUPS.find((g) => g.id === module1ActiveGroup);
      const pct = typeof module1Job.progressPercent === 'number' ? ` · ${Math.round(module1Job.progressPercent)}%` : '';
      return { text: `${group?.label || 'Processing'}…${pct}`, loading: true };
    }
    return { text: stateText, loading: stateLoading, color: stateColor };
  })();

  // The plain "Chat is enabled (n variants…)" line repeats the header once chat is ready.
  const showDetail = Boolean(detailText) && !(chatReady && !busy && !failed && detailText === statusLine);

  return (
    <section className="pipeline-drawer" aria-label="Analysis pipeline">
      <div className="px-3.5 pt-2.5 pb-1 space-y-2">
        <div className="flex items-center gap-2 min-w-0">
          {isFastqRoute ? (
            <Dna className="w-3.5 h-3.5 shrink-0" style={{ color: module1Failed ? 'var(--error)' : 'var(--accent-teal)' }} aria-hidden />
          ) : (
            <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent-teal)' }} aria-hidden />
          )}
          <span className="text-xs font-medium truncate min-w-0" style={{ color: 'var(--text-primary)' }} title={title}>
            {title}
          </span>
          <span
            className={`ml-auto text-2xs truncate shrink min-w-0 text-right${header.loading ? ' pipeline-status-shimmer' : ''}`}
            style={header.loading ? undefined : { color: header.color || 'var(--text-tertiary)' }}
            aria-live="polite"
          >
            {header.text}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-0">
          <PhasePill
            label={phase1.label}
            status={phase1.status}
            fillPct={phase1.fillPct}
            ms={phase1.ms}
            open={phase1Open}
            onToggle={togglePhase1}
            waitingLabel="—"
          />
          <span
            className="hidden sm:block w-5 h-px shrink-0"
            style={{ backgroundColor: phase1.status === 'done' ? 'var(--accent-teal)' : 'var(--border-default)' }}
            aria-hidden
          />
          <PhasePill
            label="Annotated & ready"
            status={phase2Status}
            fillPct={phase2FillPct}
            ms={phase2Ms}
            open={expanded}
            onToggle={togglePhase2}
            action={phase2Action}
            waitingLabel={phase1.status === 'done' ? 'Not started' : 'After VCF'}
          />
        </div>

        <AnimatePresence initial={false} mode="wait">
          {(phase1Open || expanded) && (
            <motion.div
              key={expanded ? 'phase2' : 'phase1'}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              // The collapse is faster than the expand: opening is the user asking to read
              // something, closing is the interface getting out of the way.
              exit={{
                height: 0,
                opacity: 0,
                transition: reduceMotion ? { duration: 0 } : { duration: 0.15, ease: [0.23, 1, 0.32, 1] },
              }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              className="overflow-hidden"
            >
              {expanded ? (
                <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 py-0.5 w-full">
                  {ANALYSIS_STEP_DEFS.map((def, index) => {
                    const status = steps[def.id];
                    const isLast = index === ANALYSIS_STEP_DEFS.length - 1;
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
                        className={`flex items-center${isLast ? '' : ' flex-1'}`}
                      >
                        <button
                          type="button"
                          disabled={guestLocked}
                          onClick={() => handleStepClick(def.id)}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-[10px] text-2xs sm:text-xs shrink-0 transition-colors ${
                            clickable ? 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05] cursor-pointer' : 'cursor-default opacity-60'
                          }`}
                          style={{
                            ...stepTextStyle(status, guestLocked),
                            ...(running ? { backgroundColor: 'var(--accent-teal-soft)' } : null),
                          }}
                          title={guestLocked ? 'Sign in for full analysis' : `View ${def.label}`}
                        >
                          <StepGlyph status={status} locked={guestLocked} />
                          <span>{def.shortLabel || def.label}</span>
                          {stepTimers[def.id] && !guestLocked && (
                            <RunTimer
                              running={status === 'running'}
                              elapsedMs={stepTimers[def.id].elapsedMs}
                              durationMs={status === 'running' ? null : stepTimers[def.id].durationMs}
                              startMs={stepTimers[def.id].startMs}
                              className="text-2xs font-normal whitespace-nowrap"
                              style={{ color: 'var(--text-tertiary)' }}
                            />
                          )}
                        </button>
                        {!isLast && (
                          <span
                            className="h-px flex-1 min-w-[0.75rem] mx-2 shrink-0"
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
              ) : isFastqRoute ? (
                <ol className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-1 px-1">
                  {MODULE1_STEP_GROUPS.map((group) => {
                    const status = module1GroupStatus(group.id);
                    return (
                      <li
                        key={group.id}
                        className="flex items-center gap-1.5 text-2xs sm:text-xs"
                        style={stepTextStyle(status === 'running' ? 'running' : status, false)}
                      >
                        <StepGlyph status={status} />
                        {group.label}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <ol className="flex items-center gap-1.5 py-1 px-1 text-2xs sm:text-xs" style={stepTextStyle(steps.upload, false)}>
                  <li className="flex items-center gap-1.5">
                    <StepGlyph status={steps.upload} />
                    Upload
                    <RunTimer
                      running={steps.upload === 'running'}
                      elapsedMs={stepTimers.upload.elapsedMs}
                      durationMs={steps.upload === 'running' ? null : stepTimers.upload.durationMs}
                      startMs={stepTimers.upload.startMs}
                      className="text-2xs font-normal"
                      style={{ color: 'var(--text-tertiary)' }}
                    />
                  </li>
                </ol>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {module1Failed && (
          <div
            className="p-2.5 rounded-lg border flex items-start justify-between gap-3"
            style={{ backgroundColor: 'var(--error-soft)', borderColor: 'var(--error)' }}
          >
            <span className="text-xs" style={{ color: 'var(--error)' }}>
              {module1Job.error || module1Job.message || 'The pipeline did not complete successfully.'}
            </span>
            {onModule1StartOver && (
              <button
                type="button"
                onClick={onModule1StartOver}
                className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border"
                style={{ borderColor: 'var(--error)', color: 'var(--error)' }}
              >
                Start over
              </button>
            )}
          </div>
        )}

        {hasUploadedFile && (showDetail || (gatedAction && !phase2Action && !showGuestFilterCta)) && (
          <div className="flex items-start gap-2">
            {showDetail ? (
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
            {gatedAction && !phase2Action && !showGuestFilterCta && (
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
        )}

        {guestPipelineCta?.message && (
          <div className="flex flex-col gap-2 px-0.5 sm:flex-row sm:items-center sm:justify-between">
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
          <div className="flex justify-end px-0.5">
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

        {/* QC report, then the file's badge and actions — destructive ones live here. */}
        {isFastqRoute && module1HasQcArtifacts(module1Job) && <Module1QcSection job={module1Job} />}
        {hasUploadedFile && (showAnnotatedBadge || (!isGuest && onEditSampleInfo) || onRemoveFile) && (
          <div className="flex items-center gap-1.5 min-w-0">
            {isFastqRoute && (
              <span className="text-2xs truncate min-w-0" style={{ color: 'var(--text-tertiary)' }} title={displayName}>
                {displayName}
              </span>
            )}
            {showAnnotatedBadge && (
              <span
                className="inline-flex items-center px-1.5 h-[18px] rounded-full text-2xs font-medium uppercase tracking-wide shrink-0"
                style={{ backgroundColor: 'var(--accent-teal-soft)', color: 'var(--accent-teal)' }}
                title={
                  hasAnnotatedFile
                    ? 'Annotations added by Geneie'
                    : 'This VCF already contains annotations'
                }
              >
                Annotated
              </span>
            )}
            <div className="ml-auto flex items-center gap-0.5 shrink-0">
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
