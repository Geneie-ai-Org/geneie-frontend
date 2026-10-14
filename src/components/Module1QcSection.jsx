import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronDown, FileText } from 'lucide-react';
import Module1QcPanel from '@/components/Module1QcPanel';
import Module1IgvPanel from '@/components/Module1IgvPanel';
import Module1QcReportPanel from '@/components/Module1QcReportPanel';

const EASE = [0.23, 1, 0.32, 1];

export function module1HasQcArtifacts(job) {
  return Boolean(job?.conversationId) && Boolean(job.hasQc || job.hasBam || job.bamQcPurged);
}

/**
 * QC / alignment browser / saved report for a Module 1 (FASTQ) run, behind one control.
 * Default closed so the reports don't dominate the composer area once the run finishes.
 */
export default function Module1QcSection({ job }) {
  const [qcOpen, setQcOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  if (!module1HasQcArtifacts(job)) return null;

  const qcButtonBits = [
    job.hasQc ? 'live reports' : null,
    job.hasBam ? 'alignment browser' : null,
    job.hasQc || job.hasBam || job.bamQcPurged ? 'saved report' : null,
  ].filter(Boolean);

  return (
    <div>
      <button
        type="button"
        onClick={() => setQcOpen((v) => !v)}
        aria-expanded={qcOpen}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-left"
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
              {qcOpen ? 'Hide reports and browser' : `Open ${qcButtonBits.join(' · ')}`}
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
            // Opacity-only: height:auto + overflow:hidden locks a measured height before
            // async QC/JBrowse content mounts, which clips the panel and kills pan/zoom.
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{
              opacity: 0,
              transition: reduceMotion ? { duration: 0 } : { duration: 0.12, ease: EASE },
            }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: EASE }}
            className="max-h-[min(50vh,480px)] overflow-y-auto overscroll-contain"
          >
            {job.hasQc && <Module1QcPanel conversationId={job.conversationId} hasQc={job.hasQc} />}

            {job.hasBam && (
              <Module1IgvPanel conversationId={job.conversationId} hasBam={job.hasBam} genome={job.genome} />
            )}

            <Module1QcReportPanel
              conversationId={job.conversationId}
              visible
              hideBrowserSnapshots={Boolean(job.hasBam)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
