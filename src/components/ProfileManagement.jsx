import React, { useState, useEffect, useCallback, useMemo, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Mail, Bell, User, CreditCard, ShieldCheck, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { getAuth } from 'firebase/auth';
import { useLimits } from '@/hooks/useLimits';
import { visibleMeters, formatMeterDetail } from '@/services/tierLimits';
import { performLogout } from '@/lib/logout';
import { getNotificationPrefs, setNotificationPrefs } from '@/services/backendApi';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import SubscriptionPage from './SubscriptionPage';

const SECTIONS = [
  { id: 'profile', label: 'Profile', Icon: User },
  { id: 'plan', label: 'Plan and usage', Icon: CreditCard },
  { id: 'security', label: 'Security', Icon: ShieldCheck },
  { id: 'danger', label: 'Danger zone', Icon: TriangleAlert },
];

const SUPPORT_EMAIL = 'support@geneie.chat';

/** Accessible on/off switch (role=switch) styled with theme tokens. */
const Switch = ({ id, checked, disabled, onChange, labelledBy, describedBy }) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={checked}
    aria-labelledby={labelledBy}
    aria-describedby={describedBy}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors before:absolute before:-inset-x-1 before:-inset-y-3 before:content-[\'\'] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
      checked ? 'border-primary bg-primary' : 'border-border bg-muted'
    )}
  >
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute left-0.5 size-3.5 rounded-full shadow-sm transition-transform motion-reduce:transition-none',
        checked ? 'translate-x-4 bg-primary-foreground' : 'translate-x-0 bg-[var(--text-tertiary)]'
      )}
    />
  </button>
);

/** Settings row: label and helper on the left, control on the right. */
const SettingRow = ({ icon: Icon, title, helper, control, titleId, helperId }) => (
  <div className="flex items-start justify-between gap-4 py-3">
    <div className="flex min-w-0 items-start gap-3">
      {Icon && <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
      <div className="min-w-0">
        <p id={titleId} className="text-sm font-medium text-foreground">{title}</p>
        {helper && <p id={helperId} className="mt-0.5 text-[13px] text-muted-foreground">{helper}</p>}
      </div>
    </div>
    <div className="flex shrink-0 items-center pt-0.5">{control}</div>
  </div>
);

const SectionTitle = ({ children, description }) => (
  <div className="mb-3">
    <h3 className="text-base font-medium text-foreground">{children}</h3>
    {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
  </div>
);

function providerLabel(user) {
  const ids = (user?.providerData || []).map((p) => p.providerId);
  if (ids.includes('google.com')) return 'Google';
  if (ids.includes('password')) return 'Email and password';
  if (ids.length) return ids[0].replace('.com', '');
  return 'Unknown';
}

const fmtDate = (d) => (d ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown');

const normPrefs = (p) => ({ email: p ? p.email !== false : true, in_app: p ? p.in_app !== false : true });

const ProfileManagement = ({ isOpen, onClose, userTier, userId, conversations }) => {
  const navigate = useNavigate();
  const uid = useId();
  const [section, setSection] = useState('profile');
  const [userEmail, setUserEmail] = useState('');
  const [accountCreatedAt, setAccountCreatedAt] = useState(null);
  const [lastSignIn, setLastSignIn] = useState(null);
  const [provider, setProvider] = useState('');
  const [filesUploaded, setFilesUploaded] = useState(0);
  const [showSubscriptionPage, setShowSubscriptionPage] = useState(false);
  const [prefs, setPrefs] = useState(null); // saved server state { email, in_app }
  const [draft, setDraft] = useState(null); // what the switches show until Save
  const [prefsLoadFailed, setPrefsLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const limits = useLimits();
  const meters = visibleMeters(limits);

  useEffect(() => {
    if (!isOpen) return;
    const auth = getAuth();
    const user = auth.currentUser;
    setSection('profile');
    setUserEmail(user?.email || '');
    setProvider(providerLabel(user));
    setAccountCreatedAt(user?.metadata?.creationTime ? new Date(user.metadata.creationTime) : null);
    setLastSignIn(user?.metadata?.lastSignInTime ? new Date(user.metadata.lastSignInTime) : null);
    setFilesUploaded((conversations || []).filter((c) => c.documentName || c.documentUrl).length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userId]);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setPrefsLoadFailed(false);
    setSaveError('');
    getNotificationPrefs()
      .then((p) => { if (!cancelled) { setPrefs(p); setDraft(normPrefs(p)); } })
      .catch(() => { if (!cancelled) setPrefsLoadFailed(true); });
    return () => { cancelled = true; };
  }, [isOpen]);

  const saved = useMemo(() => (prefs ? normPrefs(prefs) : null), [prefs]);
  const dirty = Boolean(saved && draft && (saved.email !== draft.email || saved.in_app !== draft.in_app));

  const discard = useCallback(() => {
    if (saved) setDraft(saved);
    setSaveError('');
  }, [saved]);

  /* Same endpoint as before; it is now called once, on Save, with only the fields that changed. */
  const save = useCallback(async () => {
    if (!dirty || saving) return;
    const patch = {};
    if (draft.email !== saved.email) patch.email = draft.email;
    if (draft.in_app !== saved.in_app) patch.in_app = draft.in_app;
    setSaving(true);
    setSaveError('');
    try {
      const next = await setNotificationPrefs(patch);
      setPrefs(next);
      setDraft(normPrefs(next));
      toast.success('Settings saved');
    } catch (err) {
      setSaveError(err?.message || 'Could not save your changes. Try again.');
    } finally {
      setSaving(false);
    }
  }, [dirty, saving, draft, saved]);

  if (!isOpen) return null;

  const isAdmin = userTier === 'admin';
  const isPro = userTier === 'pro' || userTier === 'super_pro' || isAdmin;
  const planName = isAdmin ? 'Admin' : isPro ? 'Pro' : userTier === 'beta' ? 'Beta' : 'Free';
  const initial = userEmail ? userEmail.charAt(0).toUpperCase() : '?';
  const convCount = conversations?.length || 0;

  const renderProfile = () => (
    <>
      <SectionTitle>Profile</SectionTitle>
      <div className="flex items-center gap-3 pb-4">
        <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
          {initial}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{userEmail || 'Not signed in'}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{planName} plan</p>
        </div>
      </div>

      <div className="divide-y divide-border border-y border-border">
        <SettingRow title="Email" helper="Your sign-in address. It can&rsquo;t be changed here." control={<span className="max-w-[16rem] truncate text-sm text-foreground">{userEmail || 'Unknown'}</span>} />
        <SettingRow title="Member since" control={<span className="text-sm text-foreground">{fmtDate(accountCreatedAt)}</span>} />
      </div>

      <div className="mt-8">
        <SectionTitle description="Choose how Geneie tells you when a run finishes.">Notifications</SectionTitle>
        {prefsLoadFailed ? (
          <p role="alert" className="rounded-md border border-border bg-[var(--error-soft)] px-3 py-2 text-[13px] text-destructive">
            Could not load your notification settings. Close and reopen Settings to try again.
          </p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            <SettingRow
              icon={Mail}
              titleId={`${uid}-email`}
              helperId={`${uid}-email-h`}
              title="Email when a run finishes"
              helper="One email when annotation, ACMG or raw-data runs complete."
              control={
                <Switch
                  checked={draft ? draft.email : true}
                  disabled={!draft || saving}
                  onChange={(v) => setDraft((d) => ({ ...d, email: v }))}
                  labelledBy={`${uid}-email`}
                  describedBy={`${uid}-email-h`}
                />
              }
            />
            <SettingRow
              icon={Bell}
              titleId={`${uid}-bell`}
              helperId={`${uid}-bell-h`}
              title="In-app alerts"
              helper="Show finished runs in the notification bell."
              control={
                <Switch
                  checked={draft ? draft.in_app : true}
                  disabled={!draft || saving}
                  onChange={(v) => setDraft((d) => ({ ...d, in_app: v }))}
                  labelledBy={`${uid}-bell`}
                  describedBy={`${uid}-bell-h`}
                />
              }
            />
          </div>
        )}
      </div>
    </>
  );

  const renderPlan = () => (
    <>
      <SectionTitle>Plan and usage</SectionTitle>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">{planName} plan</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {isAdmin ? 'Full access.' : isPro ? 'Unlimited chat and pipelines.' : 'Upgrade for unlimited chat and pipelines.'}
          </p>
        </div>
        {!isAdmin && (
          <Button variant={isPro ? 'outline' : 'default'} size="lg" className="max-md:h-11" onClick={() => setShowSubscriptionPage(true)}>
            {isPro ? 'Manage plan' : 'Upgrade to Pro'}
          </Button>
        )}
      </div>

      <h4 className="mb-1 mt-8 text-sm font-medium text-foreground">Usage</h4>
      <div className="divide-y divide-border border-y border-border">
        {meters.map((m) => {
          const pct = !m.unlimited && m.limit ? Math.min(((m.used || 0) / m.limit) * 100, 100) : 0;
          const notIncluded = !m.unlimited && m.limit === 0;
          const exhausted = !m.unlimited && m.limit != null && m.limit > 0 && (m.used || 0) >= m.limit;
          const detail = formatMeterDetail(limits, m);
          return (
            <div key={m.key} className="py-3">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-foreground">{m.label}</span>
                <span className={cn('tabular-nums', exhausted ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                  {m.unlimited ? 'Unlimited' : notIncluded ? 'Not on your plan' : `${m.used || 0} of ${m.limit ?? '\u2014'}`}
                </span>
              </div>
              {!m.unlimited && m.limit != null && m.limit > 0 && (
                <Progress
                  value={pct}
                  aria-label={`${m.label}: ${m.used || 0} of ${m.limit}`}
                  className={cn(
                    'mt-2 w-full [&_[data-slot=progress-track]]:h-1 [&_[data-slot=progress-track]]:bg-border',
                    exhausted ? '[&_[data-slot=progress-indicator]]:bg-[var(--error)]' : '[&_[data-slot=progress-indicator]]:bg-primary'
                  )}
                />
              )}
              {detail && <p className="mt-1.5 text-xs text-muted-foreground">{detail}</p>}
            </div>
          );
        })}
        <div className="flex items-baseline justify-between py-3 text-sm">
          <span className="text-foreground">Chats</span>
          <span className="tabular-nums text-muted-foreground">{convCount}</span>
        </div>
        <div className="flex items-baseline justify-between py-3 text-sm">
          <span className="text-foreground">Files uploaded</span>
          <span className="tabular-nums text-muted-foreground">{filesUploaded}</span>
        </div>
      </div>
    </>
  );

  const renderSecurity = () => (
    <>
      <SectionTitle>Security</SectionTitle>
      <div className="divide-y divide-border border-y border-border">
        <SettingRow title="Sign-in method" control={<span className="text-sm text-foreground">{provider || 'Unknown'}</span>} />
        <SettingRow title="Last sign-in" control={<span className="text-sm text-foreground">{fmtDate(lastSignIn)}</span>} />
        <SettingRow
          title="Sign out"
          helper="End your session on this device."
          control={
            <Button
              variant="outline"
              size="lg"
              className="max-md:h-11"
              onClick={() => { onClose(); performLogout(navigate); }}
            >
              <LogOut /> Sign out
            </Button>
          }
        />
      </div>
    </>
  );

  const renderDanger = () => (
    <>
      <SectionTitle>Danger zone</SectionTitle>
      <div className="rounded-lg border border-destructive/40 px-4 py-3">
        <p className="text-sm font-medium text-foreground">Delete account</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Deleting your account removes your chats, files and results, and can&rsquo;t be undone.
          To delete it, email{' '}
          <a
            className="font-medium text-foreground underline underline-offset-2 hover:text-destructive focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55"
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Delete my Geneie account')}`}
          >
            {SUPPORT_EMAIL}
          </a>{' '}
          from {userEmail ? <span className="font-medium text-foreground">{userEmail}</span> : 'your account address'}.
        </p>
      </div>
    </>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="flex h-[min(40rem,calc(100dvh-2rem))] w-full max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl max-md:h-[calc(100dvh-1.5rem)] data-[nested-dialog-open]:invisible"
      >
        <div className="flex h-14 shrink-0 items-center border-b border-border px-5">
          <DialogTitle className="text-base">Settings</DialogTitle>
          <DialogDescription className="sr-only">Profile, plan and usage, security and account deletion.</DialogDescription>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav
            aria-label="Settings sections"
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-border p-2 md:w-52 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:p-3"
          >
            {SECTIONS.map(({ id, label, Icon }) => {
              const active = section === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSection(id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 max-md:h-11',
                    active ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                    id === 'danger' && !active && 'hover:text-destructive'
                  )}
                >
                  <Icon aria-hidden="true" className={cn('size-4', id === 'danger' && 'text-destructive')} />
                  {label}
                </button>
              );
            })}
          </nav>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-5 md:px-8">
            {section === 'profile' && renderProfile()}
            {section === 'plan' && renderPlan()}
            {section === 'security' && renderSecurity()}
            {section === 'danger' && renderDanger()}
          </div>
        </div>

        {/* Sticky save bar: only while there is something to save. */}
        {dirty && (
          <div
            role="region"
            aria-label="Unsaved changes"
            className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-5 py-3"
          >
            <p className={cn('text-[13px]', saveError ? 'text-destructive' : 'text-muted-foreground')} role={saveError ? 'alert' : 'status'}>
              {saveError || 'You have unsaved changes.'}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="lg" className="max-md:h-11" onClick={discard} disabled={saving}>Discard</Button>
              <Button size="lg" className="max-md:h-11" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
            </div>
          </div>
        )}
      </DialogContent>

      <SubscriptionPage
        isOpen={showSubscriptionPage}
        onClose={() => setShowSubscriptionPage(false)}
        userId={userId}
      />
    </Dialog>
  );
};

export default ProfileManagement;
