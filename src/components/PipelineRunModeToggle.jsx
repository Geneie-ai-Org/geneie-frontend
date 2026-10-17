/**
 * Case-level Manual vs Automatic for the full pipeline (M1 → report).
 */
import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { PillToggle } from '@/components/ui/pill-toggle';
import { GlowingEffect } from '@/components/ui/glowing-effect';
import { DottedGlowBackground } from '@/components/ui/dotted-glow-background';

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

const MANUAL_INFO = 'Manual: you start each step yourself — annotation, filters and phenotype prioritization.';

const AUTOMATIC_INFO =
  'Early access. Automatic advances annotation and phenotype prioritization when ready, and pre-selects strong disease matches (score ≥ 0.90) plus high-confidence findings. Review before clinical use.';

function ModeInfoButton({ automatic }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span className="relative inline-flex" ref={wrapRef}>
      <button
        type="button"
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors hover:text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)]"
        style={{ color: open ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}
        aria-label={automatic ? 'About Automatic mode' : 'About Manual mode'}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open ? (
        <div
          role="tooltip"
          className="absolute left-0 top-full z-50 mt-1.5 w-60 rounded-md border px-2.5 py-2 text-2xs leading-snug shadow-md"
          style={{
            color: 'var(--text-secondary)',
            background: 'var(--bg-surface-raised)',
            borderColor: 'var(--border-default)',
          }}
        >
          {automatic ? AUTOMATIC_INFO : MANUAL_INFO}
        </div>
      ) : null}
    </span>
  );
}

export default function PipelineRunModeToggle({
  value = PIPELINE_RUN_MANUAL,
  onChange,
  disabled = false,
  className = '',
}) {
  const mode = normalizePipelineRunMode(value);
  const isAutomatic = mode === PIPELINE_RUN_AUTOMATIC;
  return (
    <div
      className={`relative p-3 rounded-lg ${className}`}
      style={{ border: '1px solid var(--border-default)', background: 'var(--bg-input)' }}
    >
      {/* Automatic: teal dots shimmer behind the row (Aceternity Dotted Glow Background), fading
        * out toward the title so it stays readable, and the border lights up toward the pointer
        * (Aceternity Glowing Effect). Both use the app's teal / info tokens. */}
      {isAutomatic && (
        <>
          <DottedGlowBackground
            className="rounded-[inherit] overflow-hidden"
            style={{
              WebkitMaskImage: 'linear-gradient(to left, #000 0%, rgba(0,0,0,0.7) 55%, transparent 95%)',
              maskImage: 'linear-gradient(to left, #000 0%, rgba(0,0,0,0.7) 55%, transparent 95%)',
            }}
            gap={8}
            radius={2}
            color="var(--accent-teal)"
            glowColor="var(--info)"
            opacity={0.35}
            speedMin={0.3}
            speedMax={1.1}
          />
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
        </>
      )}
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            Analysis mode
          </p>
          <ModeInfoButton automatic={isAutomatic} />
        </div>
        <PillToggle
          // Opaque pills so the dots don't show through, and a filled active pill so the
          // chosen mode is the brightest thing in the box — the dots stay background.
          surface="var(--bg-input)"
          solid
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
    </div>
  );
}
