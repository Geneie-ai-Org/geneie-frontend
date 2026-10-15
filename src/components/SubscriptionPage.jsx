import React, { useState, useEffect } from 'react';
import { Check, Loader2, AlertCircle, Receipt } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getAuth } from 'firebase/auth';
import { apiUrl } from '@/config/api';
import { fetchSubscriptionStatus } from '@/services/backendApi';
import { meterFor } from '@/services/tierLimits';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

/**
 * One plan in a comparison. Flat card, hairline border; the highlighted plan swaps its
 * border to the accent. `current` adds a text marker (never colour alone).
 */
export const PlanCard = ({ name, price, priceNote, blurb, features, current, highlighted, children }) => (
  <section
    aria-label={`${name} plan`}
    className={cn(
      'flex flex-col rounded-lg border bg-card p-5',
      highlighted ? 'border-primary ring-1 ring-primary' : 'border-border'
    )}
  >
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-base font-medium text-foreground">{name}</h3>
      {current && (
        <span className="inline-flex h-5 items-center rounded-full bg-muted px-2 text-xs font-medium text-muted-foreground">
          Current plan
        </span>
      )}
    </div>
    {price && (
      <p className="mt-3 flex items-baseline gap-1">
        <span className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">{price}</span>
        {priceNote && <span className="text-sm text-muted-foreground">{priceNote}</span>}
      </p>
    )}
    {blurb && <p className="mt-2 text-[13px] text-muted-foreground">{blurb}</p>}
    <ul className="mt-4 flex-1 space-y-2">
      {features.map((f) => (
        <li key={f} className="flex items-start gap-2 text-sm text-foreground">
          <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>{f}</span>
        </li>
      ))}
    </ul>
    {children && <div className="mt-5">{children}</div>}
  </section>
);

const SubscriptionPage = ({ isOpen, onClose, userId }) => {
  const { userTier, limits } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subscriptionDetails, setSubscriptionDetails] = useState(null);
  const [billingHistory] = useState([]);
  const [busy, setBusy] = useState(null); // 'upgrade' | 'billing' | null
  const [actionError, setActionError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);

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
      let apiStatus = null;
      try {
        apiStatus = await fetchSubscriptionStatus();
      } catch (apiError) {
        console.warn('[SubscriptionPage] subscription-status API unavailable:', apiError);
      }

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
      // Redirect to Dodo Payments checkout
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
      // Redirect to Dodo Payments customer portal or profile page
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
  const freeChatFeature = chatMeter.tracked && !chatMeter.unlimited && chatMeter.limit != null
    ? `${chatMeter.limit} chat exchanges`
    : 'Limited chat exchanges';

  const startDate = subscriptionDetails?.subscriptionStartDate
    ? new Date(subscriptionDetails.subscriptionStartDate).toLocaleDateString()
    : null;
  const endDate = subscriptionDetails?.subscriptionEndDate
    ? new Date(subscriptionDetails.subscriptionEndDate).toLocaleDateString()
    : null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-1.5rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-base">Plan and billing</DialogTitle>
            <DialogDescription>
              {isPro
                ? [startDate && `Pro since ${startDate}`, endDate && `renews ${endDate}`].filter(Boolean).join(', ') || 'You are on Pro.'
                : 'Compare plans and upgrade when you need more room.'}
            </DialogDescription>
          </DialogHeader>

          {actionError && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-border bg-[var(--error-soft)] px-3 py-2 text-[13px] text-destructive">
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16" role="status">
              <Loader2 aria-hidden="true" className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none" />
              <span className="sr-only">Loading plan details</span>
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
                      <Button size="lg" className="h-10 w-full max-md:h-11" onClick={handleUpgrade} disabled={busy !== null}>
                        {busy === 'upgrade' ? (<><Loader2 className="animate-spin motion-reduce:animate-none" /> Opening checkout</>) : 'Upgrade to Pro'}
                      </Button>
                      <p className="mt-2 text-center text-xs text-muted-foreground">
                        Cards, UPI, QR code, net banking and wallets.
                      </p>
                    </>
                  ) : (
                    <Button variant="outline" size="lg" className="h-10 w-full max-md:h-11" onClick={handleManageBilling} disabled={busy !== null}>
                      {busy === 'billing' ? (<><Loader2 className="animate-spin motion-reduce:animate-none" /> Opening portal</>) : 'Manage billing and payment methods'}
                    </Button>
                  )}
                </PlanCard>
              </div>

              <section aria-label="Billing history">
                <h3 className="mb-2 text-sm font-medium text-foreground">Billing history</h3>
                {billingHistory.length > 0 ? (
                  <ul className="divide-y divide-border border-y border-border">
                    {billingHistory.map((invoice, idx) => (
                      <li key={idx} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-foreground">{invoice.description || 'Pro plan subscription'}</p>
                          <p className="text-xs text-muted-foreground">{new Date(invoice.date).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm tabular-nums text-foreground">${invoice.amount}</p>
                          <p className={cn('text-xs', invoice.status === 'paid' || !invoice.status ? 'text-muted-foreground' : 'text-destructive')}>
                            {invoice.status || 'paid'}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-3 text-[13px] text-muted-foreground">
                    <Receipt aria-hidden="true" className="size-4 shrink-0" />
                    <span>No invoices yet. They appear here after your first payment.</span>
                  </div>
                )}
              </section>

              {isPro && (
                <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
                  <p className="text-[13px] text-muted-foreground">
                    Cancelling keeps Pro until the end of your billing period.
                  </p>
                  <Button
                    variant="outline"
                    size="lg"
                    className="shrink-0 max-md:h-11 border-destructive/40 text-destructive hover:bg-[var(--error-soft)] hover:text-destructive"
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
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel your Pro subscription?</AlertDialogTitle>
              <AlertDialogDescription>
                You will lose Pro features at the end of your billing period. We will open the billing portal to finish cancelling.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep Pro</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleCancelSubscription}>
                Continue to billing portal
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SubscriptionPage;
