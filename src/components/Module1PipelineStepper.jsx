import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertCircle, Check, ChevronDown, Dna, Loader2 } from 'lucide-react';
import { MODULE1_STAGE_GROUPS, getModule1PhaseMessage, getModule1StageGroup } from '@/lib/module1PipelinePhases';

const EASE = [0.23, 1, 0.32, 1];

function nodeStatus(groupId, activeGroupId, failed, groupOrder) {
  if (failed) return groupOrder.indexOf(groupId) <= groupOrder.indexOf(activeGroupId) ? 'failed' : 'pending';
  const activeIdx = groupOrder.indexOf(activeGroupId);
  const idx = groupOrder.indexOf(groupId);
  if (idx < activeIdx) return 'done';
  if (idx === activeIdx) return 'running';
  return 'pending';
}

/**
 * Sticky chip for the Module 1 (FASTQ) long-running job — modeled visually on
 * VariantAnalysisPipeline's chip-that-expands, but driven by the 9-phase Module 1
 * job model rather than the ANNOVAR/filter step model.
 */
const Module1PipelineStepper = ({ job, onStartOver }) => {
  const [expanded, setExpanded] = useState(true);
  const reduceMotion = useReducedMotion();
  if (!job) return null;

  const groupOrder = MODULE1_STAGE_GROUPS.map((g) => g.id);
  const failed = job.status === 'failed';
  const activeGroupId = failed ? getModule1StageGroup(job.phase) : getModule1StageGroup(job.phase);
  const phaseMessage = getModule1PhaseMessage(job.phase, job.message);
  const pct = typeof job.progressPercent === 'number' ? Math.max(0, Math.min(100, Math.round(job.progressPercent))) : null;

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
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            // Collapse is quicker than expand, matching PipelineDrawer: opening is a
            // request to read, closing is the interface getting out of the way. The exit
            // timing must ride on `exit` itself — AnimatePresence replays the element's
            // last props, so a `transition` branching on `expanded` never sees false.
            exit={{
              height: 0,
              opacity: 0,
              transition: reduceMotion ? { duration: 0 } : { duration: 0.15, ease: EASE },
            }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3">
              <div className="flex items-center justify-between">
                {MODULE1_STAGE_GROUPS.map((group, i) => {
                  const status = nodeStatus(group.id, activeGroupId, failed, groupOrder);
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
                          {status === 'done' && <Check className="w-3 h-3" style={{ color: '#0F0F0F' }} />}
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

export default Module1PipelineStepper;
