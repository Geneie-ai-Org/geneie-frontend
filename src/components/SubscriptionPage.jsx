import React, { useState, useEffect } from 'react';
import { Check, AlertCircle, Receipt, ArrowUpRight, ExternalLink, RotateCw } from 'lucide-react';
import { CopyButton, HoldButton, StateButton } from '@/components/motion';
import { useAuth } from '../hooks/useAuth';
import { getAuth } from 'firebase/auth';
import { apiUrl } from '@/config/api';
import { fetchSubscriptionStatus } from '@/services/backendApi';
import { meterFor } from '@/services/tierLimits';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * One plan in a comparison: a white hairline card. The plan you are on gets a teal tint and a
 * "Current plan" pill (a word and a dot, never colour alone); the highlighted plan keeps a teal
 * hairline. Prices are tabular so two cards line up.
 */
export const PlanCard = ({ name, price, priceNote, blurb, features, current, highlighted, children }) => (
  <section
    aria-label={`${name} plan`}
    data-current={current ? 'true' : undefined}
    className={cn(
      'wb-card wb-rise flex flex-col p-5 transition-colors duration-150',
      current && 'border-[hsl(var(--brand-300))] bg-[hsl(var(--brand-50))]',
      !current && highlighted && 'border-[hsl(var(--brand-300))]'
    )}
  >
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-[15px] font-semibold text-foreground">{name}</h3>
      {current ? (
        <span className="wb-status" data-state="done">Current plan</span>
      ) : highlighted ? (
        <span className="wb-chip" data-tone="brand">Recommended</span>
      ) : null}
    </div>
    {price && (
      <p className="mt-4 flex items-baseline gap-1.5">
        <span className="text-[28px] font-semibold leading-none tabular-nums text-foreground">{price}</span>
        {priceNote && <span className="text-[13px] text-muted-foreground">{priceNote}</span>}
      </p>
    )}
    {blurb && <p className="mt-2 text-[13px] text-muted-foreground">{blurb}</p>}
    <ul className="mt-5 flex-1 space-y-2.5">
      {features.map((f, i) => (
        <li key={f} className="wb-rise flex items-start gap-2.5 text-[14px] text-foreground" style={{ animationDelay: `${Math.min(i, 8) * 30 + 60}ms` }}>
          <span className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-700))]" aria-hidden="true">
            <Check className="size-3" strokeWidth={3} />
          </span>
          <span>{f}</span>
        </li>
      ))}
    </ul>
    {children && <div className="mt-6">{children}</div>}
  </section>
);

/** An inline notice: error-soft pill-cornered strip with an icon, a sentence and an optional action. */
const Notice = ({ children, action }) => (
  <div role="alert" className="wb-fade flex items-center justify-between gap-3 rounded-2xl border border-transparent bg-[var(--error-soft)] px-3.5 py-2.5 text-[13px] text-[var(--error)]">
    <span className="flex items-start gap-2">
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </span>
    {action}
  </div>
);

const SubscriptionPage = ({ isOpen, onClose, userId }) => {
  const { userTier, limits } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subscriptionDetails, setSubscriptionDetails] = useState(null);
  const [billingHistory] = useState([]);
  const [busy, setBusy] = useState(null); // 'upgrade' | 'billing' | null
  const [actionError, setActionError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (isOpen && userId) {
      setActionError('');
      loadSubscriptionData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userId]);

  const loadSubscriptionData = async () => {
    try {
      setLoading(true);
      setLoadError(false);
      let apiStatus = null;
      try {
        apiStatus = await fetchSubscriptionStatus();
      } catch (apiError) {
        console.warn('[SubscriptionPage] subscription-status API unavailable:', apiError);
      }
      if (!apiStatus) setLoadError(true);

      if (apiStatus) {
        setSubscriptionDetails({
          planStatus: apiStatus.planStatus || 'free',
          subscriptionStartDate: apiStatus.subscriptionStartDate || null,
          subscriptionEndDate: apiStatus.subscriptionEndDate || null,
          subscriptionId: apiStatus.subscriptionId || null,
          paymentMethod: null,
          freeTierUsage: apiStatus.freeTierUsage || null,
          proEntitlements: apiStatus.proEntitlements || null,
          pricing: apiStatus.pricing || null,
          annovarRows: apiStatus.annovarRows || null,
        });
        return;
      }

      /* The Firestore fallback that used to run here is gone. That document is no longer
       * the source of truth, so falling back to it would quietly render a stale plan —
       * worse than showing nothing. If the API call above fails we leave the previous
       * state and log. */
    } catch (error) {
      console.error('[SubscriptionPage] Error loading subscription data:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const detectUserCountry = async () => {
    // Served by GET /api/subscription-status; no direct user-document read.
    try {
      const status = await fetchSubscriptionStatus();
      if (status?.country) return status.country;
    } catch (error) {
      console.error('[SubscriptionPage] Error reading user country:', error);
    }

    // Fallback: Try IP geolocation (optional - can be removed if not needed)
    try {
      const response = await fetch('https://ipapi.co/json/');
      const data = await response.json();
      return data.country_code || null;
    } catch (error) {
      console.log('[SubscriptionPage] IP geolocation failed, using default');
      return null; // Will default to payment gateway account country
    }
  };

  const handleUpgrade = async () => {
    setActionError('');
    setBusy('upgrade');
    try {
      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      if (!token) {
        setActionError('Sign in again to upgrade.');
        setBusy(null);
        return;
      }

      // Detect user country for payment method selection
      const userCountry = await detectUserCountry();

      const response = await fetch(apiUrl('/api/create-checkout-session'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_country: userCountry,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create checkout session');
      }

      const data = await response.json();
      // Redirect to the hosted checkout
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received from server');
      }
    } catch (error) {
      console.error('[SubscriptionPage] Error creating checkout:', error);
      setActionError(`Could not start checkout. ${error.message || 'Try again in a moment.'}`);
      setBusy(null);
    }
  };

  const handleManageBilling = async () => {
    setActionError('');
    setBusy('billing');
    try {
      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      if (!token) {
        setActionError('Sign in again to manage billing.');
        setBusy(null);
        return;
      }

      const response = await fetch(apiUrl('/api/create-portal-session'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create portal session');
      }

      const data = await response.json();
      // Redirect to the hosted billing portal
      if (data.url) {
        window.location.href = data.url;
      } else if (data.message) {
        setActionError(data.message);
        setBusy(null);
      } else {
        throw new Error('No portal URL received from server');
      }
    } catch (error) {
      console.error('[SubscriptionPage] Error creating portal session:', error);
      setActionError(`Could not open the billing portal. ${error.message || 'Try again in a moment.'}`);
      setBusy(null);
    }
  };

  const handleCancelSubscription = async () => {
    setConfirmCancel(false);
    // Redirect to billing portal where user can cancel
    await handleManageBilling();
  };

  if (!isOpen) return null;

  const isPro = userTier === 'pro' || userTier === 'admin';

  // Pro monthly price comes from the backend (subscription-status pricing, hot-tunable via config).
  // Fall back to the historical hardcoded 27.99 only if the API didn't supply it (degrade-open) so the
  // page never renders blank pricing. This ends the drift where the fetched pricing was ignored.
  const proMonthlyDisplay = subscriptionDetails?.pricing?.proMonthlyUsd ?? 27.99;

  const chatMeter = meterFor(limits, 'chat');
  // On Pro the chat meter describes Pro's pool, not the Free plan's allowance, so only quote a number while on Free.
  const freeChatFeature = !isPro && chatMeter.tracked && !chatMeter.unlimited && chatMeter.limit != null
    ? `${chatMeter.limit} chat exchanges`
    : 'Limited chat exchanges';

  const fmt = (v) => new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const startDate = subscriptionDetails?.subscriptionStartDate ? fmt(subscriptionDetails.subscriptionStartDate) : null;
  const endDate = subscriptionDetails?.subscriptionEndDate ? fmt(subscriptionDetails.subscriptionEndDate) : null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-1.5rem)] gap-5 overflow-y-auto bg-[hsl(var(--wb-bg))] p-5 sm:max-w-3xl">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="text-[18px] font-medium">Plan and billing</DialogTitle>
              <DialogClose render={<button type="button" className="wb-iconbtn" aria-label="Close plan and billing" />}>
                <X className="size-4" aria-hidden="true" />
              </DialogClose>
            </div>
            <DialogDescription className="tabular-nums">
              {isPro
                ? [startDate && `Pro since ${startDate}`, endDate && `renews ${endDate}`].filter(Boolean).join(', ') || 'You are on Pro.'
                : 'Compare plans and upgrade when you need more room.'}
            </DialogDescription>
          </DialogHeader>

          {actionError && <Notice>{actionError}</Notice>}

          {!loading && loadError && (
            <Notice
              action={
                <Button variant="outline" size="lg" className="shrink-0 max-md:h-11" onClick={loadSubscriptionData}>
                  <RotateCw aria-hidden="true" /> Retry
                </Button>
              }
            >
              Could not load your plan details, so the plan shown may be out of date. Check your connection, then retry.
            </Notice>
          )}

          {loading ? (
            <div aria-busy="true">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {[0, 1].map((i) => (
                  <div key={i} className="wb-card flex h-[19.5rem] flex-col p-5">
                    <div className="wb-shimmer h-4 w-16 rounded-full" />
                    <div className="wb-shimmer mt-5 h-7 w-24 rounded-full" />
                    <div className="wb-shimmer mt-3 h-3.5 w-40 rounded-full" />
                    <div className="wb-shimmer mt-7 h-3.5 w-full rounded-full" />
                    <div className="wb-shimmer mt-3 h-3.5 w-5/6 rounded-full" />
                    <div className="wb-shimmer mt-3 h-3.5 w-2/3 rounded-full" />
                  </div>
                ))}
              </div>
              <span role="status" className="sr-only">Loading plan details</span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <PlanCard
                  name="Free"
                  price="$0"
                  blurb="For trying Geneie on a sample."
                  current={!isPro}
                  features={[freeChatFeature, 'Conversation history', 'File uploads']}
                />
                <PlanCard
                  name="Pro"
                  price={`$${proMonthlyDisplay}`}
                  priceNote="per month"
                  blurb="Auto-debit. Cancel anytime."
                  current={isPro}
                  highlighted
                  features={['Unlimited chat exchanges', 'Bioinformatics pipelines', 'Conversation history', 'File uploads']}
                >
                  {!isPro ? (
                    <>
                      <StateButton
                        size="lg"
                        state={busy === 'upgrade' ? 'running' : 'idle'}
                        labels={{ idle: 'Upgrade to Pro', running: 'Redirecting…' }}
                        icon={ArrowUpRight}
                        onClick={handleUpgrade}
                        disabled={busy !== null}
                        className="h-10 w-full max-md:h-11"
                      />
                      <p className="mt-2.5 text-center text-[12px] text-muted-foreground">
                        Cards, UPI, QR code, net banking and wallets.
                      </p>
                    </>
                  ) : (
                    <StateButton
                      variant="outline"
                      size="lg"
                      state={busy === 'billing' ? 'running' : 'idle'}
                      labels={{ idle: 'Manage billing and payment methods', running: 'Redirecting…' }}
                      icon={ExternalLink}
                      onClick={handleManageBilling}
                      disabled={busy !== null}
                      className="h-10 w-full max-md:h-11"
                    />
                  )}
                </PlanCard>
              </div>

              {isPro && subscriptionDetails?.subscriptionId && (
                <div className="wb-card wb-rise flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="wb-card-title">Subscription ID</p>
                    <p className="mt-1 break-all font-mono text-[12px] text-foreground">{subscriptionDetails.subscriptionId}</p>
                  </div>
                  <CopyButton size="sm" label="Copy ID" getText={() => subscriptionDetails.subscriptionId} aria-label="Copy subscription ID" />
                </div>
              )}

              <section aria-label="Billing history" className="wb-card wb-rise p-4" style={{ animationDelay: '90ms' }}>
                <h3 className="wb-card-title mb-2">Billing history</h3>
                {billingHistory.length > 0 ? (
                  <ul className="divide-y divide-[hsl(var(--wb-line))]">
                    {billingHistory.map((invoice, idx) => (
                      <li key={idx} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] text-foreground">{invoice.description || 'Pro plan subscription'}</p>
                          <p className="text-[12px] tabular-nums text-muted-foreground">{fmt(invoice.date)}</p>
                        </div>
                        <div className="flex items-center gap-3 text-right">
                          <span className="text-[14px] tabular-nums text-foreground">${invoice.amount}</span>
                          <span className="wb-status" data-state={invoice.status === 'paid' || !invoice.status ? 'done' : 'failed'}>
                            {invoice.status || 'paid'}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex items-center gap-3 py-1 text-[13px] text-muted-foreground">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-pill))]" aria-hidden="true">
                      <Receipt className="size-4" />
                    </span>
                    <span>No invoices yet. They appear here after your first payment.</span>
                  </div>
                )}
              </section>

              {isPro && (
                <div className="wb-card wb-rise flex items-center justify-between gap-3 px-4 py-3" style={{ animationDelay: '120ms', borderColor: 'color-mix(in srgb, var(--error) 28%, transparent)' }}>
                  <p className="text-[13px] text-muted-foreground">
                    Canceling keeps Pro until the end of your billing period.
                  </p>
                  <Button
                    variant="outline"
                    size="lg"
                    className="shrink-0 !border-[color-mix(in_srgb,var(--error)_35%,transparent)] !text-[var(--error)] hover:!border-[var(--error)] hover:!bg-[var(--error-soft)] hover:!text-[var(--error)] max-md:h-11"
                    onClick={() => setConfirmCancel(true)}
                    disabled={busy !== null}
                  >
                    Cancel subscription
                  </Button>
                </div>
              )}
            </>
          )}

        <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
          <AlertDialogContent className="data-[size=default]:sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel your Pro subscription?</AlertDialogTitle>
              <AlertDialogDescription>
                You will lose Pro features at the end of your billing period. We will open the billing portal to finish cancelling.
              </AlertDialogDescription>
              <p className="text-[12px] text-muted-foreground">To confirm, press and hold &ldquo;Continue to billing portal&rdquo;.</p>
            </AlertDialogHeader>
            <AlertDialogFooter className="items-center">
              <AlertDialogCancel>Keep Pro</AlertDialogCancel>
              {/* Hold to confirm. onConfirm runs the same handler the old confirm button ran, once (it also closes this dialog). */}
              <HoldButton tone="danger" doneLabel="Opening portal" onConfirm={handleCancelSubscription} className="h-9 whitespace-nowrap px-4 text-[var(--error)]">
                Continue to billing portal
              </HoldButton>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SubscriptionPage;
