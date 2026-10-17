/**
 * Building blocks for the Settings page. One setting is one row: label (and an optional
 * one-line description) on the left, its control on the right, hairline between rows — no
 * cards. Modelled on Qwen's settings, which keeps every section scannable as a list.
 */

export function SettingsSection({ title, description, children }) {
  return (
    <section className="space-y-1">
      <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h2>
      {description ? (
        <p className="text-xs pb-2" style={{ color: 'var(--text-tertiary)' }}>
          {description}
        </p>
      ) : (
        <div className="pb-2" />
      )}
      <div>{children}</div>
    </section>
  );
}

/** A small uppercase label that splits a section into groups. */
export function SettingsGroupLabel({ children }) {
  return (
    <p className="pt-6 pb-1 text-2xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
      {children}
    </p>
  );
}

export function SettingsRow({ label, description, htmlFor, children, danger = false }) {
  const Label = htmlFor ? 'label' : 'div';
  return (
    <div
      className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 border-b last:border-b-0"
      style={{ borderColor: 'var(--border-default)' }}
    >
      <Label htmlFor={htmlFor} className="min-w-0">
        <span className="block text-sm" style={{ color: danger ? 'var(--error)' : 'var(--text-primary)' }}>
          {label}
        </span>
        {description ? (
          <span className="block text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
            {description}
          </span>
        ) : null}
      </Label>
      <div className="shrink-0 flex items-center gap-2">{children}</div>
    </div>
  );
}

/** Accessible on/off switch (role=switch) styled with the app's theme variables. */
export function SettingsSwitch({ checked, disabled, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative shrink-0 rounded-full transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)]"
      style={{
        width: '34px',
        height: '20px',
        backgroundColor: checked ? 'var(--accent-teal)' : 'var(--bg-surface-hover)',
        border: '1px solid var(--border-default)',
      }}
    >
      <span
        className="absolute top-px rounded-full transition-all"
        style={{
          width: '16px',
          height: '16px',
          left: checked ? '16px' : '1px',
          backgroundColor: checked ? 'var(--accent-teal-contrast)' : 'var(--text-tertiary)',
        }}
      />
    </button>
  );
}

/**
 * Segmented control: one track, the chosen option raised on it (System | Light | Dark).
 * Same treatment as the chat's Standard / Explore switch — muted track, background-colored
 * chip with a shadow — so the choice reads clearly in both themes.
 */
export function SettingsSegmented({ value, onChange, options, label }) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex items-center gap-0.5 p-0.5 rounded-lg"
      style={{ backgroundColor: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))' }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className="px-3 py-1 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)]"
            style={{
              backgroundColor: active ? 'hsl(var(--background))' : 'transparent',
              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.15)' : 'none',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const BUTTON_TONES = {
  default: { border: '1px solid var(--border-default)', color: 'var(--text-primary)', backgroundColor: 'transparent' },
  primary: { border: '1px solid var(--accent-teal)', color: 'var(--accent-teal-contrast)', backgroundColor: 'var(--accent-teal)' },
  danger: { border: '1px solid var(--error)', color: 'var(--error)', backgroundColor: 'transparent' },
};

export function SettingsButton({ tone = 'default', children, className = '', ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)] ${className}`}
      style={BUTTON_TONES[tone] || BUTTON_TONES.default}
    >
      {children}
    </button>
  );
}

/** Inline status under a row: saving errors, confirmations. */
export function SettingsNote({ tone = 'muted', children }) {
  if (!children) return null;
  const color = tone === 'error' ? 'var(--error)' : tone === 'success' ? 'var(--success)' : 'var(--text-tertiary)';
  return (
    <p className="text-xs pt-1" role={tone === 'error' ? 'alert' : undefined} style={{ color }}>
      {children}
    </p>
  );
}
