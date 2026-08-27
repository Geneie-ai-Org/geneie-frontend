/**
 * Inline, non-blocking usage banner.
 *
 * Two variants matching the two shapes already used for the guest nudge in ChatPage: a rounded
 * card for the empty/new-chat layout, and a full-width strip for an active conversation.
 */
const TONES = {
  warning: {
    card: { backgroundColor: 'rgba(245, 158, 11, 0.06)', borderColor: 'rgba(245, 158, 11, 0.2)' },
    strip: { backgroundColor: 'rgba(245, 158, 11, 0.04)', borderColor: 'rgba(245, 158, 11, 0.2)' },
    text: 'var(--warning)',
  },
  info: {
    card: { backgroundColor: 'var(--info-soft)', borderColor: 'var(--info)' },
    strip: { backgroundColor: 'var(--info-soft)', borderColor: 'var(--info)' },
    text: 'var(--info)',
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

  const className = layout === 'card'
    ? 'mb-4 w-full max-w-2xl px-4 py-3 rounded-xl border flex items-center justify-between gap-3'
    : 'flex items-center justify-between gap-3 px-4 py-2 border-b mx-4';

  return (
    <div className={className} style={layout === 'card' ? palette.card : palette.strip}>
      <span className="text-xs font-medium" style={{ color: palette.text }}>
        {message}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        {ctaLabel && onCta && (
          <button
            type="button"
            onClick={onCta}
            className="text-xs px-3 py-1.5 rounded-lg font-medium border shrink-0 transition-colors hover:opacity-90"
            style={{ borderColor: 'var(--accent-teal)', color: 'var(--accent-teal)' }}
          >
            {ctaLabel}
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="text-xs px-2 py-1.5 rounded-lg transition-colors hover:opacity-70"
            style={{ color: palette.text }}
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
};

export default UsageNudge;
