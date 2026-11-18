import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * Confirm dialogs for the two admin actions that can email a user. Each one says, in plain
 * words, what is about to happen and makes the email an explicit choice (send or skip), so the
 * admin never emails someone by accident or silently skips it.
 */

const PLAN_LABELS = { free: 'Free', beta: 'Beta', pro: 'Pro', super_pro: 'Super Pro' };
export const planLabel = (plan) => PLAN_LABELS[plan] || plan || 'Free';

function Effects({ items }) {
  return (
    <ul className="mt-2 list-disc space-y-1 pl-5 text-left text-sm text-muted-foreground">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/** entry: a waitlist row. onConfirm({ sendEmail, name }). */
export function GrantSeatDialog({ entry, name, onNameChange, seatsLeft, busy, onConfirm, onCancel }) {
  if (!entry) return null;
  const seatLine =
    seatsLeft == null
      ? 'Uses one beta seat.'
      : seatsLeft > 0
        ? `Uses one beta seat (${seatsLeft} left).`
        : 'Uses one beta seat. None are left, so this goes over the limit.';
  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onCancel()}>
      <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Grant a beta seat to {entry.email}?</AlertDialogTitle>
          <AlertDialogDescription render={<div />}>
            This creates their account right now:
            <Effects
              items={[
                'Creates the login for this email, or reuses it if one exists.',
                'Gives them the full beta quotas.',
                seatLine,
                'Marks this waitlist entry as invited.',
              ]}
            />
            <label className="mt-3 block text-left text-sm text-foreground">
              Name for the email (optional)
              <input
                type="text"
                value={name}
                maxLength={80}
                disabled={busy}
                onChange={(e) => onNameChange(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              />
            </label>
            <p className="mt-3 text-left text-sm text-foreground">
              Email them a one-time link to set their password?
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mx-0 mb-0 rounded-none bg-transparent p-0 pt-2">
          <Button variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button variant="outline" disabled={busy} onClick={() => onConfirm({ sendEmail: false })}>
            Grant, skip email
          </Button>
          <Button disabled={busy} onClick={() => onConfirm({ sendEmail: true })}>
            Grant and send email
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** change: { user, next }. onConfirm({ notify }). */
export function PlanChangeDialog({ change, busy, onConfirm, onCancel }) {
  if (!change) return null;
  const { user, next } = change;
  const from = user.planStatus || 'free';
  const hasEmail = Boolean(user.email);
  const effects = [
    next === 'beta'
      ? 'Writes the full beta quotas and uses one beta seat.'
      : 'Their limits change straight away.',
  ];
  if (from === 'beta' && next !== 'beta') effects.push('Frees their beta seat.');
  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onCancel()}>
      <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Change {user.email || user.uid} from {planLabel(from)} to {planLabel(next)}?
          </AlertDialogTitle>
          <AlertDialogDescription render={<div />}>
            <Effects items={effects} />
            <p className="mt-3 text-left text-sm text-foreground">
              {hasEmail
                ? 'Email them that their plan changed?'
                : 'This account has no email on file, so it cannot be notified.'}
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mx-0 mb-0 rounded-none bg-transparent p-0 pt-2">
          <Button variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button
            variant={hasEmail ? 'outline' : 'default'}
            disabled={busy}
            onClick={() => onConfirm({ notify: false })}
          >
            {hasEmail ? 'Change, skip email' : 'Change plan'}
          </Button>
          {hasEmail && (
            <Button disabled={busy} onClick={() => onConfirm({ notify: true })}>
              Change and send email
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
