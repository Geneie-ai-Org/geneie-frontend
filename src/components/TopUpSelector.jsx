import React, { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { apiUrl } from '@/config/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

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
        setError('Please log in to purchase top-ups');
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

      // Redirect to Dodo Payments checkout
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received from server');
      }
    } catch (error) {
      console.error('[TopUpSelector] Error creating checkout:', error);
      setError(error.message || 'Failed to start checkout. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-4">
        <h3 className="text-base font-medium text-foreground">Buy more queries</h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          You have <span className="font-medium tabular-nums text-foreground">{currentQueries || 0}</span> queries left.
          Top-ups are added to your balance and don&rsquo;t expire.
        </p>
      </div>

      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-border bg-[var(--error-soft)] px-3 py-2 text-[13px] text-destructive">
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div role="radiogroup" aria-label="Top-up size" className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {topUpTiers.map((tier) => {
          const checked = tier.queries === selectedQueries;
          const tag = tier.queries === BEST_VALUE_QUERIES ? 'Best value' : tier.popular ? 'Popular' : null;
          return (
            <label
              key={tier.queries}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-3 px-4 py-3 transition-colors focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring/55',
                checked ? 'bg-primary/5' : 'bg-card hover:bg-accent/50'
              )}
            >
              <input
                type="radio"
                name="topup-tier"
                value={tier.queries}
                checked={checked}
                disabled={loading}
                onChange={() => setSelectedQueries(tier.queries)}
                className="size-4 shrink-0 accent-[hsl(var(--primary))]"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium tabular-nums text-foreground">{tier.queries} queries</span>
                  {tag && (
                    <span className="inline-flex h-5 items-center rounded-full bg-muted px-2 text-xs font-medium text-muted-foreground">
                      {tag}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
                  ${tier.perQuery.toFixed(3)} per query{tier.discount > 0 ? `, save ${tier.discount}%` : ''}
                </span>
              </span>
              <span className="text-sm font-medium tabular-nums text-foreground">${tier.price.toFixed(2)}</span>
            </label>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Total <span className="ml-1 text-lg font-semibold tabular-nums text-foreground">${selected.price.toFixed(2)}</span>
        </p>
        <Button size="lg" className="h-10 px-5" onClick={() => handlePurchase(selected)} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="animate-spin motion-reduce:animate-none" />
              Opening checkout
            </>
          ) : (
            `Buy ${selected.queries} queries`
          )}
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Pro subscribers also receive 50 queries per month.</p>
    </div>
  );
};

export default TopUpSelector;
