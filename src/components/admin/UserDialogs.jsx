import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { ConfirmDialog, inputCls } from './adminUi';
import { PlanChip, deviceInfo } from './UsersTable';

/* Confirmation layer for every state-changing action on the Users page. Each dialog names
 * the account, says exactly what will be written, says whether it can be undone, and
 * carries the verb on its confirm button. The writes themselves are the page's handlers;
 * nothing here calls an API. */

const labelOf = (user) => user.email || user.uid;

function Who({ user }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-2xl bg-[hsl(var(--wb-pill))] px-3 py-2 text-[13px]">
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{user.email || '(no email)'}</span>
      <code className="hidden max-w-[45%] shrink-0 truncate font-mono text-xs text-muted-foreground sm:block" title={user.uid}>{user.uid}</code>
      <PlanChip plan={user.planStatus || 'free'} />
    </div>
  );
}

export function ResetDevicesDialog({ user, onClose, onConfirm }) {
  const devices = deviceInfo(user);
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`Reset devices for ${labelOf(user)}?`}
      description="Clears this account's device list so it can sign in from anywhere again."
      confirmLabel="Reset devices"
      destructive
      undoable={false}
      undoText="The old device list is not stored anywhere, so it cannot be restored. The reset is recorded in the audit log."
      onConfirm={onConfirm}
    >
      <Who user={user} />
      <ul className="list-disc space-y-1 pl-4 text-[13px] leading-5 text-muted-foreground">
        <li>
          Empties the registered and active device lists for every tier on this account
          {devices ? ` (now ${devices.active} active, ${devices.registered} registered)` : ''}.
        </li>
        <li>Quotas, plan and conversations are not touched.</li>
        <li>The next devices that sign in register from scratch, up to the plan&apos;s device limit.</li>
      </ul>
    </ConfirmDialog>
  );
}

/** `admin` is deliberately absent: this page should not be able to mint more admins. */
const PLAN_COPY = {
  free: 'Standard free limits.',
  beta: 'Closed beta: claims one seat and seeds the full beta quota block.',
  pro: 'Paid plan.',
  super_pro: 'Paid plan with the higher limits.',
};

export function ChangePlanDialog({ user, plans, seats, betaSeedReference, onClose, onConfirm }) {
  const current = user.planStatus || 'free';
  const assignable = plans.includes(current);
  const [next, setNext] = useState(assignable ? current : '');
  const changed = Boolean(next) && next !== current;

  const toBeta = changed && next === 'beta';
  const fromBeta = changed && current === 'beta';
  // A switch that seeds quotas or releases a seat cannot be put back exactly, and a plan this
  // page cannot assign (admin, guest) cannot be restored from here at all.
  const undoable = changed && assignable && !toBeta && !fromBeta;
  const left = seats?.seats?.remaining;

  let undoText = 'Pick a new plan to see what will change.';
  if (changed) {
    if (!assignable) undoText = `"${current}" cannot be assigned from this page, so you could not switch back from here. The change is recorded in the audit log.`;
    else if (toBeta) undoText = 'Beta overwrites the quota counters, so switching back would not restore the previous usage. The change is recorded in the audit log.';
    else if (fromBeta) undoText = 'Switching back to beta would re-seed the quotas and claim a seat again, so it is not an exact undo. The change is recorded in the audit log.';
    else undoText = 'Use Undo in the confirmation toast to switch back. The change is also recorded in the audit log.';
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`Change plan for ${labelOf(user)}`}
      confirmLabel="Change plan"
      hold={changed && !undoable}
      canConfirm={changed}
      undoable={undoable}
      undoText={changed ? undoText : undefined}
      onConfirm={() => onConfirm(next, { undoable })}
    >
      <Who user={user} />
      <div role="radiogroup" aria-label="New plan" className="grid gap-1">
        {plans.map((p) => {
          const active = next === p;
          return (
            <label
              key={p}
              className={cn(
                'flex cursor-pointer items-start gap-2.5 rounded-2xl border px-3 py-2 text-[13px] transition-colors duration-150 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--ring))]',
                active ? 'border-[hsl(var(--brand-300))] bg-[hsl(var(--brand-100))]' : 'border-[hsl(var(--wb-line))] hover:border-[hsl(var(--brand-300))] hover:bg-[hsl(var(--brand-50))]',
              )}
            >
              <input
                type="radio"
                name="admin-plan"
                value={p}
                checked={active}
                onChange={() => setNext(p)}
                className="mt-0.5 accent-[hsl(var(--brand-solid))]"
              />
              <span className="min-w-0">
                <span className="font-medium text-foreground">
                  {p}
                  {p === current && <span className="ml-1.5 font-normal text-muted-foreground">current</span>}
                </span>
                <span className="block text-muted-foreground">{PLAN_COPY[p]}</span>
              </span>
            </label>
          );
        })}
      </div>
      {!assignable && (
        <p className="text-[13px] leading-5 text-[var(--warning)]">
          This account is on &quot;{current}&quot;, which this page cannot assign. Changing it cannot be reversed from here.
        </p>
      )}
      {changed && (
        <div className="space-y-1 rounded-2xl bg-[hsl(var(--wb-pill))] px-3 py-2.5 text-[13px]">
          <div className="font-medium text-foreground">What will happen</div>
          <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
            <li>
              Plan <span className="text-foreground">{current}</span> to <span className="text-foreground">{next}</span>, effective on their next API request.
            </li>
            {toBeta && (
              <>
                <li>
                  Claims one beta seat{left !== undefined && left !== null ? ` (${left} left)` : ''}
                  {left === 0 ? '. No seats are left in the counter' : ''}.
                </li>
                <li>
                  Overwrites the quota counters with the beta seed: {betaSeedReference.module1RunsRemaining} M1 runs,{' '}
                  {betaSeedReference.module2RunsRemaining} annotation runs, chat 0 / {betaSeedReference.chatExchangesLimit},{' '}
                  {betaSeedReference.filterAppliesRemaining} filter applies. Existing usage is reset.
                </li>
              </>
            )}
            {fromBeta && <li>Releases their beta seat. Quota counters are left as they are.</li>}
            {!toBeta && !fromBeta && <li>Quotas and devices are not touched.</li>}
          </ul>
        </div>
      )}
    </ConfirmDialog>
  );
}

export function QuotasDialog({ user, fields, onClose, onConfirm }) {
  const current = useMemo(() => {
    const out = {};
    for (const f of fields) {
      out[f.key] = f.key === 'filterAppliesRemaining'
        ? user.filterAppliesRemaining ?? user.acmgExomiserAppliesRemaining ?? null
        : user[f.key] ?? null;
    }
    return out;
  }, [user, fields]);
  const [draft, setDraft] = useState(() => Object.fromEntries(fields.map((f) => [f.key, current[f.key] ?? ''])));

  const { changes, invalid } = useMemo(() => {
    const list = [];
    let bad = null;
    for (const f of fields) {
      const raw = draft[f.key];
      if (raw === '' || raw === null || raw === undefined) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || !Number.isInteger(n)) { bad = `${f.label} must be a whole number.`; continue; }
      if (n !== current[f.key]) list.push({ ...f, before: current[f.key], after: n });
    }
    return { changes: list, invalid: bad };
  }, [draft, fields, current]);

  const undoable = changes.length > 0 && changes.every((c) => typeof c.before === 'number');
  const writesFilterTwice = changes.some((c) => c.key === 'filterAppliesRemaining');

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`Quotas for ${labelOf(user)}`}
      description="Blank leaves a field unchanged. Raise a “left” field to top a tester up; lower “Chat used” to give chat back."
      confirmLabel="Update quotas"
      hold={changes.length > 0 && !undoable}
      canConfirm={changes.length > 0 && !invalid}
      undoable={undoable}
      undoText={changes.length > 0
        ? (undoable
          ? 'Use Undo in the confirmation toast to restore the previous values. The change is also recorded in the audit log.'
          : 'A field that has no value yet cannot be put back to empty, so this is not an exact undo. The change is recorded in the audit log.')
        : undefined}
      onConfirm={() => onConfirm(changes, { undoable })}
    >
      <Who user={user} />
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {fields.map((f) => (
          <label key={f.key} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{f.label}</span>
            <input
              type="number"
              inputMode="numeric"
              value={draft[f.key] ?? ''}
              placeholder={current[f.key] === null ? 'not set' : undefined}
              onChange={(e) => setDraft((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className={cn(inputCls, 'w-full')}
            />
          </label>
        ))}
      </div>
      {invalid && <p role="alert" className="text-xs text-[var(--error)]">{invalid}</p>}
      {changes.length > 0 && !invalid && (
        <div className="space-y-1 rounded-2xl bg-[hsl(var(--wb-pill))] px-3 py-2.5 text-[13px]">
          <div className="font-medium text-foreground">What will happen</div>
          <ul className="space-y-0.5 tabular-nums">
            {changes.map((c) => (
              <li key={c.key} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{c.label}</span>
                <span className="text-foreground">{c.before ?? 'not set'} &rarr; {c.after}</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            Applies on the tester&apos;s next API request.
            {writesFilterTwice ? ' The ACMG/Phenotype budget is stored under two field names and both are updated.' : ''}
          </p>
        </div>
      )}
    </ConfirmDialog>
  );
}

export function SeatsDialog({ seats, draft, onDraft, onClose, onConfirm }) {
  const current = seats?.seats?.total;
  const claimed = seats?.seats?.claimed;
  const next = Number(draft);
  const valid = draft !== '' && Number.isFinite(next) && next >= 0;
  const total = Math.floor(next);
  const changed = valid && total !== current;
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="Change the number of beta seats"
      description="Seats decide how many new signups are provisioned straight into the closed beta. After that, signups land on free and the landing page shows the waitlist form."
      confirmLabel="Update seats"
      canConfirm={changed}
      undoable
      undoText="Use Undo in the confirmation toast to restore the previous total."
      onConfirm={() => onConfirm(total, current)}
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Total seats</span>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          className={cn(inputCls, 'w-32')}
          autoFocus
        />
      </label>
      {draft !== '' && !valid && <p role="alert" className="text-xs text-[var(--error)]">Seats must be a number, 0 or more.</p>}
      {changed && (
        <p className="rounded-2xl bg-[hsl(var(--wb-pill))] px-3 py-2.5 text-[13px] tabular-nums text-muted-foreground">
          Total <span className="text-foreground">{current ?? '–'} &rarr; {total}</span>
          {typeof claimed === 'number' && (
            <> · seats left <span className="text-foreground">{Math.max(0, total - claimed)}</span> ({claimed} claimed)</>
          )}
        </p>
      )}
    </ConfirmDialog>
  );
}

export function DeleteWaitlistDialog({ entry, onClose, onConfirm }) {
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`Remove ${entry.email} from the waitlist?`}
      description="The entry is deleted. They can rejoin from the landing page if they apply again."
      confirmLabel="Delete entry"
      destructive
      undoable={false}
      undoText="The entry is not kept anywhere once it is deleted."
      onConfirm={onConfirm}
    />
  );
}
