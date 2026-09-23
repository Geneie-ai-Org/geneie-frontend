/**
 * Case-level Manual vs Automatic for the full pipeline (M1 → report).
 * Default Manual = interactive live flow. Automatic = Early Access orchestrator.
 */
import { PillToggle } from '@/components/ui/pill-toggle';

export const PIPELINE_RUN_MANUAL = 'manual';
export const PIPELINE_RUN_AUTOMATIC = 'automatic';

export function normalizePipelineRunMode(value) {
  return value === PIPELINE_RUN_AUTOMATIC ? PIPELINE_RUN_AUTOMATIC : PIPELINE_RUN_MANUAL;
}

function EarlyAccessMark({ compact = false }) {
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        color: 'var(--accent-teal)',
        background: 'color-mix(in srgb, var(--accent-teal) 14%, transparent)',
        border: '1px solid color-mix(in srgb, var(--accent-teal) 35%, transparent)',
        letterSpacing: '0.04em',
      }}
      title="Early access — Automatic mode is rolling out; review outputs before clinical use"
    >
      {compact ? 'EA' : 'Early access'}
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
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              Analysis mode
            </p>
            {isAutomatic && <EarlyAccessMark />}
          </div>
          <p className="text-2xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {isAutomatic
              ? 'Automatic (early access): orchestrate calling → phenotype/filter → report with minimal clicks.'
              : 'Manual: you drive each step (current live behaviour).'}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
      </div>
      {isAutomatic && (
        <p className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
          Early access — outputs still need your review before clinical use. Auto-run of the full chain is
          rolling out step by step.
        </p>
      )}
    </div>
  );
}
