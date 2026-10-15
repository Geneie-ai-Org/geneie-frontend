import { X } from 'lucide-react';

/**
 * Slim, muted inline line for usage and plan limits: a small status dot, one sentence, one
 * text-link CTA and a quiet dismiss. No fill and no border; the dot carries the status colour
 * (warning / info). It is plain content, not a live region: PipelineStatusStrip's `notice` prop
 * renders the same line inside the status card when one is on screen. `card` is the new-chat layout (sits above the composer, capped to its
 * width), `strip` is for an active conversation.
 */
const TONES = {
  warning: 'var(--warning)',
  info: 'var(--info)',
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
  const dot = TONES[tone] || TONES.warning;

  const className =
    layout === 'card'
      ? 'mb-2 w-full max-w-3xl px-2'
      : 'mx-auto mt-1 w-full max-w-3xl shrink-0 px-4';

  return (
    <div className={className}>
      <div
        className="flex min-h-7 items-center gap-2 text-[13px] leading-snug tabular-nums text-[var(--text-secondary)]"
      >
        <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden />
        <span className="min-w-0 flex-1">{message}</span>
        {ctaLabel && onCta && (
          <button
            type="button"
            onClick={onCta}
            className="chat-focus min-h-6 shrink-0 rounded-sm text-[13px] font-medium text-[var(--accent-teal)] underline decoration-1 underline-offset-[0.18em] hover:decoration-2 [@media(pointer:coarse)]:min-h-11"
          >
            {ctaLabel}
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss notice"
            className="chat-focus inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] active:scale-[.98] motion-reduce:transition-none [@media(pointer:coarse)]:size-11"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
};

export default UsageNudge;
