import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useSeo } from '@/hooks/useSeo';
import { Button } from '@/components/ui/button';
import {
  adminDeleteWaitlistEntry,
  adminGetBetaSeats,
  adminListUsers,
  adminListWaitlist,
  adminResetDevices,
  adminSetBetaSeats,
  adminSetCounters,
  adminSetPlan,
  adminSetWaitlistStatus,
  adminWhoAmI,
} from '@/services/backendApi';
import { CountUp, Dismissible, undoToast as fuseToast } from '@/components/motion';
import { AdminFrame, AdminHeader, Banner, Disclosure, HelpBody, HelpPopover } from '@/components/admin/adminUi';
import UsersTable from '@/components/admin/UsersTable';
import { SeatCards, WaitlistTable } from '@/components/admin/BetaWaitlist';
import {
  ChangePlanDialog,
  DeleteWaitlistDialog,
  QuotasDialog,
  ResetDevicesDialog,
  SeatsDialog,
} from '@/components/admin/UserDialogs';

/**
 * Unlisted internal tool for managing tiers and seeding closed-beta testers.
 *
 * Talks to /api/admin/*, NOT to Firestore. The user document now lives in MongoDB behind
 * the API — writing Firestore from here would silently do nothing, because the backend
 * stopped reading it. Authorisation is enforced server-side by an env allowlist
 * (ADMIN_EMAILS), and this page asks the API whether the caller is an admin rather than
 * keeping a copy of that list in the bundle.
 *
 * Closed beta: signup never grants beta. People apply from the landing page, which fills
 * the waitlist below; setting someone to `beta` here writes the full quota block and
 * claims one of the configured seats. Demoting them releases it.
 *
 * Every state-changing action (reset devices, change plan, quota edits, seat total,
 * waitlist delete) goes through a confirm dialog that names the account, says what will be
 * written and whether it can be undone. The handlers and API calls underneath are unchanged.
 *
 * There is no nav entry to this page by design — it is reached by typing the URL, and the
 * real access control is the server-side admin check, not this component's gate.
 */

/** `admin` is deliberately absent — this page should not be able to mint more admins. */
const PLANS = ['free', 'beta', 'pro', 'super_pro'];

const MAX_USERS = 500;

const MAX_WAITLIST = 200;

/**
 * Reference copy of the closed-beta seed, shown in the panel at the bottom.
 *
 * The authoritative values live server-side in main.py's BETA_SEED_FIELDS — setting a user
 * to `beta` through the API writes them. This copy is display-only, so nobody has to read
 * backend source to know what a seeded beta account looks like.
 */
const BETA_SEED_REFERENCE = {
  planStatus: 'beta',
  betaEnabled: true,
  betaCohort: 'wave-1',
  module1RunsRemaining: 3,
  module2RunsRemaining: 5,
  chatExchangesUsed: 0,
  chatExchangesLimit: 100,
  conversationWarningThreshold: 20,
  filterAppliesRemaining: 20,
  acmgExomiserAppliesRemaining: 20,
};

const QUOTA_FIELDS = [
  { key: 'module1RunsRemaining', label: 'M1 runs left' },
  { key: 'module2RunsRemaining', label: 'Annotation runs left' },
  { key: 'chatExchangesUsed', label: 'Chat used' },
  { key: 'chatExchangesLimit', label: 'Chat limit' },
  { key: 'filterAppliesRemaining', label: 'ACMG/Phenotype left' },
];

const UNDO_TOAST_MS = 10000;

const AdminPage = () => {
  useSeo({ title: 'Admin · Geneie', description: 'Internal tool', path: '/admin-haha', noindex: true });

  const { userId, isAuthReady, userLoading } = useAuth();

  /* The server decides; a list in the bundle would be decoration. null = answer not in
   * yet, so nothing renders instead of flashing the wrong state. */
  const [isAllowed, setIsAllowed] = useState(null);

  useEffect(() => {
    if (!isAuthReady) return;
    if (!userId) {
      setIsAllowed(false);
      return;
    }
    let active = true;
    adminWhoAmI()
      .then(() => active && setIsAllowed(true))
      .catch(() => active && setIsAllowed(false));
    return () => {
      active = false;
    };
  }, [isAuthReady, userId]);

  const [users, setUsers] = useState(null);
  const [listMeta, setListMeta] = useState({ total: 0, truncated: false });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'ok' | 'error', text }; only errors are shown
  const [filter, setFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [seats, setSeats] = useState(null); // { seats, betaUserCount, waitlistCount }
  const [seatDraft, setSeatDraft] = useState('');
  const [waitlist, setWaitlist] = useState(null);
  const lastErrorText = useRef(''); // keeps the banner text while it collapses out
  const [usersError, setUsersError] = useState(null); // set when the users list could not load; shown with Retry in the table
  const [waitlistError, setWaitlistError] = useState(null);
  /* The one open confirm dialog: { type: 'devices' | 'plan' | 'quotas' | 'seats' | 'waitlist-delete', ... }.
   * Held here, not in the row menu, because a dialog inside the menu would unmount with it. */
  const [pending, setPending] = useState(null);

  const loadUsers = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    setUsersError(null);
    try {
      const data = await adminListUsers({ limit: MAX_USERS });
      const rows = data.users || [];
      // Sorted client-side rather than by the API: an email sort would drop accounts with
      // no email, which are exactly the ones most likely to need attention.
      rows.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
      setUsers(rows);
      setListMeta({ total: data.total ?? rows.length, truncated: Boolean(data.nextCursor) });
      setStatus({
        type: 'ok',
        text: data.nextCursor
          ? `Showing the first ${rows.length} of ${data.total} users — use the filter to narrow.`
          : `${rows.length} user${rows.length === 1 ? '' : 's'} loaded.`,
      });
    } catch (error) {
      setUsers([]);
      setUsersError(error.message || 'Could not load users.');
    } finally {
      setBusy(false);
    }
  }, []);

  const loadSeats = useCallback(async () => {
    try {
      const data = await adminGetBetaSeats();
      setSeats(data);
      setSeatDraft(String(data.seats?.total ?? ''));
    } catch (error) {
      setStatus({ type: 'error', text: error.message || 'Could not load beta seats.' });
    }
  }, []);

  const loadWaitlist = useCallback(async () => {
    setWaitlistError(null);
    try {
      const data = await adminListWaitlist({ limit: MAX_WAITLIST });
      setWaitlist(data.entries || []);
    } catch (error) {
      setWaitlist([]);
      setWaitlistError(error.message || 'Could not load the waitlist.');
    }
  }, []);

  useEffect(() => {
    if (isAllowed !== true) return;
    loadUsers();
    loadSeats();
    loadWaitlist();
  }, [isAuthReady, isAllowed, loadUsers, loadSeats, loadWaitlist]);

  /* Resolves { ok: true, text } or { ok: false, error } so a confirm dialog can stay open
   * and show the server's message instead of closing on a failed write. */
  const applyChange = useCallback(async (uid, mutate, successText) => {
    setBusy(true);
    setStatus(null);
    try {
      const updated = await mutate();
      // Patch in place so the table reflects the write without a full reload.
      setUsers((prev) => (prev || []).map((u) => (u.uid === uid ? { ...u, ...updated } : u)));
      setStatus({ type: 'ok', text: successText });
      return { ok: true, text: successText };
    } catch (error) {
      const message = error.message || 'Update failed.';
      setStatus({ type: 'error', text: message });
      return { ok: false, error: message };
    } finally {
      setBusy(false);
    }
  }, []);

  const saveQuotas = useCallback((uid, fields) => applyChange(
    uid,
    () => adminSetCounters(uid, fields),
    "Quotas updated. Takes effect on the tester's next API request.",
  ), [applyChange]);

  /** `totalOverride` lets an Undo restore the previous total without touching the draft. */
  const saveSeatTotal = useCallback(async (totalOverride) => {
    const total = Number(totalOverride ?? seatDraft);
    if (!Number.isFinite(total) || total < 0) {
      const error = 'Seats must be a number, 0 or more.';
      setStatus({ type: 'error', text: error });
      return { ok: false, error };
    }
    setBusy(true);
    setStatus(null);
    try {
      const updated = await adminSetBetaSeats(Math.floor(total));
      setSeats((prev) => ({ ...(prev || {}), seats: updated }));
      setSeatDraft(String(updated.total ?? ''));
      const text = `Beta seats set to ${updated.total} — ${updated.remaining} left.`;
      setStatus({ type: 'ok', text });
      return { ok: true, text };
    } catch (error) {
      const message = error.message || 'Could not update seats.';
      setStatus({ type: 'error', text: message });
      return { ok: false, error: message };
    } finally {
      setBusy(false);
    }
  }, [seatDraft]);

  /* Seat accounting is server-side: the plan endpoint claims or releases a seat, so the
   * counter has to be re-read after a plan change rather than adjusted here. */
  const changePlan = useCallback(async (user, next) => {
    const plan = user.planStatus || 'free';
    // The API seeds the full beta quota block; a bare plan flip would leave a beta user
    // with no quotas at all.
    const result = await applyChange(
      user.uid,
      () => adminSetPlan(user.uid, next),
      next === 'beta'
        ? `${user.email || user.uid} promoted to beta with full quotas.`
        : `${user.email || user.uid} set to ${next}.`,
    );
    if (next === 'beta' || plan === 'beta') loadSeats();
    return result;
  }, [applyChange, loadSeats]);

  const updateWaitlistEntry = useCallback(async (entryId, nextStatus) => {
    setBusy(true);
    setStatus(null);
    try {
      const entry = await adminSetWaitlistStatus(entryId, nextStatus);
      setWaitlist((prev) => (prev || []).map((e) => (e.id === entryId ? { ...e, ...entry } : e)));
      const text = `${entry.email} marked ${entry.status}.`;
      setStatus({ type: 'ok', text });
      return { ok: true, text };
    } catch (error) {
      const message = error.message || 'Could not update the entry.';
      setStatus({ type: 'error', text: message });
      return { ok: false, error: message };
    } finally {
      setBusy(false);
    }
  }, []);

  const removeWaitlistEntry = useCallback(async (entry) => {
    setBusy(true);
    setStatus(null);
    try {
      await adminDeleteWaitlistEntry(entry.id);
      setWaitlist((prev) => (prev || []).filter((e) => e.id !== entry.id));
      setSeats((prev) => (prev ? { ...prev, waitlistCount: Math.max(0, (prev.waitlistCount || 1) - 1) } : prev));
      const text = `${entry.email} removed from the waitlist.`;
      setStatus({ type: 'ok', text });
      return { ok: true, text };
    } catch (error) {
      const message = error.message || 'Could not delete the entry.';
      setStatus({ type: 'error', text: message });
      return { ok: false, error: message };
    } finally {
      setBusy(false);
    }
  }, []);

  /* ---- confirmed actions: run the handler, then tell the admin what happened ---- */

  const confirmResetDevices = useCallback(async (user) => {
    const label = user.email || user.uid;
    const result = await applyChange(
      user.uid,
      () => adminResetDevices(user.uid),
      `Devices cleared for ${label}. They can sign in anywhere again.`,
    );
    if (!result.ok) { setStatus(null); return result; }
    // No Undo: the previous device list is not kept anywhere.
    toast.success(`Devices reset for ${label}`, {
      description: 'They can sign in anywhere again. Recorded in the audit log.',
    });
    return result;
  }, [applyChange]);

  const confirmChangePlan = useCallback(async (user, next, { undoable }) => {
    const label = user.email || user.uid;
    const prev = user.planStatus || 'free';
    const result = await changePlan(user, next);
    if (!result.ok) { setStatus(null); return result; }
    if (undoable) {
      fuseToast(`${label} set to ${next}. Recorded in the audit log.`, async () => {
        const back = await changePlan({ ...user, planStatus: next }, prev);
        if (back.ok) toast.success(`${label} restored to ${prev}`);
        else toast.error(`Could not undo: ${back.error}`);
      }, UNDO_TOAST_MS);
    } else {
      toast.success(`${label} set to ${next}`, {
        description: next === 'beta' ? 'Full beta quotas seeded. Recorded in the audit log.' : 'Recorded in the audit log.',
      });
    }
    return result;
  }, [changePlan]);

  const confirmQuotas = useCallback(async (user, changes, { undoable }) => {
    const label = user.email || user.uid;
    const fields = Object.fromEntries(changes.map((c) => [c.key, c.after]));
    const result = await saveQuotas(user.uid, fields);
    if (!result.ok) { setStatus(null); return result; }
    const previous = Object.fromEntries(changes.map((c) => [c.key, c.before]));
    if (undoable) {
      fuseToast(`Quotas updated for ${label}. Recorded in the audit log.`, async () => {
        const back = await saveQuotas(user.uid, previous);
        if (back.ok) toast.success(`Quotas restored for ${label}`);
        else toast.error(`Could not undo: ${back.error}`);
      }, UNDO_TOAST_MS);
    } else {
      toast.success(`Quotas updated for ${label}`, {
        description: 'Takes effect on their next API request. Recorded in the audit log.',
      });
    }
    return result;
  }, [saveQuotas]);

  const confirmSeats = useCallback(async (total, previousTotal) => {
    const result = await saveSeatTotal(total);
    if (!result.ok) { setStatus(null); return result; }
    if (typeof previousTotal === 'number') {
      fuseToast(result.text, async () => {
        const back = await saveSeatTotal(previousTotal);
        if (back.ok) toast.success(`Beta seats restored to ${previousTotal}`);
        else toast.error(`Could not undo: ${back.error}`);
      }, UNDO_TOAST_MS);
    } else {
      toast.success(result.text);
    }
    return result;
  }, [saveSeatTotal]);

  const changeWaitlistStatus = useCallback(async (entry, next) => {
    const previous = entry.status || 'new';
    if (next === previous) return;
    const result = await updateWaitlistEntry(entry.id, next);
    if (!result.ok) { toast.error(result.error); return; }
    fuseToast(result.text, async () => {
      const back = await updateWaitlistEntry(entry.id, previous);
      if (!back.ok) toast.error(`Could not undo: ${back.error}`);
    }, UNDO_TOAST_MS);
  }, [updateWaitlistEntry]);

  const confirmDeleteWaitlist = useCallback(async (entry) => {
    const result = await removeWaitlistEntry(entry);
    if (!result.ok) { setStatus(null); return result; }
    toast.success(result.text);
    return result;
  }, [removeWaitlistEntry]);

  const openAction = useCallback((type, user) => setPending({ type, user }), []);

  const openSeats = useCallback(() => {
    setSeatDraft(String(seats?.seats?.total ?? ''));
    setPending({ type: 'seats' });
  }, [seats]);

  const closePending = useCallback(() => setPending(null), []);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return (users || []).filter((u) => {
      if (planFilter !== 'all' && (u.planStatus || 'free') !== planFilter) return false;
      if (!needle) return true;
      return `${u.email || ''} ${u.uid} ${u.betaCohort || ''}`.toLowerCase().includes(needle);
    });
  }, [users, filter, planFilter]);

  const counts = useMemo(() => {
    const acc = {};
    for (const u of users || []) {
      const p = u.planStatus || 'free';
      acc[p] = (acc[p] || 0) + 1;
    }
    return acc;
  }, [users]);

  if (!isAuthReady || userLoading || isAllowed === null) return null;
  if (!isAllowed) return <Navigate to="/app" replace />;

  const loadedCount = (users || []).length;
  if (status?.type === 'error') lastErrorText.current = status.text;

  return (
    <AdminFrame>
      <AdminHeader
        current="users"
        title="Users"
        subtitle={users === null
          ? 'Loading…'
          : usersError
            ? 'Could not load users'
            : listMeta.truncated
            ? <><CountUp value={loadedCount} startAt={0} /> of {listMeta.total.toLocaleString()} users loaded</>
            : <><CountUp value={loadedCount} startAt={0} /> user{loadedCount === 1 ? '' : 's'}</>}
        help={(
          <HelpPopover title="Users and tiers" align="start">
            <HelpBody
              what="Signup always creates a free account. Seats are never handed out automatically."
              items={[
                ['Getting a seat', 'People apply from the landing page. You grant a seat by changing their plan to beta, which claims one and seeds the full quota block.'],
                ['When it applies', 'Plan, quota and device changes take effect on the tester’s next API request.'],
                ['Confirmations', 'Every change asks you to confirm first and says whether it can be undone. Destructive or irreversible changes are confirmed by pressing and holding the button. Plan, quota, seat and status changes that can be reversed show an Undo in the toast.'],
                ['Admin plan', 'The admin plan cannot be assigned from this page.'],
              ]}
            />
          </HelpPopover>
        )}
        actions={(
          <Button variant="outline" size="sm" onClick={loadUsers} disabled={busy} aria-busy={busy}>
            <RefreshCw className={busy ? 'size-3.5 animate-spin motion-reduce:animate-none' : 'size-3.5'} aria-hidden="true" />
            {busy ? 'Working…' : 'Reload'}
          </Button>
        )}
      />

      <Dismissible show={status?.type === 'error'}>
        <div className="mb-4">
          <Banner
            tone="error"
            action={<Button variant="ghost" size="xs" onClick={() => setStatus(null)}>Dismiss</Button>}
          >
            {status?.text || lastErrorText.current}
          </Banner>
        </div>
      </Dismissible>

      <div className="space-y-4">
        <SeatCards
          seats={seats}
          busy={busy}
          onEditTotal={openSeats}
          onShowBeta={() => { setPlanFilter('beta'); setFilter(''); }}
        />

        <UsersTable
          users={users}
          visible={visible}
          counts={counts}
          total={listMeta.total}
          truncated={listMeta.truncated}
          filter={filter}
          onFilter={setFilter}
          planFilter={planFilter}
          onPlanFilter={setPlanFilter}
          busy={busy}
          onAction={openAction}
          error={usersError}
          onRetry={loadUsers}
        />

        <WaitlistTable
          waitlist={waitlist}
          busy={busy}
          error={waitlistError}
          onReload={loadWaitlist}
          onStatus={changeWaitlistStatus}
          onDelete={(entry) => setPending({ type: 'waitlist-delete', entry })}
        />

        <div className="wb-card px-3 py-2">
          <Disclosure label="Beta seed fields (written server-side when you set a user to beta)">
            <pre className="overflow-x-auto rounded-2xl bg-[hsl(var(--wb-pill))] p-3 font-mono text-xs leading-5 text-muted-foreground">
              {JSON.stringify(BETA_SEED_REFERENCE, null, 2)}
            </pre>
          </Disclosure>
        </div>
      </div>

      {pending?.type === 'devices' && (
        <ResetDevicesDialog
          key={pending.user.uid}
          user={pending.user}
          onClose={closePending}
          onConfirm={() => confirmResetDevices(pending.user)}
        />
      )}
      {pending?.type === 'plan' && (
        <ChangePlanDialog
          key={pending.user.uid}
          user={pending.user}
          plans={PLANS}
          seats={seats}
          betaSeedReference={BETA_SEED_REFERENCE}
          onClose={closePending}
          onConfirm={(next, opts) => confirmChangePlan(pending.user, next, opts)}
        />
      )}
      {pending?.type === 'quotas' && (
        <QuotasDialog
          key={pending.user.uid}
          user={pending.user}
          fields={QUOTA_FIELDS}
          onClose={closePending}
          onConfirm={(changes, opts) => confirmQuotas(pending.user, changes, opts)}
        />
      )}
      {pending?.type === 'seats' && (
        <SeatsDialog
          seats={seats}
          draft={seatDraft}
          onDraft={setSeatDraft}
          onClose={closePending}
          onConfirm={confirmSeats}
        />
      )}
      {pending?.type === 'waitlist-delete' && (
        <DeleteWaitlistDialog
          key={pending.entry.id}
          entry={pending.entry}
          onClose={closePending}
          onConfirm={() => confirmDeleteWaitlist(pending.entry)}
        />
      )}
    </AdminFrame>
  );
};

export default AdminPage;
