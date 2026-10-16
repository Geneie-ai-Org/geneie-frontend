import React, { useState, useEffect, useCallback, useMemo, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { LogOut, Mail, Bell, User, CreditCard, ShieldCheck, TriangleAlert, X, ArrowUpRight, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { getAuth } from 'firebase/auth';
import { useLimits } from '@/hooks/useLimits';
import { visibleMeters, formatMeterDetail } from '@/services/tierLimits';
import { performLogout } from '@/lib/logout';
import { getNotificationPrefs, setNotificationPrefs } from '@/services/backendApi';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Collapse, CopyButton, CountUp, SPRING, StateButton } from '@/components/motion';
import UsageMeter from './account/UsageMeter';
import SubscriptionPage from './SubscriptionPage';

const SECTIONS = [
  { id: 'profile', label: 'Profile', Icon: User },
  { id: 'plan', label: 'Plan and usage', Icon: CreditCard },
  { id: 'security', label: 'Security', Icon: ShieldCheck },
  { id: 'danger', label: 'Danger zone', Icon: TriangleAlert },
];

const SUPPORT_EMAIL = 'support@geneie.chat';

/** Accessible on/off switch (role=switch): a pill track with a knob that springs across. */
const Switch = ({ id, checked, disabled, onChange, labelledBy, describedBy }) => {
  const reduce = useReducedMotion();
  return (
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
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-150 before:absolute before:-inset-x-1 before:-inset-y-3 before:content-[\'\'] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
        checked ? 'border-[hsl(var(--brand-solid))] bg-[hsl(var(--brand-solid))]' : 'border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-pill))]'
      )}
    >
      <motion.span
        aria-hidden="true"
        initial={false}
        animate={{ x: checked ? 20 : 2 }}
        transition={reduce ? { duration: 0 } : SPRING}
        className={cn(
          'pointer-events-none absolute left-0 size-[18px] rounded-full shadow-sm',
          checked ? 'bg-[hsl(var(--on-brand))]' : 'bg-[hsl(var(--muted-foreground))]'
        )}
      />
    </button>
  );
};

/** Settings row: label and helper on the left, control on the right. */
const SettingRow = ({ icon: Icon, title, helper, control, titleId, helperId }) => (
  <div className="flex items-start justify-between gap-4 py-3.5">
    <div className="flex min-w-0 items-start gap-3">
      {Icon && (
        <span aria-hidden="true" className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-pill))] text-muted-foreground">
          <Icon className="size-3.5" />
        </span>
      )}
      <div className="min-w-0">
        <p id={titleId} className="text-[14px] font-medium text-foreground">{title}</p>
        {helper && <p id={helperId} className="mt-0.5 text-[13px] text-muted-foreground">{helper}</p>}
      </div>
    </div>
    <div className="flex shrink-0 items-center pt-0.5">{control}</div>
  </div>
);

/** A white hairline card with a small title; children rise in with a stagger set by `i`. */
const Card = ({ title, description, children, i = 0, tone, className }) => (
  <section
    aria-label={title}
    className={cn('wb-card wb-rise p-5', className)}
    style={{ animationDelay: `${Math.min(i, 8) * 30}ms`, ...(tone === 'danger' ? { borderColor: 'color-mix(in srgb, var(--error) 30%, transparent)' } : null) }}
  >
    {title && <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>}
    {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
    <div className={title || description ? 'mt-4' : undefined}>{children}</div>
  </section>
);

/** Read-only value: label above, value below in full-strength text (read-only is not disabled). */
const ReadOnlyField = ({ label, value, helper, className, action, mono }) => (
  <div className="flex items-start justify-between gap-3 py-3">
    <div className="min-w-0">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 min-w-0 break-words text-[14px] text-foreground', mono && 'font-mono text-[13px] [overflow-wrap:anywhere]', className)}>{value}</dd>
      {helper && <p className="mt-0.5 text-[12px] text-muted-foreground">{helper}</p>}
    </div>
    {action}
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
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const reduceMotion = useReducedMotion();
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
  }, [isOpen, reloadKey]);

  const saved = useMemo(() => (prefs ? normPrefs(prefs) : null), [prefs]);
  const dirty = Boolean(saved && draft && (saved.email !== draft.email || saved.in_app !== draft.in_app));

  /* After the save bar disappears the focused button is gone; keep keyboard users in the form. */
  const focusFirstSwitch = useCallback(() => {
    setTimeout(() => document.getElementById(`${uid}-email-sw`)?.focus(), 0);
  }, [uid]);

  const discard = useCallback(() => {
    if (saved) setDraft(saved);
    setSaveError('');
    focusFirstSwitch();
  }, [saved, focusFirstSwitch]);

  /* Every way out of the dialog (Esc, X, backdrop) asks first when there is unsaved input. */
  const requestClose = useCallback(() => {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }, [dirty, onClose]);

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
      focusFirstSwitch();
    } catch (err) {
      setSaveError(err?.message || 'Could not save your changes. Try again.');
    } finally {
      setSaving(false);
    }
  }, [dirty, saving, draft, saved, focusFirstSwitch]);

  if (!isOpen) return null;

  const isAdmin = userTier === 'admin';
  const isPro = userTier === 'pro' || userTier === 'super_pro' || isAdmin;
  const planName = isAdmin ? 'Admin' : isPro ? 'Pro' : userTier === 'beta' ? 'Beta' : 'Free';
  const initial = userEmail ? userEmail.charAt(0).toUpperCase() : '?';
  const convCount = conversations?.length || 0;

  const renderProfile = () => (
    <>
      <Card i={0}>
        <div className="flex items-center gap-4">
          <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[18px] font-medium text-[hsl(var(--brand-700))]">
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium text-foreground">{userEmail || 'Your account'}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="wb-chip" data-tone="brand">{planName} plan</span>
              <span className="wb-chip">Signed in with {provider || 'your account'}</span>
            </div>
          </div>
        </div>
        <dl className="mt-3 divide-y divide-[hsl(var(--wb-line))] border-t border-[hsl(var(--wb-line))]">
          <ReadOnlyField
            label="Email"
            value={userEmail || 'Unknown'}
            helper="Your sign-in address. It can&rsquo;t be changed here."
            action={userEmail ? <CopyButton size="sm" label="Copy" getText={() => userEmail} aria-label="Copy email address" /> : null}
          />
          <ReadOnlyField label="Member since" value={fmtDate(accountCreatedAt)} />
          {userId ? (
            <ReadOnlyField
              label="Account ID"
              mono
              value={userId}
              helper="Share this with support if you need help."
              action={<CopyButton size="sm" label="Copy" getText={() => userId} aria-label="Copy account ID" />}
            />
          ) : null}
        </dl>
      </Card>

      <Card i={1} title="Notifications" description="Choose how Geneie tells you when a run finishes.">
        {prefsLoadFailed ? (
          <div role="alert" className="wb-fade flex items-center justify-between gap-3 rounded-2xl bg-[var(--error-soft)] px-3.5 py-2.5 text-[13px] text-[var(--error)]">
            <span>Could not load your notification settings. Check your connection, then retry.</span>
            <Button variant="outline" size="lg" className="shrink-0 max-md:h-11" onClick={() => setReloadKey((k) => k + 1)}>
              <RotateCw aria-hidden="true" /> Retry
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-[hsl(var(--wb-line))]">
            <SettingRow
              icon={Mail}
              titleId={`${uid}-email`}
              helperId={`${uid}-email-h`}
              title="Email when a run finishes"
              helper="One email when annotation, ACMG or raw-data runs complete."
              control={
                <Switch
                  id={`${uid}-email-sw`}
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
      </Card>
    </>
  );

  const renderPlan = () => (
    <>
      <Card i={0}>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-[18px] font-medium text-foreground">{planName} plan</h3>
              <span className="wb-status" data-state="done">Current plan</span>
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {isAdmin ? 'Full access.' : isPro ? 'Unlimited chat and pipelines.' : 'Upgrade for unlimited chat and pipelines.'}
            </p>
          </div>
          {!isAdmin && (
            <Button variant={isPro ? 'outline' : 'default'} size="lg" className="shrink-0 max-md:h-11" onClick={() => setShowSubscriptionPage(true)}>
              {isPro ? 'Manage plan' : 'Upgrade to Pro'}
              {!isPro ? <ArrowUpRight aria-hidden="true" /> : null}
            </Button>
          )}
        </div>
      </Card>

      <Card i={1} title="Usage">
        <div className="divide-y divide-[hsl(var(--wb-line))]">
          {meters.map((m) => {
            const notIncluded = !m.unlimited && m.limit === 0;
            const hasBar = !m.unlimited && m.limit != null && m.limit > 0;
            const detail = formatMeterDetail(limits, m);
            return (
              <div key={m.key} className="py-3.5 first:pt-0">
                {hasBar ? (
                  <UsageMeter label={m.label} used={m.used || 0} limit={m.limit} detail={detail} />
                ) : (
                  <div className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="font-medium text-foreground">{m.label}</span>
                    {m.unlimited ? (
                      <span className="wb-chip" data-tone="brand">Unlimited</span>
                    ) : notIncluded ? (
                      <span className="wb-chip">Not on your plan</span>
                    ) : (
                      <span className="tabular-nums text-muted-foreground">{`${m.used || 0} of —`}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {meters.length === 0 && <p className="text-[13px] text-muted-foreground">Usage appears here once your plan details load.</p>}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card i={2} className="py-4">
          <p className="wb-card-title">Chats</p>
          <p className="mt-1 text-[28px] font-semibold leading-none tabular-nums text-foreground"><CountUp value={convCount} startAt={0} /></p>
        </Card>
        <Card i={3} className="py-4">
          <p className="wb-card-title">Files uploaded</p>
          <p className="mt-1 text-[28px] font-semibold leading-none tabular-nums text-foreground"><CountUp value={filesUploaded} startAt={0} /></p>
        </Card>
      </div>
    </>
  );

  const renderSecurity = () => (
    <Card i={0} title="Security">
      <dl className="divide-y divide-[hsl(var(--wb-line))]">
        <ReadOnlyField label="Sign-in method" value={provider || 'Unknown'} />
        <ReadOnlyField label="Last sign-in" value={fmtDate(lastSignIn)} />
      </dl>
      <div className="border-t border-[hsl(var(--wb-line))]">
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
    </Card>
  );

  const renderDanger = () => (
    <Card i={0} tone="danger">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-foreground">Delete account</h3>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Deleting your account removes your chats, files and results, and can&rsquo;t be undone.
            To delete it, email{' '}
            <span className="font-medium text-foreground">{SUPPORT_EMAIL}</span>{' '}
            from {userEmail ? <span className="font-medium text-foreground">{userEmail}</span> : 'your account address'}.
          </p>
        </div>
        <a
          className="inline-flex h-10 shrink-0 items-center rounded-full border border-[color-mix(in_srgb,var(--error)_35%,transparent)] bg-[hsl(var(--wb-card))] px-4 text-[14px] font-medium text-[var(--error)] outline-none transition-[background-color,border-color,transform] duration-150 hover:border-[var(--error)] hover:bg-[var(--error-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))] active:scale-[0.97] max-md:h-11 motion-reduce:transition-none"
          href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Delete my Geneie account')}`}
        >
          Email support to delete
        </a>
      </div>
    </Card>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) requestClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(40rem,calc(100dvh-2rem))] w-full max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl max-md:h-[calc(100dvh-1.5rem)] data-[nested-dialog-open]:invisible"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[hsl(var(--wb-line))] pl-5 pr-4">
          <DialogTitle className="text-[18px] font-medium">Settings</DialogTitle>
          <DialogDescription className="sr-only">Profile, plan and usage, security and account deletion.</DialogDescription>
          <DialogClose render={<button type="button" className="wb-iconbtn" aria-label="Close settings" />}>
            <X className="size-4" aria-hidden="true" />
          </DialogClose>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav
            aria-label="Settings sections"
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-[hsl(var(--wb-line))] p-2 md:w-52 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:p-3"
          >
            {SECTIONS.map(({ id, label, Icon }) => {
              const active = section === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSection(id)}
                  aria-current={active ? 'true' : undefined}
                  data-selected={active ? 'true' : 'false'}
                  className={cn(
                    'wb-tab wb-tab--slide h-9 shrink-0 gap-2 whitespace-nowrap px-3 text-[13px] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))] max-md:h-11',
                    active && 'font-medium',
                    id === 'danger' && !active && 'hover:text-[var(--error)]'
                  )}
                >
                  {active && (
                    <motion.span
                      aria-hidden="true"
                      layoutId="settings-nav-pill"
                      transition={reduceMotion ? { duration: 0 } : SPRING}
                      className="wb-tab-pill"
                    />
                  )}
                  <Icon aria-hidden="true" className={cn('relative size-4', id === 'danger' && 'text-[var(--error)]')} />
                  <span className="relative">{label}</span>
                </button>
              );
            })}
          </nav>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-[hsl(var(--wb-bg))] p-4 md:p-5">
            <div key={section} className="mx-auto flex max-w-xl flex-col gap-3">
              {section === 'profile' && renderProfile()}
              {section === 'plan' && renderPlan()}
              {section === 'security' && renderSecurity()}
              {section === 'danger' && renderDanger()}
            </div>
          </div>
        </div>

        {/* Sticky save bar: only while there is something to save. It slides open and closed. */}
        <Collapse open={dirty} className="shrink-0">
          <div
            role="region"
            aria-label="Unsaved changes"
            className="flex flex-wrap items-center justify-between gap-3 border-t border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-card))] px-5 py-3"
          >
            <p className={cn('text-[13px]', saveError ? 'text-[var(--error)]' : 'text-muted-foreground')} role={saveError ? 'alert' : 'status'}>
              {saveError || 'You have unsaved changes.'}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="lg" className="max-md:h-11" onClick={discard} disabled={saving}>Discard</Button>
              <StateButton
                size="lg"
                state={saving ? 'running' : 'idle'}
                labels={{ idle: 'Save changes', running: 'Saving…' }}
                onClick={save}
                disabled={saving}
                className="max-md:h-11"
              />
            </div>
          </div>
        </Collapse>

        <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard changes?</AlertDialogTitle>
              <AlertDialogDescription>
                Your notification changes haven&rsquo;t been saved. Closing Settings now loses them.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => { setConfirmDiscard(false); if (saved) setDraft(saved); setSaveError(''); onClose(); }}
              >
                Discard changes
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
