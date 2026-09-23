/**
 * Case-level Manual vs Automatic for the full pipeline (M1 → report).
 */
import { PillToggle } from '@/components/ui/pill-toggle';

export const PIPELINE_RUN_MANUAL = 'manual';
export const PIPELINE_RUN_AUTOMATIC = 'automatic';

export function normalizePipelineRunMode(value) {
  return value === PIPELINE_RUN_AUTOMATIC ? PIPELINE_RUN_AUTOMATIC : PIPELINE_RUN_MANUAL;
}

/**
 * Apply Manual/Automatic on sample metadata.
 * Automatic → Manual clears phenotype selections (keeps the clinical note text).
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
  if (prevMode !== PIPELINE_RUN_AUTOMATIC || nextMode !== PIPELINE_RUN_MANUAL) {
    return next;
  }
  const ph = prev.phenotype_hpo;
  const hadSelections =
    Boolean(ph?.disease_match) ||
    (Array.isArray(ph?.confirmed_ids) && ph.confirmed_ids.length > 0) ||
    (Array.isArray(ph?.candidates) && ph.candidates.some((c) => c?.selected));
  if (!hadSelections && !prev.phenotype_findings) {
    return next;
  }
  next.phenotype_hpo = {
    ...(ph || {}),
    candidates: (ph?.candidates || []).map((c) => ({
      ...c,
      selected: false,
      selected_default: false,
    })),
    confirmed_ids: [],
    disease_match: null,
  };
  next.phenotype_findings = '';
  const note = String(prev.phenotype_note_clean || '').trim();
  const disease = String(prev.phenotype_disease || '').trim();
  next.phenotype = note || disease;
  return next;
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

/** Inline power-style mark, flush to the end of “Automatic”. */
function EarlyAccessSuperscript() {
  const softFill =
    'linear-gradient(135deg, color-mix(in srgb, var(--early-access-from) 16%, var(--bg-input)), color-mix(in srgb, var(--early-access-to) 16%, var(--bg-input)))';
  return (
    <sup
      aria-label="Early access"
      title="Early access — review results before clinical use"
      className="ml-0.5 inline-block rounded px-[3px] py-px text-[7px] font-semibold uppercase leading-none tracking-wide align-super"
      style={{
        ...earlyAccessSurface(softFill),
        color: 'var(--early-access-from)',
        letterSpacing: '0.02em',
        verticalAlign: 'super',
        top: 0,
        position: 'relative',
      }}
    >
      Early access
    </sup>
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
        <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
          Analysis mode
        </p>
        <PillToggle
          value={mode}
          onChange={(next) => {
            if (disabled) return;
            onChange?.(normalizePipelineRunMode(next));
          }}
          options={[
            { value: PIPELINE_RUN_MANUAL, label: 'Manual' },
            {
              value: PIPELINE_RUN_AUTOMATIC,
              label: (
                <>
                  Automatic
                  <EarlyAccessSuperscript />
                </>
              ),
            },
          ]}
        />
      </div>
      <p className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
        {isAutomatic ? 'Runs the full analysis for you.' : 'You control each step.'}
      </p>
    </div>
  );
}
