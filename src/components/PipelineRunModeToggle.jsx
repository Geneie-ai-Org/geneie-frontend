/**
 * Case-level Manual vs Automatic for the full pipeline (M1 → report).
 */
import { PillToggle } from '@/components/ui/pill-toggle';

export const PIPELINE_RUN_MANUAL = 'manual';
export const PIPELINE_RUN_AUTOMATIC = 'automatic';

export function normalizePipelineRunMode(value) {
  return value === PIPELINE_RUN_AUTOMATIC ? PIPELINE_RUN_AUTOMATIC : PIPELINE_RUN_MANUAL;
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

/** Compact superscript mark for the Automatic option. */
function EarlyAccessSuperscript() {
  const softFill =
    'linear-gradient(135deg, color-mix(in srgb, var(--early-access-from) 16%, var(--bg-input)), color-mix(in srgb, var(--early-access-to) 16%, var(--bg-input)))';
  return (
    <span
      aria-label="Early access"
      title="Early access — review results before clinical use"
      className="pointer-events-none absolute -top-2 -right-1.5 z-10 inline-flex max-w-[4.5rem] items-center rounded px-1 py-px text-[8px] font-semibold uppercase leading-none tracking-wide whitespace-nowrap"
      style={{
        ...earlyAccessSurface(softFill),
        color: 'var(--early-access-from)',
        letterSpacing: '0.03em',
      }}
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
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
          Analysis mode
        </p>
        <PillToggle
          className="overflow-visible"
          value={mode}
          onChange={(next) => {
            if (disabled) return;
            onChange?.(normalizePipelineRunMode(next));
          }}
          options={[
            { value: PIPELINE_RUN_MANUAL, label: 'Manual' },
            {
              value: PIPELINE_RUN_AUTOMATIC,
              label: 'Automatic',
              badge: <EarlyAccessSuperscript />,
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
