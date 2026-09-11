import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSeo } from '@/hooks/useSeo';
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
 * There is no nav entry to this page by design — it is reached by typing the URL, and the
 * real access control is the server-side admin check, not this component's gate.
 */

/** `admin` is deliberately absent — this page should not be able to mint more admins. */
const PLANS = ['free', 'beta', 'pro', 'super_pro'];

const MAX_USERS = 500;

const WAITLIST_STATUSES = ['new', 'contacted', 'invited', 'declined'];

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

const PLAN_COLORS = {
  beta: 'var(--accent-teal)',
  pro: 'var(--success)',
  super_pro: 'var(--success)',
  admin: 'var(--warning)',
  free: 'var(--text-tertiary)',
};

const inputStyle = {
  backgroundColor: 'var(--bg-surface)',
  borderColor: 'var(--border-default)',
  color: 'var(--text-primary)',
};

const cellStyle = { borderColor: 'var(--border-subtle)' };

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
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'ok' | 'error', text }
  const [filter, setFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [expandedUid, setExpandedUid] = useState(null);
  const [draft, setDraft] = useState({});
  const [seats, setSeats] = useState(null); // { seats, betaUserCount, waitlistCount }
  const [seatDraft, setSeatDraft] = useState('');
  const [waitlist, setWaitlist] = useState(null);

  const loadUsers = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    try {
      const data = await adminListUsers({ limit: MAX_USERS });
      const rows = data.users || [];
      // Sorted client-side rather than by the API: an email sort would drop accounts with
      // no email, which are exactly the ones most likely to need attention.
      rows.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
      setUsers(rows);
      setStatus({
        type: 'ok',
        text: data.nextCursor
          ? `Showing the first ${rows.length} of ${data.total} users — use the filter to narrow.`
          : `${rows.length} user${rows.length === 1 ? '' : 's'} loaded.`,
      });
    } catch (error) {
      setUsers([]);
      setStatus({ type: 'error', text: error.message || 'Could not load users.' });
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
    try {
      const data = await adminListWaitlist({ limit: MAX_WAITLIST });
      setWaitlist(data.entries || []);
    } catch (error) {
      setWaitlist([]);
      setStatus({ type: 'error', text: error.message || 'Could not load the waitlist.' });
    }
  }, []);

  useEffect(() => {
    if (isAllowed !== true) return;
    loadUsers();
    loadSeats();
    loadWaitlist();
  }, [isAuthReady, isAllowed, loadUsers, loadSeats, loadWaitlist]);

  const applyChange = useCallback(async (uid, mutate, successText) => {
    setBusy(true);
    setStatus(null);
    try {
      const updated = await mutate();
      // Patch in place so the table reflects the write without a full reload.
      setUsers((prev) => (prev || []).map((u) => (u.uid === uid ? { ...u, ...updated } : u)));
      setStatus({ type: 'ok', text: successText });
    } catch (error) {
      setStatus({ type: 'error', text: error.message || 'Update failed.' });
    } finally {
      setBusy(false);
    }
  }, []);

  const openEditor = useCallback((user) => {
    if (expandedUid === user.uid) {
      setExpandedUid(null);
      return;
    }
    setExpandedUid(user.uid);
    setDraft(
      QUOTA_FIELDS.reduce((acc, f) => {
        acc[f.key] = user[f.key] ?? '';
        return acc;
      }, {}),
    );
  }, [expandedUid]);

  const saveQuotas = useCallback((uid) => {
    const fields = {};
    for (const f of QUOTA_FIELDS) {
      const raw = draft[f.key];
      if (raw === '' || raw === null || raw === undefined) continue;
      const n = Number(raw);
      if (Number.isFinite(n)) fields[f.key] = n;
    }
    if (Object.keys(fields).length === 0) {
      setStatus({ type: 'error', text: 'Nothing to write.' });
      return;
    }
    applyChange(
      uid,
      () => adminSetCounters(uid, fields),
      "Quotas updated. Takes effect on the tester's next API request.",
    );
  }, [draft, applyChange]);

  const saveSeatTotal = useCallback(async () => {
    const total = Number(seatDraft);
    if (!Number.isFinite(total) || total < 0) {
      setStatus({ type: 'error', text: 'Seats must be a number, 0 or more.' });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const updated = await adminSetBetaSeats(Math.floor(total));
      setSeats((prev) => ({ ...(prev || {}), seats: updated }));
      setStatus({
        type: 'ok',
        text: `Beta seats set to ${updated.total} — ${updated.remaining} left.`,
      });
    } catch (error) {
      setStatus({ type: 'error', text: error.message || 'Could not update seats.' });
    } finally {
      setBusy(false);
    }
  }, [seatDraft]);

  /* Seat accounting is server-side: the plan endpoint claims or releases a seat, so the
   * counter has to be re-read after a plan change rather than adjusted here. */
  const changePlan = useCallback((user, next) => {
    const plan = user.planStatus || 'free';
    applyChange(
      user.uid,
      () => adminSetPlan(user.uid, next),
      next === 'beta'
        ? `${user.email || user.uid} promoted to beta with full quotas.`
        : `${user.email || user.uid} set to ${next}.`,
    ).then(() => {
      if (next === 'beta' || plan === 'beta') loadSeats();
    });
  }, [applyChange, loadSeats]);

  const updateWaitlistEntry = useCallback(async (entryId, nextStatus) => {
    setBusy(true);
    setStatus(null);
    try {
      const entry = await adminSetWaitlistStatus(entryId, nextStatus);
      setWaitlist((prev) => (prev || []).map((e) => (e.id === entryId ? { ...e, ...entry } : e)));
      setStatus({ type: 'ok', text: `${entry.email} marked ${entry.status}.` });
    } catch (error) {
      setStatus({ type: 'error', text: error.message || 'Could not update the entry.' });
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
      setStatus({ type: 'ok', text: `${entry.email} removed from the waitlist.` });
    } catch (error) {
      setStatus({ type: 'error', text: error.message || 'Could not delete the entry.' });
    } finally {
      setBusy(false);
    }
  }, []);

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

  return (
    <div className="min-h-screen px-6 py-10" style={{ backgroundColor: 'var(--bg-app)' }}>
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex items-baseline justify-between gap-4 mb-1">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Users &amp; tiers
          </h1>
          <button
            type="button"
            onClick={loadUsers}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-lg border disabled:opacity-50"
            style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
          >
            {busy ? 'Working…' : 'Reload'}
          </button>
        </div>
        <p className="text-xs mb-5" style={{ color: 'var(--text-tertiary)' }}>
          Signup always creates <code>planStatus: "free"</code> — seats are never handed out
          automatically. People apply from the landing page; you grant a seat by setting them
          to <code>beta</code> here, which claims one. Takes effect on their next API request.
        </p>

        <div
          className="rounded-xl border p-4 mb-5"
          style={{ backgroundColor: 'var(--bg-surface-raised)', borderColor: 'var(--border-default)' }}
        >
          <div className="flex flex-wrap items-end gap-5">
            <div>
              <div className="text-2xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Beta seats</div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={seatDraft}
                  onChange={(e) => setSeatDraft(e.target.value)}
                  className="w-24 px-2 py-1.5 text-sm rounded-md border tabular-nums"
                  style={inputStyle}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={saveSeatTotal}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-50"
                  style={{ backgroundColor: 'var(--accent-teal)', color: 'var(--accent-teal-contrast)' }}
                >
                  Save
                </button>
              </div>
            </div>

            <div className="tabular-nums">
              <div className="text-2xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Claimed</div>
              <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                {seats?.seats?.claimed ?? '—'}
              </div>
            </div>

            <div className="tabular-nums">
              <div className="text-2xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Left</div>
              <div
                className="text-lg font-semibold"
                style={{ color: seats?.seats?.remaining ? 'var(--accent-teal)' : 'var(--text-secondary)' }}
              >
                {seats?.seats?.remaining ?? '—'}
              </div>
            </div>

            <div className="tabular-nums">
              <div className="text-2xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Beta accounts</div>
              <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                {seats?.betaUserCount ?? '—'}
              </div>
            </div>

            <div className="tabular-nums">
              <div className="text-2xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Waitlist</div>
              <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                {seats?.waitlistCount ?? '—'}
              </div>
            </div>
          </div>

          {seats && seats.betaUserCount !== seats.seats?.claimed && (
            /* The counter and the real number of beta accounts are maintained separately,
             * so a mismatch means a seat was leaked or a plan was changed outside this
             * tool. Raising or lowering the total is how you bring them back in step. */
            <p className="text-2xs mt-3" style={{ color: 'var(--warning)' }}>
              Counter says {seats.seats?.claimed} claimed but there are {seats.betaUserCount} beta
              accounts. Adjust the total if the beta should stay open for the difference.
            </p>
          )}
          <p className="text-2xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
            The first {seats?.seats?.total ?? 'N'} signups are provisioned straight into beta. After
            that, signups land on free and the landing page shows the waitlist form.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by email, UID or cohort"
            className="flex-1 min-w-[220px] px-3 py-2 text-sm rounded-lg border"
            style={inputStyle}
          />
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border"
            style={inputStyle}
          >
            <option value="all">All plans ({(users || []).length})</option>
            {['free', 'beta', 'pro', 'super_pro', 'admin', 'guest'].map((p) => (
              <option key={p} value={p}>{p} ({counts[p] || 0})</option>
            ))}
          </select>
        </div>

        {status && (
          <p
            className="text-xs mb-4"
            style={{ color: status.type === 'error' ? 'var(--error)' : 'var(--text-tertiary)' }}
          >
            {status.text}
          </p>
        )}

        <div
          className="rounded-xl border overflow-x-auto"
          style={{ backgroundColor: 'var(--bg-surface-raised)', borderColor: 'var(--border-default)' }}
        >
          <table className="w-full text-left" style={{ minWidth: '760px' }}>
            <thead>
              <tr className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
                <th className="px-3 py-2 font-medium border-b" style={cellStyle}>User</th>
                <th className="px-3 py-2 font-medium border-b" style={cellStyle}>Plan</th>
                <th className="px-3 py-2 font-medium border-b tabular-nums" style={cellStyle}>
                  M1 / M2 / Chat / Filters
                </th>
                <th className="px-3 py-2 font-medium border-b" style={cellStyle}>Set plan</th>
                <th className="px-3 py-2 font-medium border-b" style={cellStyle} />
              </tr>
            </thead>
            <tbody>
              {users === null && (
                <tr><td colSpan={5} className="px-3 py-6 text-xs" style={{ color: 'var(--text-tertiary)' }}>Loading…</td></tr>
              )}
              {users !== null && visible.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-xs" style={{ color: 'var(--text-tertiary)' }}>No matching users.</td></tr>
              )}
              {visible.map((u) => {
                const plan = u.planStatus || 'free';
                const isOpen = expandedUid === u.uid;
                return (
                  <Fragment key={u.uid}>
                    <tr className="text-xs align-middle">
                      <td className="px-3 py-2 border-b" style={cellStyle}>
                        <div style={{ color: 'var(--text-primary)' }}>{u.email || '(no email)'}</div>
                        <div className="text-2xs font-mono" style={{ color: 'var(--text-tertiary)' }}>{u.uid}</div>
                      </td>
                      <td className="px-3 py-2 border-b" style={cellStyle}>
                        <span className="font-medium" style={{ color: PLAN_COLORS[plan] || 'var(--text-secondary)' }}>
                          {plan}
                        </span>
                        {u.betaCohort && (
                          <div className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>{u.betaCohort}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 border-b tabular-nums" style={{ ...cellStyle, color: 'var(--text-secondary)' }}>
                        {u.module1RunsRemaining ?? '—'} / {u.module2RunsRemaining ?? '—'} /{' '}
                        {u.chatExchangesUsed ?? '—'}
                        {u.chatExchangesLimit != null ? ` of ${u.chatExchangesLimit}` : ''} /{' '}
                        {u.filterAppliesRemaining ?? u.acmgExomiserAppliesRemaining ?? '—'}
                      </td>
                      <td className="px-3 py-2 border-b" style={cellStyle}>
                        <select
                          value={PLANS.includes(plan) ? plan : ''}
                          disabled={busy}
                          onChange={(e) => {
                            const next = e.target.value;
                            if (!next || next === plan) return;
                            // The API seeds the full beta quota block; a bare plan flip
                            // would leave a beta user with no quotas at all.
                            changePlan(u, next);
                          }}
                          className="px-2 py-1 text-2xs rounded-md border"
                          style={inputStyle}
                        >
                          {!PLANS.includes(plan) && <option value="">{plan}</option>}
                          {PLANS.map((p) => (
                            <option key={p} value={p}>{p === 'beta' ? 'beta (full seed)' : p}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 border-b text-right" style={cellStyle}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => applyChange(
                              u.uid,
                              () => adminResetDevices(u.uid),
                              `Devices cleared for ${u.email || u.uid}. They can sign in anywhere again.`,
                            )}
                            className="text-2xs px-2 py-1 rounded-md border disabled:opacity-50"
                            style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
                          >
                            Devices
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditor(u)}
                            className="text-2xs px-2 py-1 rounded-md border"
                            style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
                          >
                            {isOpen ? 'Close' : 'Quotas'}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr>
                        <td colSpan={5} className="px-3 py-3 border-b" style={{ ...cellStyle, backgroundColor: 'var(--bg-surface)' }}>
                          <div className="flex flex-wrap items-end gap-3">
                            {QUOTA_FIELDS.map((f) => (
                              <label key={f.key} className="flex flex-col gap-1">
                                <span className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>{f.label}</span>
                                <input
                                  type="number"
                                  value={draft[f.key] ?? ''}
                                  onChange={(e) => setDraft((prev) => ({ ...prev, [f.key]: e.target.value }))}
                                  className="w-24 px-2 py-1 text-xs rounded-md border tabular-nums"
                                  style={inputStyle}
                                />
                              </label>
                            ))}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => saveQuotas(u.uid)}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-50"
                              style={{ backgroundColor: 'var(--accent-teal)', color: 'var(--accent-teal-contrast)' }}
                            >
                              Save quotas
                            </button>
                          </div>
                          <p className="text-2xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                            Blank = leave unchanged. Raise the &ldquo;remaining&rdquo; fields to top a tester up; lower
                            &ldquo;Chat used&rdquo; to give chat back.
                          </p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-baseline justify-between gap-4 mt-10 mb-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Waitlist
          </h2>
          <button
            type="button"
            onClick={loadWaitlist}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-lg border disabled:opacity-50"
            style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
          >
            Reload
          </button>
        </div>

        <div
          className="rounded-xl border overflow-x-auto"
          style={{ backgroundColor: 'var(--bg-surface-raised)', borderColor: 'var(--border-default)' }}
        >
          <table className="w-full text-left" style={{ minWidth: '620px' }}>
            <thead>
              <tr className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
                <th className="px-3 py-2 font-medium border-b" style={cellStyle}>Email</th>
                <th className="px-3 py-2 font-medium border-b" style={cellStyle}>Joined</th>
                <th className="px-3 py-2 font-medium border-b" style={cellStyle}>Source</th>
                <th className="px-3 py-2 font-medium border-b" style={cellStyle}>Status</th>
                <th className="px-3 py-2 font-medium border-b" style={cellStyle} />
              </tr>
            </thead>
            <tbody>
              {waitlist === null && (
                <tr><td colSpan={5} className="px-3 py-6 text-xs" style={{ color: 'var(--text-tertiary)' }}>Loading…</td></tr>
              )}
              {waitlist !== null && waitlist.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-xs" style={{ color: 'var(--text-tertiary)' }}>Nobody is waiting.</td></tr>
              )}
              {(waitlist || []).map((entry) => (
                <tr key={entry.id} className="text-xs align-middle">
                  <td className="px-3 py-2 border-b" style={{ ...cellStyle, color: 'var(--text-primary)' }}>
                    {entry.email}
                  </td>
                  <td className="px-3 py-2 border-b" style={{ ...cellStyle, color: 'var(--text-tertiary)' }}>
                    {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3 py-2 border-b" style={{ ...cellStyle, color: 'var(--text-tertiary)' }}>
                    {entry.source || '—'}
                  </td>
                  <td className="px-3 py-2 border-b" style={cellStyle}>
                    <select
                      value={entry.status || 'new'}
                      disabled={busy}
                      onChange={(e) => updateWaitlistEntry(entry.id, e.target.value)}
                      className="px-2 py-1 text-2xs rounded-md border"
                      style={inputStyle}
                    >
                      {WAITLIST_STATUSES.map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 border-b text-right" style={cellStyle}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => removeWaitlistEntry(entry)}
                      className="text-2xs px-2 py-1 rounded-md border disabled:opacity-50"
                      style={{ borderColor: 'var(--border-default)', color: 'var(--error)' }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <details className="mt-5">
          <summary className="text-2xs cursor-pointer" style={{ color: 'var(--text-tertiary)' }}>
            Beta seed fields (written server-side when you set a user to beta)
          </summary>
          <pre
            className="mt-2 text-2xs overflow-x-auto p-2 rounded-md"
            style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)' }}
          >
            {JSON.stringify(BETA_SEED_REFERENCE, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
};

export default AdminPage;
