import React, { useState } from 'react';
import { Zap, Check, AlertCircle, Loader2 } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { apiUrl } from '@/config/api';

const TopUpSelector = ({ userId, db, currentQueries, onTopUpSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const topUpTiers = [
    { queries: 50, price: 8.00, perQuery: 0.16, discount: 0, label: 'Standard' },
    { queries: 100, price: 15.00, perQuery: 0.15, discount: 6.25, label: 'Popular', popular: true },
    { queries: 150, price: 22.00, perQuery: 0.147, discount: 8.33, label: 'Value' },
    { queries: 200, price: 28.00, perQuery: 0.14, discount: 12.5, label: 'Savings' },
    { queries: 250, price: 36.00, perQuery: 0.144, discount: 10, label: 'Best Value', bestValue: true },
    { queries: 500, price: 68.00, perQuery: 0.136, discount: 15, label: 'Maximum Savings', bestValue: true },
  ];

  const handlePurchase = async (tier) => {
    try {
      setLoading(true);
      setError(null);

      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      if (!token) {
        setError('Please log in to purchase top-ups');
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
        <h3 className="text-lg font-semibold mb-1" style={{ color: '#1F2A44' }}>Purchase Additional Queries</h3>
        <p className="text-sm" style={{ color: '#5F6F82' }}>
          Current queries remaining: <span className="font-semibold" style={{ color: '#2F7F7A' }}>{currentQueries || 0}</span>
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 border rounded-lg flex items-center gap-2" style={{ backgroundColor: '#F1F6F3', borderColor: '#8B2F3C' }}>
          <AlertCircle className="w-4 h-4" style={{ color: '#8B2F3C' }} />
          <span className="text-sm" style={{ color: '#8B2F3C' }}>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {topUpTiers.map((tier) => (
          <div
            key={tier.queries}
            className="relative border rounded-lg p-4 transition-all"
            style={{
              backgroundColor: tier.bestValue || tier.popular ? '#F1F6F3' : '#FFFFFF',
              borderColor: '#2F7F7A'
            }}
            onMouseEnter={(e) => { e.target.style.borderColor = '#256B67'; }}
            onMouseLeave={(e) => { e.target.style.borderColor = '#2F7F7A'; }}
          >
            {tier.bestValue && (
              <div className="absolute -top-2 -right-2 text-white text-xs font-bold px-2 py-1 rounded-full" style={{ backgroundColor: '#2F7F7A' }}>
                BEST VALUE
              </div>
            )}
            {tier.popular && !tier.bestValue && (
              <div className="absolute -top-2 -right-2 text-white text-xs font-bold px-2 py-1 rounded-full" style={{ backgroundColor: '#2F7F7A' }}>
                POPULAR
              </div>
            )}

            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-5 h-5" style={{ color: '#2F7F7A' }} />
                <h4 className="text-lg font-bold" style={{ color: '#1F2A44' }}>{tier.queries} Queries</h4>
              </div>
              <p className="text-xs mb-2" style={{ color: '#5F6F82' }}>{tier.label}</p>
            </div>

            <div className="mb-3">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold" style={{ color: '#1F2A44' }}>${tier.price.toFixed(2)}</span>
              </div>
              <p className="text-xs mt-1" style={{ color: '#5F6F82' }}>
                ${tier.perQuery.toFixed(3)} per query
                {tier.discount > 0 && (
                  <span className="ml-2 font-semibold" style={{ color: '#2F7F7A' }}>
                    Save {tier.discount}%
                  </span>
                )}
              </p>
            </div>

            <button
              onClick={() => handlePurchase(tier)}
              disabled={loading}
              className="w-full py-2 px-4 rounded-lg font-medium transition-all text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ backgroundColor: '#2F7F7A' }}
              onMouseEnter={(e) => { if (!loading) { e.target.style.backgroundColor = '#256B67'; } }}
              onMouseLeave={(e) => { if (!loading) { e.target.style.backgroundColor = '#2F7F7A'; } }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>Buy Now</span>
                  <Check className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 rounded-lg" style={{ backgroundColor: '#F9FBFF' }}>
        <p className="text-xs" style={{ color: '#5F6F82' }}>
          <strong>Note:</strong> Top-up queries are added to your current balance and do not expire. 
          Pro subscribers receive 50 queries per month as part of their subscription.
        </p>
      </div>
    </div>
  );
};

export default TopUpSelector;
