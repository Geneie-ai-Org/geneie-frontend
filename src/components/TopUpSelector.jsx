import React, { useState } from 'react';
import { AlertCircle, ArrowUpRight, Check } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { apiUrl } from '@/config/api';
import { cn } from '@/lib/utils';
import { CountUp, SelectionMarker, StateButton } from '@/components/motion';

const BEST_VALUE_QUERIES = 500; // lowest price per query
const topUpTiers = [
  { queries: 50, price: 8.00, perQuery: 0.16, discount: 0, label: 'Standard' },
  { queries: 100, price: 15.00, perQuery: 0.15, discount: 6.25, label: 'Popular', popular: true },
  { queries: 150, price: 22.00, perQuery: 0.147, discount: 8.33, label: 'Value' },
  { queries: 200, price: 28.00, perQuery: 0.14, discount: 12.5, label: 'Savings' },
  { queries: 250, price: 36.00, perQuery: 0.144, discount: 10, label: 'Best Value', bestValue: true },
  { queries: 500, price: 68.00, perQuery: 0.136, discount: 15, label: 'Maximum Savings', bestValue: true },
];

/** Top-up picker: one radio list, one total, one Buy button. */
const TopUpSelector = ({ userId, db, currentQueries, onTopUpSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedQueries, setSelectedQueries] = useState(100);
  const selected = topUpTiers.find((t) => t.queries === selectedQueries) || topUpTiers[0];

  const handlePurchase = async (tier) => {
    try {
      setLoading(true);
      setError(null);

      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      if (!token) {
        setError('Sign in again to buy top-ups.');
        setLoading(false);
        return;
      }

      const response = await fetch(apiUrl('/api/create-topup-checkout-session'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topup_tier: tier.queries.toString()
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create checkout session');
      }

      const data = await response.json();

      // Redirect to the hosted checkout
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received from server');
      }
    } catch (error) {
      console.error('[TopUpSelector] Error creating checkout:', error);
      setError(`Could not start checkout. ${error.message || 'Try again in a moment.'}`);
      setLoading(false);
    }
  };

  return (
    <div className="wb-scope w-full" style={{ backgroundColor: 'transparent' }}>
      <div className="wb-card p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[15px] font-semibold text-foreground">Buy more queries</h3>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Top-ups are added to your balance and don&rsquo;t expire.
            </p>
          </div>
          <span className="wb-chip shrink-0 tabular-nums" data-tone="brand" aria-label={`${currentQueries || 0} queries left`}>
            <span><CountUp value={Number(currentQueries) || 0} duration={0.5} /> left</span>
          </span>
        </div>

        {error && (
          <div role="alert" className="wb-fade mb-4 flex items-start gap-2 rounded-2xl bg-[var(--error-soft)] px-3.5 py-2.5 text-[13px] text-[var(--error)]">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div role="radiogroup" aria-label="Top-up size" className="space-y-2">
          {topUpTiers.map((tier, i) => {
            const checked = tier.queries === selectedQueries;
            const tag = tier.queries === BEST_VALUE_QUERIES ? 'Best value' : tier.popular ? 'Popular' : null;
            return (
              <label
                key={tier.queries}
                className={cn(
                  'wb-row wb-rise relative min-h-[52px] cursor-pointer overflow-hidden has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[hsl(var(--ring))]',
                  checked && 'border-[hsl(var(--brand-300))]',
                  loading && 'pointer-events-none opacity-60'
                )}
                style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
              >
                {checked && <SelectionMarker group="topup" bar={false} />}
                <input
                  type="radio"
                  name="topup-tier"
                  value={tier.queries}
                  checked={checked}
                  disabled={loading}
                  onChange={() => setSelectedQueries(tier.queries)}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    'relative flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-150',
                    checked ? 'border-[hsl(var(--brand-solid))] bg-[hsl(var(--brand-solid))] text-[hsl(var(--on-brand))]' : 'border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))]'
                  )}
                >
                  {checked && <Check className="wb-draw-lucide size-3" strokeWidth={3} />}
                </span>
                <span className="relative min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-medium tabular-nums text-foreground">{tier.queries} queries</span>
                    {tag && <span className="wb-chip" data-tone="brand">{tag}</span>}
                  </span>
                  <span className="mt-0.5 block text-[12px] tabular-nums text-muted-foreground">
                    ${tier.perQuery.toFixed(3)} per query{tier.discount > 0 ? `, save ${tier.discount}%` : ''}
                  </span>
                </span>
                <span className="relative pr-2 text-[14px] font-medium tabular-nums text-foreground">${tier.price.toFixed(2)}</span>
              </label>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-between gap-4">
          <p className="text-[14px] text-muted-foreground">
            Total <span key={selected.price} className="wb-fade ml-1 inline-block text-[18px] font-semibold tabular-nums text-foreground">${selected.price.toFixed(2)}</span>
          </p>
          <StateButton
            size="lg"
            state={loading ? 'running' : 'idle'}
            labels={{ idle: `Buy ${selected.queries} queries`, running: 'Redirecting…' }}
            icon={ArrowUpRight}
            onClick={() => handlePurchase(selected)}
            disabled={loading}
            className="h-10 px-5"
          />
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">Pro subscribers also receive 50 queries per month.</p>
      </div>
    </div>
  );
};

export default TopUpSelector;
