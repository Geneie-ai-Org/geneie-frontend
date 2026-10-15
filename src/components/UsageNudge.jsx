import { AlertTriangle, Info, X } from 'lucide-react';

/**
 * Slim, dismissible inline notice for usage and plan limits.
 *
 * Status colour carries the meaning (warning / info) on the icon, the hairline and a soft
 * fill; the sentence itself stays in primary text so it reads in both themes. One CTA at most,
 * plus a quiet dismiss. The two `layout` values only differ in spacing: `card` for the new-chat
 * layout (sits above the composer, capped to its width), `strip` for an active conversation.
 */
const TONES = {
  warning: {
    Icon: AlertTriangle,
    fill: 'hsl(var(--card))',
    line: 'var(--border-default)',
    accent: 'var(--warning)',
  },
  info: {
    Icon: Info,
    fill: 'hsl(var(--card))',
    line: 'var(--border-default)',
    accent: 'var(--info)',
  },
};

const UsageNudge = ({
  message,
  tone = 'warning',
  layout = 'strip',
  ctaLabel,
  onCta,
  onDismiss,
}) => {
  if (!message) return null;
  const palette = TONES[tone] || TONES.warning;
  const { Icon } = palette;

  const className =
    layout === 'card'
      ? 'mb-3 w-full max-w-2xl'
      : 'mx-4 mt-2 shrink-0';

  return (
    <div className={className}>
      <div
        role="status"
        className="flex items-center gap-2.5 rounded-lg border py-1.5 pl-3 pr-1.5 text-[13px] leading-snug"
        style={{ backgroundColor: palette.fill, borderColor: palette.line }}
      >
        <Icon className="size-4 shrink-0" style={{ color: palette.accent }} aria-hidden />
        <span className="min-w-0 flex-1 text-[var(--text-primary)]">{message}</span>
        <div className="flex shrink-0 items-center gap-1">
          {ctaLabel && onCta && (
            <button
              type="button"
              onClick={onCta}
              className="inline-flex h-7 items-center rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-hover)] [@media(pointer:coarse)]:h-9"
            >
              {ctaLabel}
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="inline-flex size-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] [@media(pointer:coarse)]:size-9"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default UsageNudge;
