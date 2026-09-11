import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { joinWaitlist } from '@/services/backendApi';

/**
 * Closed-beta seat badge and waitlist form for the landing page.
 *
 * Styled with the landing page's own hard-coded zinc/teal palette rather than the
 * semantic shadcn tokens — every other element in these sections does the same, and the
 * page forces its own theme, so a token-styled control would be the odd one out.
 */

const BRAND_TEAL = '#2F7F7A';

/** "7 of 10 beta seats left" plus a fill bar. Renders nothing until the count is known. */
export function BetaSeatsBadge({ seats, className = '', style }) {
  if (!seats || !seats.total) return null;

  const { total, claimed, remaining } = seats;
  const takenPercent = Math.min(100, Math.round((claimed / total) * 100));

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`} style={style}>
      <div className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/70 px-4 py-1.5">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: remaining > 0 ? BRAND_TEAL : '#a1a1aa' }}
          aria-hidden="true"
        />
        <span className="text-sm font-medium text-zinc-200">
          {remaining > 0
            ? `${remaining} of ${total} beta seats left`
            : `All ${total} beta seats taken`}
        </span>
      </div>
      <div
        className="h-1 w-48 overflow-hidden rounded-full bg-zinc-800"
        role="progressbar"
        aria-valuenow={claimed}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Beta seats claimed"
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${takenPercent}%`, backgroundColor: BRAND_TEAL }}
        />
      </div>
    </div>
  );
}

/**
 * Email capture shown in place of the signup CTA once the seats are gone.
 *
 * The backend treats a repeat email as a success rather than an error, so a second submit
 * shows the same confirmation instead of leaking whether an address is already listed.
 */
export function WaitlistForm({ source = 'landing-hero', className = '' }) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [joined, setJoined] = useState(false);
  const [trap, setTrap] = useState(''); // honeypot; humans never see it

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || joined) return;
    if (trap) {
      // A bot filled the hidden field. Show the success state and write nothing.
      setJoined(true);
      return;
    }
    if (!email.trim()) {
      toast.error('Enter an email so we can reach you.');
      return;
    }

    setSubmitting(true);
    try {
      await joinWaitlist({ email: email.trim(), source });
      setJoined(true);
      toast.success("You're on the waitlist. We'll email you when a seat opens.");
    } catch (error) {
      toast.error(error.message || 'Could not add you to the waitlist.');
    } finally {
      setSubmitting(false);
    }
  };

  if (joined) {
    return (
      <p className={`text-base text-zinc-300 ${className}`}>
        You&apos;re on the waitlist — we&apos;ll email you as soon as a seat opens.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex w-full max-w-md flex-col items-center gap-3 ${className}`}
    >
      <p className="text-sm text-zinc-400">
        The beta is full for now. Leave your email and we&apos;ll get in touch when a seat opens.
      </p>
      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@lab.org"
          autoComplete="email"
          disabled={submitting}
          className="h-12 flex-1 rounded-md border border-zinc-700 bg-zinc-900/70 px-4 text-base text-white placeholder:text-zinc-500 outline-none transition-colors focus:border-zinc-400 disabled:opacity-60"
        />
        {/* Honeypot: off-screen and hidden from assistive tech, so only a bot fills it. */}
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={trap}
          onChange={(e) => setTrap(e.target.value)}
          className="pointer-events-none absolute left-[-9999px] h-0 w-0 opacity-0"
        />
        <Button
          type="submit"
          size="lg"
          disabled={submitting}
          className="h-12 bg-white px-8 text-base font-medium text-black transition-all hover:bg-zinc-200 active:scale-95"
        >
          {submitting ? 'Joining…' : 'Join waitlist'}
        </Button>
      </div>
    </form>
  );
}
