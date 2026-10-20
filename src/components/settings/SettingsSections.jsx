/**
 * The Settings page sections. Each one is self-contained: it reads and writes its own
 * settings through the APIs and local preferences that already exist, so nothing here
 * needs a backend change.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ExternalLink, LogOut } from 'lucide-react';
import { getAuth, deleteUser, sendPasswordResetEmail } from 'firebase/auth';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { performLogout } from '@/lib/logout';
import { visibleMeters, formatMeter, formatMeterDetail } from '@/services/tierLimits';
import { getConversations } from '@/services/mongodbApi';
import {
  getNotificationPrefs,
  setNotificationPrefs,
  getNcbiKeyStatus,
  setNcbiKey,
  clearNcbiKey,
  deleteAccountData,
} from '@/services/backendApi';
import {
  PIPELINE_RUN_MANUAL,
  PIPELINE_RUN_AUTOMATIC,
  getDefaultPipelineRunMode,
  setDefaultPipelineRunMode,
} from '@/components/PipelineRunModeToggle';
import { writeTuningActive, requestTuningPanel } from '@/hooks/useTuningCompare';
import SubscriptionPage from '@/components/SubscriptionPage';
import { version as appVersion } from '../../../package.json';
import {
  SettingsSection,
  SettingsGroupLabel,
  SettingsRow,
  SettingsSwitch,
  SettingsSegmented,
  SettingsButton,
  SettingsNote,
} from './SettingsUI';

/* ── General ─────────────────────────────────────────────────────────────────── */

const EXPLORE_KEY = 'geneie_exploratory_mode'; // read by useChatMessaging + ExploratoryModeToggle

function readExplore() {
  try {
    return window.localStorage?.getItem(EXPLORE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function GeneralSection() {
  const { preference, setPreference } = useTheme();
  const [explore, setExplore] = useState(readExplore);
  const [analysisMode, setAnalysisMode] = useState(getDefaultPipelineRunMode);

  const changeExplore = (next) => {
    setExplore(next);
    try {
      if (next) window.localStorage.setItem(EXPLORE_KEY, 'on');
      else window.localStorage.removeItem(EXPLORE_KEY);
    } catch {
      /* storage blocked */
    }
  };

  return (
    <SettingsSection title="General">
      <SettingsRow label="Theme" description="System follows your device.">
        <SettingsSegmented
          label="Theme"
          value={preference}
          onChange={setPreference}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </SettingsRow>
      <SettingsRow
        label="Chat mode"
        description="Standard gives fast, reproducible answers. Explore lets an agent reason across your data in several steps."
      >
        <SettingsSegmented
          label="Chat mode"
          value={explore ? 'explore' : 'standard'}
          onChange={(v) => changeExplore(v === 'explore')}
          options={[
            { value: 'standard', label: 'Standard' },
            { value: 'explore', label: 'Explore' },
          ]}
        />
      </SettingsRow>
      <SettingsRow
        label="Default analysis mode"
        description="What new uploads start on. Automatic runs annotation and phenotype prioritization for you."
      >
        <SettingsSegmented
          label="Default analysis mode"
          value={analysisMode}
          onChange={(v) => {
            setAnalysisMode(v);
            setDefaultPipelineRunMode(v);
          }}
          options={[
            { value: PIPELINE_RUN_MANUAL, label: 'Manual' },
            { value: PIPELINE_RUN_AUTOMATIC, label: 'Automatic' },
          ]}
        />
      </SettingsRow>
    </SettingsSection>
  );
}

/* ── Plan & usage ────────────────────────────────────────────────────────────── */

// The shared meter labels use internal names; say what the user ran instead.
const METER_DISPLAY_LABELS = {
  module1: 'FASTQ → VCF runs',
  module2: 'Annotation runs',
  chat: 'Chat exchanges',
  filterApplies: 'ACMG / phenotype filters',
};

const PLAN_LABELS = { admin: 'Admin', pro: 'Pro', super_pro: 'Pro', free: 'Free', guest: 'Guest' };

export function UsageSection() {
  const { userId, userProfile, limits } = useAuth();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [counts, setCounts] = useState(null); // { chats, files }

  useEffect(() => {
    let cancelled = false;
    getConversations()
      .then((list) => {
        if (cancelled) return;
        setCounts({
          chats: list.length,
          files: list.filter((c) => c.document?.file_name || c.document?.s3_url).length,
        });
      })
      .catch(() => { if (!cancelled) setCounts(null); });
    return () => { cancelled = true; };
  }, []);

  const plan = userProfile?.planStatus || 'free';
  const planLabel = PLAN_LABELS[plan] || plan;
  const canUpgrade = plan === 'free';
  const meters = visibleMeters(limits);

  return (
    <SettingsSection title="Plan & usage">
      <SettingsRow label="Plan" description={canUpgrade ? 'Upgrade for more runs and unlimited chat.' : undefined}>
        <span
          className="text-2xs font-semibold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: 'var(--accent-teal-soft)', color: 'var(--accent-teal)' }}
        >
          {planLabel}
        </span>
        {canUpgrade && (
          <SettingsButton tone="primary" onClick={() => setShowUpgrade(true)}>
            Upgrade
          </SettingsButton>
        )}
      </SettingsRow>

      {meters.length > 0 && <SettingsGroupLabel>This period</SettingsGroupLabel>}
      {meters.map((m) => (
        <SettingsRow
          key={m.key}
          label={METER_DISPLAY_LABELS[m.key] || m.label}
          description={formatMeterDetail(limits, m) || undefined}
        >
          <span className="text-sm tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            {formatMeter(m) || '—'}
          </span>
        </SettingsRow>
      ))}

      <SettingsGroupLabel>Activity</SettingsGroupLabel>
      <SettingsRow label="Conversations">
        <span className="text-sm tabular-nums" style={{ color: 'var(--text-secondary)' }}>
          {counts ? counts.chats : '—'}
        </span>
      </SettingsRow>
      <SettingsRow label="Files uploaded">
        <span className="text-sm tabular-nums" style={{ color: 'var(--text-secondary)' }}>
          {counts ? counts.files : '—'}
        </span>
      </SettingsRow>

      <SubscriptionPage isOpen={showUpgrade} onClose={() => setShowUpgrade(false)} userId={userId} />
    </SettingsSection>
  );
}

/* ── Notifications ───────────────────────────────────────────────────────────── */

export function NotificationsSection() {
  const [prefs, setPrefs] = useState(null); // { email, in_app } once loaded
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getNotificationPrefs()
      .then((p) => { if (!cancelled) setPrefs(p); })
      .catch(() => { if (!cancelled) setError('Could not load notification settings.'); });
    return () => { cancelled = true; };
  }, []);

  const change = useCallback(async (key, value) => {
    const previous = prefs;
    setPrefs((p) => ({ ...(p || {}), [key]: value })); // optimistic
    setSaving(true);
    setError('');
    try {
      setPrefs(await setNotificationPrefs({ [key]: value }));
    } catch {
      setPrefs(previous);
      setError('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [prefs]);

  return (
    <SettingsSection title="Notifications">
      <SettingsRow label="Email me when a run is done" description="When FASTQ processing or annotation finishes or fails.">
        <SettingsSwitch
          label="Email me when a run is done"
          checked={prefs ? prefs.email !== false : true}
          disabled={!prefs || saving}
          onChange={(v) => change('email', v)}
        />
      </SettingsRow>
      <SettingsRow label="Show alerts in Geneie" description="Updates appear under the bell icon.">
        <SettingsSwitch
          label="Show alerts in Geneie"
          checked={prefs ? prefs.in_app !== false : true}
          disabled={!prefs || saving}
          onChange={(v) => change('in_app', v)}
        />
      </SettingsRow>
      <SettingsNote tone="error">{error}</SettingsNote>
    </SettingsSection>
  );
}

/* ── Integrations ────────────────────────────────────────────────────────────── */

export function IntegrationsSection() {
  const [hasKey, setHasKey] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState({ tone: 'muted', text: '' });

  useEffect(() => {
    let cancelled = false;
    getNcbiKeyStatus()
      .then((d) => { if (!cancelled) setHasKey(Boolean(d?.has_key)); })
      .catch(() => { if (!cancelled) setNote({ tone: 'error', text: 'Could not load your NCBI key status.' }); });
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    setBusy(true);
    setNote({ tone: 'muted', text: '' });
    try {
      await setNcbiKey(draft.trim());
      setHasKey(true);
      setEditing(false);
      setDraft('');
      setNote({ tone: 'success', text: 'Key saved.' });
    } catch (e) {
      setNote({ tone: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setNote({ tone: 'muted', text: '' });
    try {
      await clearNcbiKey();
      setHasKey(false);
      setNote({ tone: 'muted', text: 'Key removed. Literature enrichment uses the shared key again.' });
    } catch (e) {
      setNote({ tone: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const showInput = hasKey === false || editing;

  return (
    <SettingsSection title="Integrations">
      <SettingsRow
        htmlFor={showInput ? 'ncbi-key-input' : undefined}
        label="NCBI API key"
        description={
          <>
            Your own key makes literature enrichment faster. It is stored encrypted and never shown again.{' '}
            <a
              href="https://www.ncbi.nlm.nih.gov/account/settings/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 underline underline-offset-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              Get a key <ExternalLink className="w-3 h-3" aria-hidden />
            </a>
          </>
        }
      >
        {hasKey === null ? (
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Loading…</span>
        ) : showInput ? (
          <>
            <input
              id="ncbi-key-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Paste your key"
              className="w-48 px-2.5 py-1.5 rounded-lg text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)]"
              style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
            />
            {editing && (
              <SettingsButton onClick={() => { setEditing(false); setDraft(''); }} disabled={busy}>
                Cancel
              </SettingsButton>
            )}
            <SettingsButton tone="primary" onClick={save} disabled={busy || draft.trim().length < 20}>
              Save
            </SettingsButton>
          </>
        ) : (
          <>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Key on file</span>
            <SettingsButton onClick={() => setEditing(true)} disabled={busy}>Replace</SettingsButton>
            <SettingsButton tone="danger" onClick={remove} disabled={busy}>Remove</SettingsButton>
          </>
        )}
      </SettingsRow>
      <SettingsNote tone={note.tone}>{note.text}</SettingsNote>
    </SettingsSection>
  );
}

/* ── Account ─────────────────────────────────────────────────────────────────── */

const PROVIDER_LABELS = { 'google.com': 'Google', 'microsoft.com': 'Microsoft', password: 'Email and password' };
const DELETE_WORD = 'DELETE';

export function AccountSection() {
  const navigate = useNavigate();
  const user = getAuth().currentUser;
  const providers = (user?.providerData || []).map((p) => p.providerId);
  const hasPassword = providers.includes('password');
  const memberSince = user?.metadata?.creationTime ? new Date(user.metadata.creationTime) : null;

  const [resetNote, setResetNote] = useState({ tone: 'muted', text: '' });
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const sendReset = async () => {
    setResetNote({ tone: 'muted', text: '' });
    try {
      await sendPasswordResetEmail(getAuth(), user.email, { url: `${window.location.origin}/auth`, handleCodeInApp: false });
      setResetNote({ tone: 'success', text: `We sent a reset link to ${user.email}.` });
    } catch {
      setResetNote({ tone: 'error', text: 'Could not send the reset email. Try again in a moment.' });
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      const report = await deleteAccountData();
      if (report && report.success === false) {
        setDeleteError(report.message || 'Some data could not be deleted. Try again, or contact support.');
        setDeleting(false);
        return;
      }
      // The backend erases the data; the sign-in itself lives in Firebase. Deleting it can
      // need a recent sign-in — if so, signing out is the most we can do from here.
      try {
        await deleteUser(getAuth().currentUser);
      } catch {
        /* falls through to sign-out */
      }
      performLogout(navigate);
    } catch (e) {
      setDeleteError(e.message || 'Could not delete your account.');
      setDeleting(false);
    }
  };

  return (
    <SettingsSection title="Account">
      <SettingsRow label="Email">
        <span className="text-sm truncate max-w-[16rem]" style={{ color: 'var(--text-secondary)' }}>{user?.email || '—'}</span>
      </SettingsRow>
      {user?.displayName ? (
        <SettingsRow label="Name">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{user.displayName}</span>
        </SettingsRow>
      ) : null}
      <SettingsRow label="Signed in with">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {providers.map((p) => PROVIDER_LABELS[p] || p).join(', ') || '—'}
        </span>
      </SettingsRow>
      {memberSince ? (
        <SettingsRow label="Member since">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {memberSince.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
          </span>
        </SettingsRow>
      ) : null}
      {hasPassword && (
        <SettingsRow label="Password" description="We'll email you a link to set a new one.">
          <SettingsButton onClick={sendReset}>Reset password</SettingsButton>
        </SettingsRow>
      )}
      <SettingsNote tone={resetNote.tone}>{resetNote.text}</SettingsNote>
      <SettingsRow label="This device" description="You're signed in on this browser.">
        <SettingsButton onClick={() => performLogout(navigate)}>
          <LogOut className="w-3.5 h-3.5" aria-hidden />
          Sign out
        </SettingsButton>
      </SettingsRow>

      <SettingsGroupLabel>Danger zone</SettingsGroupLabel>
      <SettingsRow
        danger
        label="Delete account"
        description="Permanently deletes your conversations, uploaded files, variants and saved filters. This can't be undone."
      >
        {!confirming && (
          <SettingsButton tone="danger" onClick={() => setConfirming(true)}>Delete…</SettingsButton>
        )}
      </SettingsRow>
      {confirming && (
        <div className="py-3 space-y-2">
          <label htmlFor="delete-confirm" className="block text-xs" style={{ color: 'var(--text-secondary)' }}>
            Type <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{DELETE_WORD}</span> to confirm.
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="delete-confirm"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-40 px-2.5 py-1.5 rounded-lg text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--error)]"
              style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
            />
            <SettingsButton onClick={() => { setConfirming(false); setTyped(''); setDeleteError(''); }} disabled={deleting}>
              Cancel
            </SettingsButton>
            <SettingsButton tone="danger" onClick={deleteAccount} disabled={deleting || typed !== DELETE_WORD}>
              {deleting ? 'Deleting…' : 'Delete permanently'}
            </SettingsButton>
          </div>
          <SettingsNote tone="error">{deleteError}</SettingsNote>
        </div>
      )}
    </SettingsSection>
  );
}

/* ── Tuning (admins only) ────────────────────────────────────────────────────── */

export function TuningSection() {
  const navigate = useNavigate();
  return (
    <SettingsSection title="Tuning" description="Only visible to admins.">
      <SettingsRow
        label="Compare prompts and models"
        description="Opens the tuning editor in chat. You can also open it from the Tuning button in the chat box."
      >
        <SettingsButton
          tone="primary"
          onClick={() => {
            writeTuningActive(true);
            requestTuningPanel();
            navigate('/app');
          }}
        >
          Open
        </SettingsButton>
      </SettingsRow>
    </SettingsSection>
  );
}

/* ── About ───────────────────────────────────────────────────────────────────── */

export function AboutSection() {
  return (
    <SettingsSection title="About">
      <SettingsRow label="Version">
        <span className="text-sm tabular-nums" style={{ color: 'var(--text-secondary)' }}>{appVersion}</span>
      </SettingsRow>
      <SettingsRow label="Terms of service">
        <Link to="/legal/terms" className="text-xs font-medium underline underline-offset-2" style={{ color: 'var(--text-secondary)' }}>
          Read
        </Link>
      </SettingsRow>
      <SettingsRow label="Privacy policy">
        <Link to="/legal/privacy" className="text-xs font-medium underline underline-offset-2" style={{ color: 'var(--text-secondary)' }}>
          Read
        </Link>
      </SettingsRow>
    </SettingsSection>
  );
}
