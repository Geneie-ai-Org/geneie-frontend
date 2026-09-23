/**
 * Case-level Manual vs Automatic for the full pipeline (M1 → report).
 */
import { PillToggle } from '@/components/ui/pill-toggle';

export const PIPELINE_RUN_MANUAL = 'manual';
export const PIPELINE_RUN_AUTOMATIC = 'automatic';

export function normalizePipelineRunMode(value) {
  return value === PIPELINE_RUN_AUTOMATIC ? PIPELINE_RUN_AUTOMATIC : PIPELINE_RUN_MANUAL;
}

function EarlyAccessMark() {
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        color: 'var(--accent-teal)',
        background: 'color-mix(in srgb, var(--accent-teal) 14%, transparent)',
        border: '1px solid color-mix(in srgb, var(--accent-teal) 35%, transparent)',
        letterSpacing: '0.04em',
      }}
      title="Early access — review results before clinical use"
    >
      Early access
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
        <div className="min-w-0 flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            Analysis mode
          </p>
          {isAutomatic && <EarlyAccessMark />}
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
