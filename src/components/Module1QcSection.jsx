import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { Turn } from '@/components/motion';
import Module1QcPanel from '@/components/Module1QcPanel';
import Module1IgvPanel from '@/components/Module1IgvPanel';
import Module1QcReportPanel from '@/components/Module1QcReportPanel';

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

  const surface = variant === 'panel';
  const sections = (
    <div className={surface ? 'space-y-3' : 'space-y-5'}>
      {job.hasQc && <Module1QcPanel conversationId={job.conversationId} hasQc={job.hasQc} surface={surface} runLabel={job.sampleName} />}

      {job.hasBam && (
        <Module1IgvPanel
          conversationId={job.conversationId}
          hasBam={job.hasBam}
          genome={job.genome}
          variant={variant === 'panel' ? 'panel' : 'card'}
          surface={surface}
        />
      )}

      <Module1QcReportPanel
        conversationId={job.conversationId}
        visible
        hideBrowserSnapshots={Boolean(job.hasBam)}
        surface={surface}
        runLabel={job.sampleName}
      />
    </div>
  );

  if (variant === 'panel') {
    return (
      // Lives inside the job card, whose own body already pads and scrolls: no second inset, no inner scroller.
      <section aria-label="QC and alignment" className="min-w-0">
        <h4 className="wb-card-title mb-2 mt-0 px-0.5">QC and alignment</h4>
        {sections}
      </section>
    );
  }

  return (
    <div className="border-t border-[hsl(var(--wb-line))] pt-2">
      <button
        type="button"
        onClick={() => setQcOpen((v) => !v)}
        aria-expanded={qcOpen}
        className="flex min-h-9 [@media(pointer:coarse)]:min-h-11 w-full items-center gap-1.5 rounded-full px-2.5 text-left text-[13px] font-medium text-foreground outline-none transition-colors duration-150 hover:bg-[hsl(var(--brand-50))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)]"
      >
        <Turn open={qcOpen} className="shrink-0 text-muted-foreground">
          <ChevronRight className="size-3.5" aria-hidden />
        </Turn>
        <span>QC and alignment</span>
        <span className="min-w-0 flex-1 truncate text-xs font-normal text-muted-foreground">
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
