import { useRef } from 'react';
import { X } from 'lucide-react';
import { Dismissible } from '@/components/motion';

/**
 * Slim inline line for usage and plan limits, drawn as a pill: a status dot, one sentence, one
 * pill action and a round dismiss. The dot (and the tone word for screen readers) carries the
 * status; an error tone is for "over the limit" and reads as such. It is plain content, not a
 * live region: PipelineStatusStrip's `notice` prop renders the same line inside the status card
 * when one is on screen. `card` is the new-chat layout (sits above the composer, capped to its
 * width), `strip` is for an active conversation.
 *
 * It collapses out (height and fade) when `message` goes away, so the content below slides up.
 */
const TONES = {
  warning: { dot: 'var(--warning)', word: 'Warning' },
  info: { dot: 'var(--info)', word: 'Notice' },
  error: { dot: 'var(--error)', word: 'Over limit' },
};

const FOCUS = 'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]';

const UsageNudge = ({
  message,
  tone = 'warning',
  layout = 'strip',
  ctaLabel,
  onCta,
  onDismiss,
}) => {
  // Keep the last message so the exit animation still shows the words that were on screen.
  const last = useRef(message);
  if (message) last.current = message;
  const shown = message || last.current;
  const t = TONES[tone] || TONES.warning;

  const className =
    layout === 'card'
      ? 'mb-2 w-full max-w-3xl px-2'
      : 'mx-auto mt-1 w-full max-w-3xl shrink-0 px-4';

  return (
    <Dismissible show={Boolean(message)} className={className}>
      <div className="py-0.5">
        <div
          className="flex min-h-9 items-center gap-2.5 rounded-full border border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-card))] py-1 pl-3.5 pr-1.5 text-[13px] leading-snug tabular-nums text-[var(--text-secondary)]"
        >
          <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: t.dot }} aria-hidden />
          <span className="sr-only">{t.word}: </span>
          <span className="min-w-0 flex-1">{shown}</span>
          {ctaLabel && onCta && (
            <button
              type="button"
              onClick={onCta}
              className={`${FOCUS} inline-flex h-7 shrink-0 items-center rounded-full border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] px-3 text-[13px] font-medium text-[hsl(var(--brand-700))] transition-[background-color,border-color,transform] duration-150 hover:border-[hsl(var(--brand-300))] hover:bg-[hsl(var(--brand-50))] active:scale-[0.97] motion-reduce:transition-none [@media(pointer:coarse)]:h-11`}
            >
              {ctaLabel}
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss notice"
              className={`${FOCUS} inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-[hsl(var(--wb-pill))] hover:text-[var(--text-primary)] active:scale-[0.97] motion-reduce:transition-none [@media(pointer:coarse)]:size-11`}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </Dismissible>
  );
};

export default UsageNudge;
