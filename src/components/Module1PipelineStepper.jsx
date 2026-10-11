import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertCircle, Check, ChevronDown, CircleSlash, Dna, FileText, Loader2 } from 'lucide-react';
import { MODULE1_STAGE_GROUPS, getModule1PhaseMessage, getModule1StageGroup } from '@/lib/module1PipelinePhases';
import { MODULE1_CPU_TYPICAL_MIN, formatMinutesRange } from '@/components/Module1ComputeChoice';
import RunTimer from '@/components/ui/RunTimer';
import { useRunTimer } from '@/hooks/useRunTimer';
import Module1QcPanel from '@/components/Module1QcPanel';
import Module1IgvPanel from '@/components/Module1IgvPanel';
import Module1QcReportPanel from '@/components/Module1QcReportPanel';

const EASE = [0.23, 1, 0.32, 1];

function nodeStatus(groupId, activeGroupId, failed, groupOrder, finishedOk) {
  if (finishedOk) return 'done';
  if (failed) return groupOrder.indexOf(groupId) <= groupOrder.indexOf(activeGroupId) ? 'failed' : 'pending';
  const activeIdx = groupOrder.indexOf(activeGroupId);
  const idx = groupOrder.indexOf(groupId);
  if (idx < activeIdx) return 'done';
  if (idx === activeIdx) return 'running';
  return 'pending';
}

/** Pipeline + VCF ingest landed — don't leave the Complete node spinning forever. */
function module1FinishedSuccessfully(job) {
  if (!job || job.status !== 'complete') return false;
  if (job.ingestStatus === 'done') return true;
  const msg = String(job.message || '');
  const pctOk = typeof job.progressPercent === 'number' && job.progressPercent >= 100;
  return pctOk && /(pass\s+)?vcf\s+ready/i.test(msg);
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
    return { label: 'CPU (no GPU available)', amber: true };
  }
  const lane = jobLane(job);
  if (!lane) return null;
  return { label: lane === 'gpu' ? 'GPU' : 'CPU', amber: false };
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

const SECONDARY_BUTTON_CLASS =
  'shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)]';

/**
 * Sticky chip for the Module 1 (FASTQ) long-running job — modeled visually on
 * VariantAnalysisPipeline's chip-that-expands, but driven by the 9-phase Module 1
 * job model rather than the ANNOVAR/filter step model.
 */
const Module1PipelineStepper = ({ job, onStartOver, onCancel, onSwitchCompute, cpuEstimateMin = null }) => {
  const [expanded, setExpanded] = useState(true);
  // Inline confirm for Leave queue / Stop run ('leave' | 'stop' | null), and which request is in flight.
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(null); // 'cancel' | 'switch' | null
  const headerButtonRef = useRef(null);
  const confirmTriggerRef = useRef(null);
  const confirmSafeRef = useRef(null);
  // Where focus goes when the confirm closes: the Leave/Stop trigger, or the header once the
  // run is gone and the trigger no longer renders.
  const restoreFocusRef = useRef(null); // 'trigger' | 'header' | null
  // QC / browser / saved report stay behind a single control — default closed so the
  // drawer does not dominate the composer area after Module 1 finishes.
  const [qcOpen, setQcOpen] = useState(false);
  const reduceMotion = useReducedMotion();
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
  const confirmOpen = Boolean(confirm);
  useEffect(() => {
    // Opening the confirm moves focus to the safe choice; closing it returns focus to the trigger.
    if (confirmOpen) {
      confirmSafeRef.current?.focus();
    } else if (restoreFocusRef.current) {
      const target = restoreFocusRef.current === 'trigger' ? confirmTriggerRef.current : null;
      restoreFocusRef.current = null;
      (target || headerButtonRef.current)?.focus();
    }
  }, [confirmOpen]);

  if (!job) return null;

  const groupOrder = MODULE1_STAGE_GROUPS.map((g) => g.id);
  const failed = job.status === 'failed';
  const cancelled = job.status === 'cancelled';
  const cancelling = !cancelled && job.phase === 'cancelling';
  const queued = !failed && !cancelled && !cancelling && (job.status === 'queued' || job.phase === 'waiting_gpu');
  const running = !failed && !cancelled && !cancelling && !queued && job.status === 'running';
  const lane = jobLane(job);
  const chip = computeChip(job);
  const finishedOk = module1FinishedSuccessfully(job);
  const activeGroupId = failed ? getModule1StageGroup(job.phase) : getModule1StageGroup(job.phase);
  const phaseMessage = finishedOk
    ? (job.message || 'Module 1 complete — VCF is in this conversation.').replace(
        /PASS\s+VCF\s+ready\.?/i,
        'VCF Ready'
      )
    : getModule1PhaseMessage(job.phase, job.message);
  const pct = typeof job.progressPercent === 'number' ? Math.max(0, Math.min(100, Math.round(job.progressPercent))) : null;
  const hasQcArtifacts =
    Boolean(job.conversationId) &&
    Boolean(job.hasQc || job.hasBam || job.bamQcPurged);
  const startText = formatMinutesRange(job.estStartMin);
  const hasQueueInfo = job.queuePosition != null;
  const queueLine = queued && hasQueueInfo
    ? [
        lane === 'cpu' ? 'Waiting for a CPU slot' : 'Waiting for a GPU',
        `#${job.queuePosition}${job.queueLength != null ? ` of ${job.queueLength}` : ''} in line`,
        startText ? `est. start in ${startText}` : null,
      ].filter(Boolean).join(' · ')
    : null;
  let statusLine;
  if (cancelled) statusLine = 'Cancelled · you can start again from the upload button.';
  else if (cancelling) statusLine = 'Stopping your run…';
  else if (failed) statusLine = job.error || job.message || 'The pipeline did not complete.';
  else if (queueLine) statusLine = queueLine;
  else if (running && lane) statusLine = `Running on ${lane === 'gpu' ? 'GPU' : 'CPU'} · ${phaseMessage}`;
  else statusLine = phaseMessage;
  const showPct = pct != null && !failed && !cancelled && !cancelling && !queueLine;
  const showTimer = !cancelled && !cancelling;

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

  const qcButtonBits = [
    job.hasQc ? 'live reports' : null,
    job.hasBam ? 'alignment browser' : null,
    job.hasQc || job.hasBam || job.bamQcPurged ? 'saved report' : null,
  ].filter(Boolean);

  return (
    <section
      className="relative mb-2 rounded-xl border overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: failed ? 'var(--error)' : 'var(--border-strong)',
        boxShadow: 'var(--shadow-sm)',
      }}
      aria-label="Module 1 raw sequencing pipeline"
    >
      <button
        ref={headerButtonRef}
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 min-h-[40px] text-left"
      >
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--accent-teal-soft)' }}>
          {failed ? (
            <AlertCircle className="w-4 h-4" style={{ color: 'var(--error)' }} />
          ) : cancelled ? (
            <CircleSlash className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          ) : (
            <Dna className="w-4 h-4" style={{ color: 'var(--accent-teal)' }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {job.sampleName || 'Raw sequencing pipeline'}
            </p>
            {chip && !cancelled && !failed && (
              <span
                className="shrink-0 text-2xs font-semibold px-1.5 h-[18px] inline-flex items-center rounded-full"
                style={chip.amber
                  ? { backgroundColor: 'var(--warning-soft)', color: 'var(--warning)' }
                  : { backgroundColor: 'var(--accent-teal-soft)', color: 'var(--accent-teal)' }}
              >
                {chip.label}
              </span>
            )}
          </div>
          <p className="text-2xs truncate" style={{ color: failed ? 'var(--error)' : 'var(--text-tertiary)' }}>
            {statusLine}
            {showPct ? ` · ${pct}%` : ''}
            {showTimer && (
              <RunTimer
                running={timer.running}
                elapsedMs={timer.elapsedMs}
                durationMs={timer.durationMs}
                startMs={timer.startMs}
                prefix=" · "
              />
            )}
          </p>
        </div>
        {/* One rotating chevron rather than two swapped glyphs — the rotation is the
          * same gesture as the panel opening, so the two read as one movement. */}
        <motion.span
          className="shrink-0 flex items-center"
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: EASE }}
        >
          <ChevronDown className="w-4 h-4" />
        </motion.span>
      </button>
      <span className="sr-only" aria-live="polite">{liveAnnouncement}</span>

      <AnimatePresence initial={false}>
        {expanded && !cancelled && (
          <motion.div
            key="body"
            // Opacity-only: height:auto + overflow:hidden locks a measured height before
            // async QC/JBrowse content mounts, which clips the panel and kills pan/zoom.
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{
              opacity: 0,
              transition: reduceMotion ? { duration: 0 } : { duration: 0.12, ease: EASE },
            }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: EASE }}
          >
            <div className="px-3 pb-3">
              <div className="flex items-center justify-between">
                {MODULE1_STAGE_GROUPS.map((group, i) => {
                  const status = nodeStatus(group.id, activeGroupId, failed, groupOrder, finishedOk);
                  return (
                    <React.Fragment key={group.id}>
                      {i > 0 && (
                        <div
                          className="flex-1 h-px mx-1"
                          style={{ backgroundColor: status === 'pending' ? 'var(--border-subtle)' : 'var(--accent-teal)' }}
                        />
                      )}
                      <div className="flex flex-col items-center gap-1">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center border"
                          style={{
                            borderColor: status === 'failed' ? 'var(--error)' : status === 'pending' ? 'var(--border-subtle)' : 'var(--accent-teal)',
                            backgroundColor: status === 'done' ? 'var(--accent-teal)' : 'transparent',
                          }}
                        >
                          {status === 'done' && <Check className="w-3 h-3" style={{ color: 'var(--accent-teal-contrast)' }} />}
                          {status === 'running' && <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--accent-teal)' }} />}
                          {status === 'failed' && <AlertCircle className="w-3 h-3" style={{ color: 'var(--error)' }} />}
                        </div>
                        <span className="text-2xs" style={{ color: status === 'pending' ? 'var(--text-tertiary)' : 'var(--text-secondary)' }}>
                          {group.label}
                        </span>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>

              {failed && (
                <div className="mt-3 p-3 rounded-lg border flex items-start justify-between gap-3" style={{ backgroundColor: 'var(--error-soft)', borderColor: 'var(--error)' }}>
                  <span className="text-xs" style={{ color: 'var(--error)' }}>
                    {job.error || job.message || 'The pipeline did not complete successfully.'}
                  </span>
                  {onStartOver && (
                    <button
                      type="button"
                      onClick={onStartOver}
                      className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border"
                      style={{ borderColor: 'var(--error)', color: 'var(--error)' }}
                    >
                      Start over
                    </button>
                  )}
                </div>
              )}

              {(showQueuePanel || showRunPanel) && (
                <div
                  className="mt-3 p-3 rounded-lg border"
                  style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                >
                  {confirmCopy ? (
                    <div
                      role="group"
                      aria-labelledby="module1-confirm-question"
                      onKeyDown={(e) => {
                        if (e.key === 'Escape' && !busy) {
                          e.stopPropagation();
                          closeConfirm();
                        }
                      }}
                    >
                      <p id="module1-confirm-question" className="text-xs" style={{ color: 'var(--text-primary)' }}>
                        {confirmCopy.question}
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
                        <button
                          ref={confirmSafeRef}
                          type="button"
                          onClick={closeConfirm}
                          disabled={busy === 'cancel'}
                          className={SECONDARY_BUTTON_CLASS}
                          style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
                        >
                          {confirmCopy.keep}
                        </button>
                        <button
                          type="button"
                          onClick={runCancel}
                          disabled={busy === 'cancel'}
                          className={SECONDARY_BUTTON_CLASS}
                          style={{ borderColor: 'var(--error)', color: 'var(--error)' }}
                        >
                          {busy === 'cancel' && <Loader2 className="w-3 h-3 animate-spin" />}
                          {confirmCopy.confirm}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {showQueuePanel && (
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          Your place is kept if you close this tab. We&apos;ll notify you when it starts and when it finishes.
                        </p>
                      )}
                      {(canSwitch || canCancel) && (
                        <div className={`${showQueuePanel ? 'mt-2.5 ' : ''}flex flex-wrap items-center justify-end gap-2`}>
                          {canSwitch && lane !== 'cpu' && (
                            <span className="mr-auto text-2xs" style={{ color: 'var(--text-tertiary)' }}>
                              CPU starts now and takes about {cpuText}.
                            </span>
                          )}
                          {canSwitch && (
                            <button
                              type="button"
                              onClick={() => runSwitch(lane === 'cpu' ? 'gpu' : 'cpu')}
                              disabled={Boolean(busy)}
                              className={SECONDARY_BUTTON_CLASS}
                              style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                            >
                              {busy === 'switch' && <Loader2 className="w-3 h-3 animate-spin" />}
                              {lane === 'cpu' ? 'Wait for GPU instead' : 'Switch to CPU now'}
                            </button>
                          )}
                          {canCancel && (
                            <button
                              ref={confirmTriggerRef}
                              type="button"
                              onClick={() => setConfirm(confirmMode)}
                              disabled={Boolean(busy)}
                              className={SECONDARY_BUTTON_CLASS}
                              style={{ borderColor: 'var(--border-default)', color: 'var(--error)' }}
                            >
                              {queued ? 'Leave queue' : 'Stop run'}
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {hasQcArtifacts && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setQcOpen((v) => !v)}
                    aria-expanded={qcOpen}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent-teal)' }} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                          QC & alignment
                        </p>
                        <p className="text-2xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                          {qcOpen
                            ? 'Hide reports and browser'
                            : `Open ${qcButtonBits.join(' · ')}`}
                        </p>
                      </div>
                    </div>
                    <motion.span
                      className="shrink-0 flex items-center"
                      animate={{ rotate: qcOpen ? 180 : 0 }}
                      transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: EASE }}
                    >
                      <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                    </motion.span>
                  </button>

                  <AnimatePresence initial={false}>
                    {qcOpen && (
                      <motion.div
                        key="qc-body"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{
                          opacity: 0,
                          transition: reduceMotion ? { duration: 0 } : { duration: 0.12, ease: EASE },
                        }}
                        transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: EASE }}
                        className="max-h-[min(50vh,480px)] overflow-y-auto overscroll-contain"
                      >
                        {job.hasQc && job.conversationId && (
                          <Module1QcPanel conversationId={job.conversationId} hasQc={job.hasQc} />
                        )}

                        {job.hasBam && job.conversationId && (
                          <Module1IgvPanel
                            conversationId={job.conversationId}
                            hasBam={job.hasBam}
                            genome={job.genome}
                          />
                        )}

                        {(job.bamQcPurged || job.hasQc || job.hasBam) && job.conversationId && (
                          <Module1QcReportPanel
                            conversationId={job.conversationId}
                            visible
                            hideBrowserSnapshots={Boolean(job.hasBam)}
                          />
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

export default Module1PipelineStepper;
