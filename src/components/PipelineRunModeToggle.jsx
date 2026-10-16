/**
 * Case-level Manual vs Automatic for the full pipeline (M1 → report).
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PopIn } from '@/components/motion';
import { SegmentedPill } from '@/components/UploadWizardKit';
import { cn } from '@/lib/utils';

export const PIPELINE_RUN_MANUAL = 'manual';
export const PIPELINE_RUN_AUTOMATIC = 'automatic';

export function normalizePipelineRunMode(value) {
  return value === PIPELINE_RUN_AUTOMATIC ? PIPELINE_RUN_AUTOMATIC : PIPELINE_RUN_MANUAL;
}

/** Clear phenotype interpret/selection state; keeps unrelated sample fields. */
export function clearPhenotypeMetadataFields(prev = {}) {
  return {
    phenotype_findings: '',
    phenotype_disease: '',
    phenotype_note_clean: '',
    phenotype: '',
    phenotype_hpo: {
      ...(prev.phenotype_hpo || {}),
      candidates: [],
      confirmed_ids: [],
      disease_match: null,
      top_candidates: [],
      hpo_resolution_method: null,
      propagated_from_related_records: [],
    },
  };
}

/**
 * Apply Manual/Automatic on sample metadata.
 * Any mode switch resets phenotype results (note text in the panel is local and clears there too).
 */
export function applyPipelineRunModeChange(prev = {}, mode) {
  const nextMode = normalizePipelineRunMode(mode);
  const prevMode = normalizePipelineRunMode(
    prev.pipeline_run_mode || prev.phenotype_run_mode
  );
  const next = {
    ...prev,
    pipeline_run_mode: nextMode,
    phenotype_run_mode: nextMode,
  };
  if (prevMode === nextMode) return next;
  return { ...next, ...clearPhenotypeMetadataFields(prev) };
}

const AUTOMATIC_INFO =
  'Early access. Automatic advances annotation and phenotype prioritization when ready, and pre-selects strong disease matches (score ≥ 0.90) plus high-confidence findings. Review before clinical use.';

/** Click-to-open explanation (a popover: Esc closes it and focus returns to the button). */
function AutomaticInfoButton() {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="About Automatic mode"
        className="relative inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-[hsl(var(--brand-700))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] after:absolute after:-inset-2"
      >
        <Info className="size-3.5" strokeWidth={2} aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 text-xs leading-snug text-[var(--text-secondary)]">
        {AUTOMATIC_INFO}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Manual vs Automatic for the whole case. One hairline card: the label and one line of what the
 * mode means on the left, a sliding pill switch on the right. Automatic is an early-access mode,
 * so it carries a text chip (it pops in) rather than a decorative border.
 */
export default function PipelineRunModeToggle({
  value = PIPELINE_RUN_MANUAL,
  onChange,
  disabled = false,
  className = '',
}) {
  const reduce = useReducedMotion();
  const mode = normalizePipelineRunMode(value);
  const isAutomatic = mode === PIPELINE_RUN_AUTOMATIC;
  return (
    <div
      className={cn(
        'wb-card flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3.5 py-2.5 transition-colors duration-200 motion-reduce:transition-none',
        isAutomatic && '!border-[hsl(var(--brand-300))]',
        className
      )}
    >
      <div className="min-w-0">
        <div className="flex min-h-6 items-center gap-1.5">
          <p className="text-[13px] font-medium text-foreground">Analysis mode</p>
          <AnimatePresence initial={false}>
            {isAutomatic ? (
              <PopIn key="ea">
                <span className="wb-chip !h-5 text-[11px]" data-tone="brand">Early access</span>
              </PopIn>
            ) : null}
          </AnimatePresence>
          {isAutomatic && <AutomaticInfoButton />}
        </div>
        <div className="relative mt-0.5 h-4 overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.p
              key={mode}
              className="text-xs leading-4 text-muted-foreground"
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={{ duration: reduce ? 0 : 0.16 }}
            >
              {isAutomatic ? 'Runs the full analysis for you.' : 'You control each step.'}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
      <SegmentedPill
        ariaLabel="Analysis mode"
        disabled={disabled}
        value={mode}
        onChange={(next) => {
          if (disabled) return;
          onChange?.(normalizePipelineRunMode(next));
        }}
        options={[
          { value: PIPELINE_RUN_MANUAL, label: 'Manual' },
          { value: PIPELINE_RUN_AUTOMATIC, label: 'Automatic' },
        ]}
      />
    </div>
  );
}
