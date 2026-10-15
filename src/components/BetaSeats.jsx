import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { joinWaitlist } from '@/services/backendApi';

/**
 * Closed-beta seat badge and waitlist form for the landing page.
 *
 * Styled with the design tokens, so the controls follow the landing page in light and dark.
 */

/** "7 of 10 beta seats left". Renders nothing until the count is known. */
export function BetaSeatsBadge({ seats, className = '', style }) {
  if (!seats || !seats.total) return null;

  const { total, remaining } = seats;

  return (
    <div className={`flex flex-col items-center ${className}`} style={style}>
      <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${remaining > 0 ? 'bg-primary' : 'bg-muted-foreground'}`}
          aria-hidden="true"
        />
        <span className="text-sm font-medium text-foreground">
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
  const [error, setError] = useState('');
  const uid = useId();

  const isFull = Boolean(seats) && !seats.open;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || joined) return;
    if (trap) {
      // A bot filled the hidden field. Show the success state and write nothing.
      setJoined(true);
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError(email.trim() ? 'Enter a full email address, like you@lab.org.' : 'Enter your email so we can reach you.');
      return;
    }
    setError('');

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
    } catch (err) {
      setError(err.message || 'Could not submit your request. Try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  if (joined) {
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        <p className="text-base text-foreground" role="status">{confirmationFor(joined, isFull)}</p>
        <SignInHint onSignIn={onSignIn} />
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex w-full max-w-md flex-col items-center gap-3 ${className}`}
    >
      <p id={`${uid}-help`} className="text-sm text-muted-foreground">
        {isFull
          ? 'All beta seats are taken right now. Leave your email and we\u2019ll get in touch when one opens.'
          : 'Geneie is in closed beta. Leave your email to enrol, we\u2019ll set up your seat and let you know.'}
      </p>
      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
          placeholder="you@lab.org"
          autoComplete="email"
          disabled={submitting}
          aria-label="Email address"
          aria-required="true"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${uid}-help ${uid}-error` : `${uid}-help`}
          className="h-12 flex-1 rounded-md border border-border aria-[invalid=true]:border-destructive bg-card px-4 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-[var(--border-strong)] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/70 disabled:opacity-60"
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
          className="h-12 px-8 text-base font-medium"
        >
          {submitting ? 'Sending\u2026' : isFull ? 'Join waitlist' : 'Apply for beta'}
        </Button>
      </div>
      {error && <p id={`${uid}-error`} role="alert" className="text-[13px] text-destructive">{error}</p>}
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
      className="rounded text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
    >
      Already have an account? Sign in
    </button>
  );
}
