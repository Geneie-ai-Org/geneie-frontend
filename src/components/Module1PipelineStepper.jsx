import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Dna, DoorOpen, RotateCcw } from 'lucide-react';
import {
  MODULE1_STAGE_GROUPS,
  getModule1FailureMessage,
  getModule1PhaseMessage,
  getModule1StageGroup,
  module1FinishedSuccessfully,
} from '@/lib/module1PipelinePhases';
import { MODULE1_CPU_TYPICAL_MIN, formatMinutesRange } from '@/components/Module1ComputeChoice';
import RunTimer from '@/components/ui/RunTimer';
import { useRunTimer } from '@/hooks/useRunTimer';
import { Button } from '@/components/ui/button';
import { Collapse, HoldButton } from '@/components/motion';
import Module1QcSection, { module1HasQcArtifacts } from '@/components/Module1QcSection';
import PipelineJobCard, { ActionButton, BrailleSpinner, splitJobMessage } from '@/components/PipelineJobCard';

function nodeStatus(groupId, activeGroupId, failed, groupOrder, finishedOk) {
  if (finishedOk) return 'done';
  if (failed) {
    // Only the stage that broke is Failed; the ones before it did finish.
    const at = groupOrder.indexOf(activeGroupId);
    const idx = groupOrder.indexOf(groupId);
    return idx < at ? 'done' : idx === at ? 'failed' : 'pending';
  }
  const activeIdx = groupOrder.indexOf(activeGroupId);
  const idx = groupOrder.indexOf(groupId);
  if (idx < activeIdx) return 'done';
  if (idx === activeIdx) return 'running';
  return 'pending';
}

const LANES = new Set(['gpu', 'cpu']);

/** Which lane the job is on or headed for: actual compute, else the user's preference, else the queue lane. */
function jobLane(job) {
  if (LANES.has(job.compute)) return job.compute;
  if (LANES.has(job.computePreference)) return job.computePreference;
  if (LANES.has(job.queueLane)) return job.queueLane;
  return null;
}

/** GPU / CPU / "CPU (no GPU available)" — null when the backend sent no compute info. */
function computeChip(job) {
  if (job.compute === 'cpu' && job.computeReason === 'gpu_capacity_unavailable') {
    return { label: 'CPU (no GPU available)', warn: true };
  }
  const lane = jobLane(job);
  if (!lane) return null;
  return { label: lane === 'gpu' ? 'GPU' : 'CPU', warn: false };
}

const CONFIRM_COPY = {
  leave: {
    question: 'Leave the queue? Your uploaded files stay; you can start again later. Your run credit is not used.',
    keep: 'Keep waiting',
    confirm: 'Leave queue',
  },
  stopGpu: {
    question: 'Stop this run? The GPU machine will be shut down and progress is lost. No run credit is used.',
    keep: 'Keep running',
    confirm: 'Stop run',
  },
  stopCpu: {
    question: 'Stop this run? The CPU job will be stopped and progress is lost. No run credit is used.',
    keep: 'Keep running',
    confirm: 'Stop run',
  },
};

/** Secondary destructive: outline with error-coloured text. Filled red appears only inside the confirm. */
const DESTRUCTIVE_OUTLINE =
  '!text-[var(--error)] hover:!bg-[var(--error-soft)] hover:!text-[var(--error)] hover:!border-[color-mix(in_srgb,var(--error)_35%,transparent)]';

/**
 * The Module 1 (FASTQ) long-running job as one compact job card, driven by the 9-phase Module 1
 * job model rather than the ANNOVAR/filter step model. The status line is a single sentence, the
 * stage list is collapsed until asked for, and Stop run / Leave queue / Switch compute and the
 * failure message stay outside the collapse so they are never hidden.
 *
 * `variant="card"` (default) is the inline card above the composer; `variant="panel"` renders
 * plain, scrolling content for a workspace tab.
 */
const Module1PipelineStepper = ({
  job,
  onStartOver,
  onCancel,
  onSwitchCompute,
  cpuEstimateMin = null,
  variant = 'card',
}) => {
  // Stage list: collapsed until the user opens it. Reset per job.
  const [stepsOpen, setStepsOpen] = useState(false);
  // A failed run opens its stage list so the stage that broke is visible without a click.
  const jobFailed = job?.status === 'failed';
  useEffect(() => {
    setStepsOpen(Boolean(jobFailed));
  }, [job?.jobId, jobFailed]);
  // Inline confirm for Leave queue / Stop run ('leave' | 'stop' | null), and which request is in flight.
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(null); // 'cancel' | 'switch' | null
  const stepsToggleRef = useRef(null);
  const confirmTriggerRef = useRef(null);
  const confirmSafeRef = useRef(null);
  // Where focus goes when the confirm closes: the Leave/Stop trigger, or the steps toggle once the
  // run is gone and the trigger no longer renders.
  const restoreFocusRef = useRef(null); // 'trigger' | 'header' | null
  // This is the long one — hours, not minutes — so it carries its own clock: ticking
  // while the pipeline runs, total once it lands.
  const timer = useRunTimer(
    job?.jobId ? `module1:${job.jobId}` : null,
    job?.status === 'queued' || job?.status === 'running',
    {
      startedAt: job?.startedAt ?? null,
      completedAt: job?.completedAt ?? null,
      durationSeconds: job?.durationSeconds ?? null,
    }
  );
  useEffect(() => {
    // Opening the confirm moves focus to the safe choice; closing it returns focus to the trigger.
    if (confirm) {
      confirmSafeRef.current?.focus();
    } else if (restoreFocusRef.current) {
      const target = restoreFocusRef.current === 'trigger' ? confirmTriggerRef.current : null;
      restoreFocusRef.current = null;
      (target || stepsToggleRef.current)?.focus();
    }
  }, [confirm]);

  if (!job) return null;

  const groupOrder = MODULE1_STAGE_GROUPS.map((g) => g.id);
  const failed = job.status === 'failed';
  const cancelled = job.status === 'cancelled';
  const cancelling = !cancelled && job.phase === 'cancelling';
  // "launching" (GPU box booting) has left the queue even if status still says queued.
  const queued = !failed && !cancelled && !cancelling && job.phase !== 'launching'
    && (job.status === 'queued' || job.phase === 'waiting_gpu');
  const running = !failed && !cancelled && !cancelling && !queued
    && (job.status === 'running' || job.phase === 'launching');
  const lane = jobLane(job);
  const chip = computeChip(job);
  const finishedOk = module1FinishedSuccessfully(job);
  const activeGroupId = getModule1StageGroup(job.phase);
  const pct = typeof job.progressPercent === 'number' ? Math.max(0, Math.min(100, Math.round(job.progressPercent))) : null;
  const hasQcArtifacts = module1HasQcArtifacts(job);
  const startText = formatMinutesRange(job.estStartMin);
  const hasQueueInfo = job.queuePosition != null;
  const queueLine = queued && hasQueueInfo
    ? [
        lane === 'cpu' ? 'Waiting for a CPU slot' : 'Waiting for a GPU',
        `#${job.queuePosition}${job.queueLength != null ? ` of ${job.queueLength}` : ''} in line`,
        startText ? `est. start in ${startText}` : null,
      ].filter(Boolean).join(' · ')
    : null;

  // One status word from one vocabulary. Stopping and importing the result are still "Running".
  const status = failed ? 'failed' : cancelled ? 'cancelled' : finishedOk ? 'done' : queued ? 'queued' : 'running';

  // The backend line carries the phase, the compute and the data residency in one run-on string;
  // the phase is the sentence, the residency becomes a quiet second line.
  const split = splitJobMessage(job.message);
  let statusText;
  if (cancelled) statusText = 'You can start again from the upload button.';
  else if (cancelling) statusText = 'Stopping your run…';
  else if (failed) {
    // What happened (stage, as the card's lead), why (curated message), next step (Start over below).
    statusText = getModule1FailureMessage(job);
  }
  else if (finishedOk) {
    statusText = (job.message || 'Module 1 complete — VCF is in this conversation.').replace(
      /PASS\s+VCF\s+ready\.?/i,
      'VCF ready.'
    );
  } else if (queueLine) statusText = queueLine;
  else statusText = getModule1PhaseMessage(job.phase, split.sentence || undefined);
  const note = !cancelled && !cancelling && !failed && !finishedOk ? split.note : '';
  // Failure card: the stage that broke is the lead, the curated message is the why, Start over is the next step.
  const failTitle = (() => {
    if (!failed) return null;
    const stage = MODULE1_STAGE_GROUPS.find((g) => g.id === activeGroupId);
    const noun = { staging: 'staging', aligning: 'alignment', calling: 'variant calling' }[stage?.id];
    return noun ? `Failed during ${noun}.` : 'The run failed.';
  })();

  const showPct = pct != null && status === 'running' && !cancelling;
  const timerMs = timer.running ? timer.elapsedMs : timer.durationMs;
  const timerNode = !cancelled && !cancelling && timerMs != null && timerMs >= 1000 ? (
    <span className="inline-flex items-center gap-1.5">
      {/* A quiet braille spinner beside the clock while the raw-sequencing run is live. */}
      {running ? <BrailleSpinner /> : null}
      <RunTimer
        running={timer.running}
        elapsedMs={timer.elapsedMs}
        durationMs={timer.durationMs}
        startMs={timer.startMs}
        prefix={timer.running ? 'Elapsed ' : 'Took '}
      />
    </span>
  ) : null;

  // Controls appear only when the backend says they apply, so older backends show none.
  const confirmMode = queued ? 'leave' : running ? 'stop' : null;
  const activeConfirm = confirm && confirm === confirmMode ? confirm : null;
  const confirmCopy = activeConfirm === 'leave'
    ? CONFIRM_COPY.leave
    : activeConfirm === 'stop'
      ? (lane === 'cpu' ? CONFIRM_COPY.stopCpu : CONFIRM_COPY.stopGpu)
      : null;
  const canCancel = job.cancellable === true && confirmMode != null && typeof onCancel === 'function';
  const canSwitch = queued && job.switchable === true && typeof onSwitchCompute === 'function';
  const showQueuePanel = queued && (hasQueueInfo || canCancel || canSwitch);
  const showRunPanel = running && canCancel;
  const cpuText = formatMinutesRange(cpuEstimateMin) || formatMinutesRange(MODULE1_CPU_TYPICAL_MIN);
  // Spoken separately from the visible line so the ticking timer is never announced.
  const liveAnnouncement = cancelled
    ? 'Module 1 run cancelled.'
    : queueLine || (cancelling ? 'Stopping your run.' : '');

  const closeConfirm = () => {
    restoreFocusRef.current = 'trigger';
    setConfirm(null);
  };
  const runCancel = async () => {
    setBusy('cancel');
    let ok = false;
    try {
      ok = await onCancel();
    } finally {
      setBusy(null);
      restoreFocusRef.current = ok ? 'header' : 'trigger';
      setConfirm(null);
    }
  };
  const runSwitch = async (next) => {
    setBusy('switch');
    try {
      await onSwitchCompute(next);
    } finally {
      setBusy(null);
    }
  };

  const steps = cancelled
    ? null
    : MODULE1_STAGE_GROUPS.map((group) => {
        const st = nodeStatus(group.id, activeGroupId, failed, groupOrder, finishedOk);
        // The "Queued" stage while the job is queued is where it is waiting, not a run in progress.
        return { id: group.id, label: group.label, status: st === 'running' && queued ? 'queued' : st };
      });

  const showFailureAction = failed && typeof onStartOver === 'function';
  const showControls = showQueuePanel || showRunPanel;

  // Both branches stay mounted while they trade places (each in its own Collapse), so the confirm's
  // safe button and the Leave/Stop trigger exist by the time the focus effect looks for them. The
  // small padding keeps the focus rings from being clipped by the collapsing container.
  const controls = showControls ? (
    <div>
      <Collapse open={Boolean(confirmCopy)} className="-mx-1 px-1">
        <div
          role="group"
          aria-labelledby="module1-confirm-question"
          className="my-1 rounded-2xl border border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-pill))] p-3"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !busy) {
              e.stopPropagation();
              closeConfirm();
            }
          }}
        >
          <p id="module1-confirm-question" className="m-0 text-[13px] leading-5 text-foreground">
            {confirmCopy?.question}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
            <Button
              ref={confirmSafeRef}
              type="button"
              variant="outline"
              size="sm"
              onClick={closeConfirm}
              disabled={busy === 'cancel'}
              className="max-sm:h-11"
            >
              {confirmCopy?.keep}
            </Button>
            {activeConfirm === 'stop' ? (
              // Stopping a run throws its progress away, so the confirm is press-and-hold.
              <HoldButton tone="danger" doneLabel="Stopping" onConfirm={runCancel} disabled={busy === 'cancel'} className="max-sm:h-11">
                Hold to stop run
              </HoldButton>
            ) : (
              <ActionButton
                state={busy === 'cancel' ? 'running' : 'idle'}
                labels={{ idle: confirmCopy?.confirm, running: confirmCopy?.confirm }}
                icon={DoorOpen}
                variant="destructive"
                size="sm"
                onClick={runCancel}
                disabled={busy === 'cancel'}
                className="max-sm:h-11"
              />
            )}
          </div>
        </div>
      </Collapse>
      <Collapse open={!confirmCopy} className="-mx-1 px-1">
        <div className="space-y-2.5 py-1">
          {showQueuePanel && (
            <p className="m-0 text-xs leading-5 text-muted-foreground">
              Your place is kept if you close this tab. We&apos;ll notify you when it starts and when it finishes.
            </p>
          )}
          {(canSwitch || canCancel) && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {canSwitch && lane !== 'cpu' && (
                <span className="w-full text-xs leading-5 text-muted-foreground">
                  CPU starts now and takes about {cpuText}.
                </span>
              )}
              {canSwitch && (
                <ActionButton
                  state={busy === 'switch' ? 'running' : 'idle'}
                  labels={{ idle: lane === 'cpu' ? 'Wait for GPU instead' : 'Switch to CPU now', running: lane === 'cpu' ? 'Wait for GPU instead' : 'Switch to CPU now' }}
                  icon={ArrowRight}
                  variant="outline"
                  size="sm"
                  onClick={() => runSwitch(lane === 'cpu' ? 'gpu' : 'cpu')}
                  disabled={Boolean(busy)}
                  className="max-sm:h-11"
                />
              )}
              {canCancel && (
                <Button
                  ref={confirmTriggerRef}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirm(confirmMode)}
                  disabled={Boolean(busy)}
                  className={`${DESTRUCTIVE_OUTLINE} max-sm:h-11`}
                >
                  {queued ? 'Leave queue' : 'Stop run'}
                </Button>
              )}
            </div>
          )}
        </div>
      </Collapse>
    </div>
  ) : null;

  return (
    <PipelineJobCard
      variant={variant}
      ariaLabel="Module 1 raw sequencing pipeline"
      title={job.sampleName || 'Raw sequencing pipeline'}
      icon={<Dna className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
      engine={chip}
      status={status}
      statusTitle={failTitle}
      statusText={statusText}
      action={
        showFailureAction ? (
          <ActionButton labels={{ idle: 'Start over' }} icon={RotateCcw} onClick={onStartOver} pulse className="max-sm:h-11" />
        ) : null
      }
      pct={showPct ? pct : null}
      timer={timerNode}
      note={note}
      steps={steps}
      stepsOpen={stepsOpen}
      onStepsToggle={() => setStepsOpen((v) => !v)}
      stepsToggleRef={stepsToggleRef}
      stepsLabel="Steps"
    >
      <span className="sr-only" aria-live="polite">{liveAnnouncement}</span>
      {controls}
      {/* QC / alignment browser / saved report (Module1QcSection), outside the step list so it
        * stays reachable while that list is collapsed. */}
      {hasQcArtifacts && !cancelled && <Module1QcSection job={job} variant={variant === 'panel' ? 'panel' : 'card'} />}
    </PipelineJobCard>
  );
};

export default Module1PipelineStepper;
