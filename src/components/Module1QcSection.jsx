import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import Module1QcPanel from '@/components/Module1QcPanel';
import Module1IgvPanel from '@/components/Module1IgvPanel';
import Module1QcReportPanel from '@/components/Module1QcReportPanel';
import { cn } from '@/lib/utils';

const EASE = [0.23, 1, 0.32, 1];

export function module1HasQcArtifacts(job) {
  return Boolean(job?.conversationId) && Boolean(job.hasQc || job.hasBam || job.bamQcPurged);
}

/**
 * QC / alignment browser / saved report for a Module 1 (FASTQ) run.
 *
 * `variant="card"` (default): one collapsed row inside the job card, closed so the reports don't
 * dominate the composer area once the run finishes.
 * `variant="panel"`: plain content for a workspace tab. Always open, fills its parent
 * (`h-full min-h-0 flex flex-col`) and scrolls its own body; no border, no fixed width.
 */
export default function Module1QcSection({ job, variant = 'card' }) {
  const [qcOpen, setQcOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  if (!module1HasQcArtifacts(job)) return null;

  const qcButtonBits = [
    job.hasQc ? 'reports' : null,
    job.hasBam ? 'alignment browser' : null,
    job.hasQc || job.hasBam || job.bamQcPurged ? 'saved summary' : null,
  ].filter(Boolean);

  const sections = (
    <div className="space-y-5">
      {job.hasQc && <Module1QcPanel conversationId={job.conversationId} hasQc={job.hasQc} />}

      {job.hasBam && (
        <Module1IgvPanel
          conversationId={job.conversationId}
          hasBam={job.hasBam}
          genome={job.genome}
          variant={variant === 'panel' ? 'panel' : 'card'}
        />
      )}

      <Module1QcReportPanel
        conversationId={job.conversationId}
        visible
        hideBrowserSnapshots={Boolean(job.hasBam)}
      />
    </div>
  );

  if (variant === 'panel') {
    return (
      <section aria-label="QC and alignment" className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{sections}</div>
      </section>
    );
  }

  return (
    <div className="border-t border-border pt-1">
      <button
        type="button"
        onClick={() => setQcOpen((v) => !v)}
        aria-expanded={qcOpen}
        className="-mx-1.5 flex min-h-9 w-[calc(100%+0.75rem)] items-center gap-1.5 rounded-md px-1.5 text-left text-xs font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/55"
      >
        <ChevronRight
          className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none', qcOpen && 'rotate-90')}
          aria-hidden
        />
        <span>QC and alignment</span>
        <span className="min-w-0 flex-1 truncate text-2xs font-normal text-muted-foreground">
          {qcOpen ? '' : qcButtonBits.join(' · ')}
        </span>
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
            className="max-h-[min(50vh,480px)] overflow-y-auto overscroll-contain pt-3"
          >
            {sections}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
