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

/** "7 of 10 beta seats left". Renders nothing until the count is known. */
export function BetaSeatsBadge({ seats, className = '', style }) {
  if (!seats || !seats.total) return null;

  const { total, remaining } = seats;

  return (
    <div className={`flex flex-col items-center ${className}`} style={style}>
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
    </div>
  );
}

/**
 * Beta application form — the landing page's only call to action.
 *
 * Geneie is a closed beta: nobody self-serves an account. Everyone applies here, and a
 * seat is granted deliberately from /admin-haha. The copy shifts once the seats are gone,
 * but the mechanism is identical either way, which is why this is one component and not
 * two: an "apply" and a "waitlist" that behaved differently would drift.
 *
 * The backend treats a repeat email as a success rather than an error, so a second submit
 * shows the same confirmation instead of leaking whether an address is already listed.
 */
export function BetaApplyForm({ seats, source = 'landing-hero', className = '', onSignIn }) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [joined, setJoined] = useState(null); // null | { alreadyApplied, status }
  const [trap, setTrap] = useState(''); // honeypot; humans never see it

  const isFull = Boolean(seats) && !seats.open;

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
      const result = await joinWaitlist({ email: email.trim(), source });
      setJoined(result);
      if (result.alreadyApplied) {
        toast.success("You're already on the list, we have your request.");
      } else {
        toast.success(
          isFull
            ? "You're on the waitlist. We'll be in touch when a seat opens."
            : "Request received. We'll be in touch once your seat is ready.",
        );
      }
    } catch (error) {
      toast.error(error.message || 'Could not submit your request.');
    } finally {
      setSubmitting(false);
    }
  };

  if (joined) {
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        <p className="text-base text-zinc-200">{confirmationFor(joined, isFull)}</p>
        <SignInHint onSignIn={onSignIn} />
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex w-full max-w-md flex-col items-center gap-3 ${className}`}
    >
      <p className="text-sm text-zinc-400">
        {isFull
          ? 'All beta seats are taken right now. Leave your email and we\u2019ll get in touch when one opens.'
          : 'Geneie is in closed beta. Leave your email to enrol, we\u2019ll set up your seat and let you know.'}
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
          {submitting ? 'Sending\u2026' : isFull ? 'Join waitlist' : 'Apply for beta'}
        </Button>
      </div>
      <SignInHint onSignIn={onSignIn} />
    </form>
  );
}

/**
 * What to tell someone after they submit.
 *
 * A repeat submit gets its own line rather than the first-time one: telling a person
 * "request received" for the third time reads as though the first two vanished, which is
 * exactly when people start emailing support.
 */
function confirmationFor(result, isFull) {
  if (result.alreadyApplied) {
    if (result.status === 'invited' || result.status === 'contacted') {
      return "You've already requested a seat and we've been in touch — check your inbox, including spam.";
    }
    return "You've already requested a seat with this email. You're on the list, and we'll come back to you.";
  }
  return isFull
    ? "You're on the waitlist — we'll be in touch as soon as a seat opens."
    : "You're on the list, we'll be in touch once your beta seat is ready.";
}

/** Existing testers still need a way in; the form is not a wall for them. */
function SignInHint({ onSignIn }) {
  if (!onSignIn) return null;
  return (
    <button
      type="button"
      onClick={onSignIn}
      className="text-sm text-zinc-400 underline-offset-4 transition-colors hover:text-zinc-200 hover:underline"
    >
      Already have an account? Sign in
    </button>
  );
}
