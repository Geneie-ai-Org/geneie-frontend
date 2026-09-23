/**
 * Case-level Manual vs Automatic for the full pipeline (M1 → report).
 */
import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { PillToggle } from '@/components/ui/pill-toggle';

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

/** Gradient border that respects border-radius (padding-box + border-box). */
function earlyAccessSurface(paddingBg = 'var(--bg-input)') {
  const padLayer = /gradient|color-mix/i.test(paddingBg)
    ? paddingBg
    : `linear-gradient(${paddingBg}, ${paddingBg})`;
  return {
    border: '1.5px solid transparent',
    background: `${padLayer} padding-box, var(--early-access-gradient) border-box`,
  };
}

const AUTOMATIC_INFO =
  'Early access. Automatic advances annotation and phenotype prioritization when ready, and pre-selects high-confidence findings. Review before clinical use.';

function AutomaticInfoButton() {
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
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
        style={{
          color: 'var(--early-access-from)',
          borderColor: 'color-mix(in srgb, var(--early-access-from) 45%, transparent)',
          background: open
            ? 'color-mix(in srgb, var(--early-access-from) 18%, transparent)'
            : 'color-mix(in srgb, var(--early-access-from) 10%, transparent)',
        }}
        aria-label="About Automatic mode"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Info className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
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
          {AUTOMATIC_INFO}
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
      className={`p-3 rounded-lg space-y-1.5 ${className}`}
      style={
        isAutomatic
          ? earlyAccessSurface('var(--bg-input)')
          : {
              border: '1px solid var(--border-default)',
              background: 'var(--bg-input)',
            }
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            Analysis mode
          </p>
          {isAutomatic && <AutomaticInfoButton />}
        </div>
        <PillToggle
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
      <p className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
        {isAutomatic ? 'Runs the full analysis for you.' : 'You control each step.'}
      </p>
    </div>
  );
}
