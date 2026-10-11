import React, { useId } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Typical end-to-end ranges, used when live estimates are missing. Minutes. */
export const MODULE1_GPU_TYPICAL_MIN = [20, 30];
export const MODULE1_CPU_TYPICAL_MIN = [90, 150];

export const MODULE1_CAPACITY_UNAVAILABLE_LINE =
  'Live queue info unavailable; Auto will pick the faster option when your job is picked up.';

/**
 * `[lo, hi]`, `{ lo, hi }` or `{ min, max }` → `[lo, hi]` (sorted, finite, >= 0); anything
 * else → null. The backend contract is `[lo, hi]`; the rest is tolerance while it ships.
 */
export function normalizeMinutesRange(value) {
  let lo;
  let hi;
  if (Array.isArray(value) && value.length >= 2) {
    [lo, hi] = value;
  } else if (value && typeof value === 'object') {
    lo = value.lo ?? value.min;
    hi = value.hi ?? value.max;
  } else {
    return null;
  }
  lo = Number(lo);
  hi = Number(hi);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  if (lo > hi) [lo, hi] = [hi, lo];
  return [Math.max(0, lo), Math.max(0, hi)];
}

function formatHalfHours(hours) {
  const whole = Math.floor(hours);
  const half = hours - whole >= 0.5;
  if (!whole) return half ? '½' : '0';
  return `${whole}${half ? '½' : ''}`;
}

/**
 * Minutes range → "5–10 min", "1½–2½ h" (both ends >= 60, widened outward to half hours so a
 * range never collapses to one number), or "45 min–1½ h" when it straddles the hour. Carries
 * its own unit; callers add any "about"/"in" wording. Returns null for an unusable range.
 */
export function formatMinutesRange(value) {
  const range = normalizeMinutesRange(value);
  if (!range) return null;
  const lo = Math.round(range[0]);
  const hi = Math.round(range[1]);
  if (hi < 60) return lo === hi ? `${lo} min` : `${lo}–${hi} min`;
  const hiHours = Math.ceil(hi / 30) / 2;
  if (lo < 60) return `${lo} min–${formatHalfHours(hiHours)} h`;
  const loHours = Math.floor(lo / 30) / 2;
  return loHours === hiHours
    ? `${formatHalfHours(loHours)} h`
    : `${formatHalfHours(loHours)}–${formatHalfHours(hiHours)} h`;
}

const midpoint = (range) => (range ? (range[0] + range[1]) / 2 : null);

function pickRange(capacity, ...keys) {
  for (const key of keys) {
    const range = normalizeMinutesRange(capacity?.[key]);
    if (range) return range;
  }
  return null;
}

function countPhrase(n, one, many) {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

/**
 * Capacity payload + fetch status → what the GPU card says and which card is the default.
 * Order matters: unavailable → AWS has no GPUs → a slot is free → GPU queue so long that CPU
 * finishes first → otherwise "busy, you would be #k" (including waits over 45 min while the
 * GPU is still the faster option overall, since the long-queue copy claims CPU wins).
 */
export function deriveModule1ComputeState(capacity, status) {
  if (status === 'loading' && !capacity) {
    return { kind: 'loading', defaultChoice: null, gpuLine: 'Checking GPU availability…', queuePosition: null };
  }
  if (status !== 'ok' || !capacity || typeof capacity !== 'object') {
    return { kind: 'unavailable', defaultChoice: null, gpuLine: MODULE1_CAPACITY_UNAVAILABLE_LINE, queuePosition: null };
  }

  if (capacity.gpu_capacity_unavailable === true) {
    return {
      kind: 'no_gpu',
      defaultChoice: 'cpu',
      gpuLine: 'AWS currently has no GPUs available in this region. We will keep trying; CPU is the only way to start now.',
      queuePosition: null,
    };
  }

  const slotsFree = Number(capacity.gpu_slots_free);
  if (Number.isFinite(slotsFree) && slotsFree > 0) {
    return { kind: 'free', defaultChoice: 'gpu', gpuLine: 'A GPU is free now — starts within ~3 min.', queuePosition: null };
  }
  if (!Number.isFinite(slotsFree)) {
    // No slot count at all means we cannot tell free from busy.
    return { kind: 'unavailable', defaultChoice: null, gpuLine: MODULE1_CAPACITY_UNAVAILABLE_LINE, queuePosition: null };
  }

  const aheadRaw = Number(capacity.gpu_queued_ahead);
  const ahead = Number.isFinite(aheadRaw) && aheadRaw > 0 ? Math.round(aheadRaw) : 0;
  const queuePosition = ahead + 1;
  const wait = pickRange(capacity, 'est_gpu_wait_min', 'est_gpu_wait');
  let gpuTotal = pickRange(capacity, 'est_gpu_total_min', 'est_gpu_total');
  if (!gpuTotal && wait) gpuTotal = [wait[0] + MODULE1_GPU_TYPICAL_MIN[0], wait[1] + MODULE1_GPU_TYPICAL_MIN[1]];
  const cpuTotal = pickRange(capacity, 'est_cpu_total_min', 'est_cpu_total') || MODULE1_CPU_TYPICAL_MIN;
  const waitText = formatMinutesRange(wait);
  const totalText = formatMinutesRange(gpuTotal);

  if (gpuTotal && midpoint(gpuTotal) > midpoint(cpuTotal)) {
    return {
      kind: 'long',
      defaultChoice: 'cpu',
      gpuLine: `All GPUs are busy and ${countPhrase(ahead, 'job is', 'jobs are')} ahead of you${
        waitText ? ` (estimated start in ${waitText})` : ''
      }. CPU will likely finish sooner.`,
      queuePosition,
    };
  }

  return {
    kind: 'busy',
    defaultChoice: 'gpu',
    gpuLine:
      waitText && totalText
        ? `All GPUs are busy. You would be #${queuePosition} in line; estimated start in ${waitText}, done in roughly ${totalText}.`
        : `All GPUs are busy. You would be #${queuePosition} in line.`,
    queuePosition,
  };
}

/** Submit label for the final wizard step, from what is selected and the queue state. */
export function module1ComputeSubmitLabel(choice, state) {
  if (choice === 'cpu') return 'Start on CPU';
  if (choice !== 'gpu') return 'Start pipeline';
  if ((state?.kind === 'busy' || state?.kind === 'long') && state.queuePosition) {
    return `Join GPU queue (#${state.queuePosition})`;
  }
  if (state?.kind === 'no_gpu') return 'Wait for a GPU';
  return 'Start on GPU';
}

function ComputeCard({ name, value, checked, onSelect, disabled, title, badge, description, children }) {
  return (
    <label
      className={cn(
        'relative flex items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors',
        'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--accent-teal)]',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      )}
      style={{
        borderColor: checked ? 'var(--accent-teal)' : 'var(--border-default)',
        backgroundColor: checked ? 'var(--accent-teal-soft)' : 'var(--bg-input)',
      }}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect(value)}
        // onChange skips a click on the already-checked card, but that click is still the
        // user's choice and must stop the live default from flipping it later.
        onClick={() => onSelect(value)}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className="mt-0.5 w-4 h-4 shrink-0 rounded-full border flex items-center justify-center"
        style={{ borderColor: checked ? 'var(--accent-teal)' : 'var(--border-strong)' }}
      >
        {checked && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-teal)' }} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{title}</span>
          {badge && (
            <span
              className="text-2xs font-semibold px-1.5 h-[18px] inline-flex items-center rounded-full"
              style={{ backgroundColor: 'var(--accent-teal-soft)', color: 'var(--accent-teal)' }}
            >
              {badge}
            </span>
          )}
        </span>
        <span className="block text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{description}</span>
        {children}
      </span>
    </label>
  );
}

/**
 * GPU vs CPU choice on the last Module 1 wizard step. Native radios inside a radiogroup, so
 * arrow keys move between the cards. `value` null means nothing chosen yet (sent as "auto").
 */
const Module1ComputeChoice = ({ value, onChange, state, disabled = false }) => {
  const groupName = useId();
  const labelId = `${groupName}-label`;
  const kind = state?.kind;
  const lineColor = kind === 'no_gpu' ? 'var(--warning)' : 'var(--text-tertiary)';

  return (
    <div>
      <span id={labelId} className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
        Where should this run?
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-col gap-2">
        <ComputeCard
          name={groupName}
          value="gpu"
          checked={value === 'gpu'}
          onSelect={onChange}
          disabled={disabled}
          title="Run on GPU"
          badge="Recommended"
          description="Fastest. Finishes in about 20–30 min once it starts."
        >
          {state?.gpuLine && (
            <span
              className="flex items-start gap-1.5 mt-1.5 text-2xs"
              style={{ color: lineColor }}
              aria-live="polite"
            >
              {kind === 'loading' && <Loader2 className="w-3 h-3 mt-px animate-spin shrink-0" style={{ color: 'var(--accent-teal)' }} />}
              <span>{state.gpuLine}</span>
            </span>
          )}
        </ComputeCard>
        <ComputeCard
          name={groupName}
          value="cpu"
          checked={value === 'cpu'}
          onSelect={onChange}
          disabled={disabled}
          title="Run on CPU now"
          description="Starts immediately on our CPU cluster. Slower: about 1½–2½ h. Same results, same run credit."
        />
      </div>
    </div>
  );
};

export default Module1ComputeChoice;
