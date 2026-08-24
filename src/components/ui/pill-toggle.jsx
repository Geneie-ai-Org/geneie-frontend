/**
 * Segmented pill control for a small, mutually exclusive choice — the source of an
 * upload (computer vs URL), the source of a BED file, and so on.
 *
 * Options may set `disabled` with a `disabledReason`: the pill stays clickable so the
 * click can report why it is unavailable, rather than going inert with no explanation —
 * but it does not scale on press, since nothing is going to happen.
 */
export function PillToggle({ options, value, onChange, className = '' }) {
  return (
    <div className={`flex gap-2 ${className}`}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => (opt.disabled ? opt.onDisabledClick?.(opt) : onChange(opt.value))}
            aria-pressed={active}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-[background-color,border-color,color,transform] duration-150 ease-out ${
              opt.disabled ? 'cursor-not-allowed' : 'active:scale-[0.97]'
            }`}
            style={{
              borderColor: active ? 'var(--accent-teal)' : 'var(--border-default)',
              color: opt.disabled
                ? 'var(--text-tertiary)'
                : active
                  ? 'var(--accent-teal)'
                  : 'var(--text-secondary)',
              backgroundColor: active ? 'var(--accent-teal-soft)' : 'transparent',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default PillToggle;
