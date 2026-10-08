import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertCircle, Check, ChevronDown, Dna, FileText, Loader2 } from 'lucide-react';
import { MODULE1_STAGE_GROUPS, getModule1PhaseMessage, getModule1StageGroup } from '@/lib/module1PipelinePhases';
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

/**
 * Sticky chip for the Module 1 (FASTQ) long-running job — modeled visually on
 * VariantAnalysisPipeline's chip-that-expands, but driven by the 9-phase Module 1
 * job model rather than the ANNOVAR/filter step model.
 */
const Module1PipelineStepper = ({ job, onStartOver }) => {
  const [expanded, setExpanded] = useState(true);
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
  if (!job) return null;

  const groupOrder = MODULE1_STAGE_GROUPS.map((g) => g.id);
  const failed = job.status === 'failed';
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
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 min-h-[40px] text-left"
      >
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--accent-teal-soft)' }}>
          {failed ? (
            <AlertCircle className="w-4 h-4" style={{ color: 'var(--error)' }} />
          ) : (
            <Dna className="w-4 h-4" style={{ color: 'var(--accent-teal)' }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
            {job.sampleName || 'Raw sequencing pipeline'}
          </p>
          <p className="text-2xs truncate" style={{ color: failed ? 'var(--error)' : 'var(--text-tertiary)' }}>
            {failed ? job.error || job.message || 'The pipeline did not complete.' : phaseMessage}
            {pct != null && !failed ? ` · ${pct}%` : ''}
            <RunTimer
              running={timer.running}
              elapsedMs={timer.elapsedMs}
              durationMs={timer.durationMs}
              startMs={timer.startMs}
              prefix=" · "
            />
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

      <AnimatePresence initial={false}>
        {expanded && (
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
