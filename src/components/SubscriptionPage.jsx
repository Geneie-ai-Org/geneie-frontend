import React, { useState, useEffect } from 'react';
import { X, CreditCard, Check, Zap, Calendar, Receipt, AlertCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getAuth } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { apiUrl } from '@/config/api';
import { fetchSubscriptionStatus } from '@/services/backendApi';


const SubscriptionPage = ({ isOpen, onClose, userId, db }) => {
  const { userTier } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subscriptionDetails, setSubscriptionDetails] = useState(null);
  const [billingHistory, setBillingHistory] = useState([]);

  useEffect(() => {
    if (isOpen && userId && db) {
      loadSubscriptionData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userId, db]);

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

      if (userId && db) {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          const data = userDoc.data();
          setSubscriptionDetails({
            planStatus: data.planStatus || 'free',
            subscriptionStartDate: data.subscriptionStartDate || null,
            subscriptionEndDate: data.subscriptionEndDate || null,
            subscriptionId: data.dodoSubscriptionId || data.subscriptionId || null,
            paymentMethod: data.paymentMethod || null,
          });
          
          // Load billing history (placeholder - will be populated by payment gateway)
          setBillingHistory(data.billingHistory || []);
        }
      }
    } catch (error) {
      console.error('[SubscriptionPage] Error loading subscription data:', error);
    } finally {
      setLoading(false);
    }
  };

  const detectUserCountry = async () => {
    // Try to get country from user profile first
    if (userId && db) {
      try {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.country) {
            return userData.country;
          }
        }
      } catch (error) {
        console.error('[SubscriptionPage] Error reading user country:', error);
      }
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
    try {
      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      
      if (!token) {
        alert("Please log in to upgrade");
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
      alert(`Failed to start checkout: ${error.message}`);
    }
  };

  const handleManageBilling = async () => {
    try {
      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      
      if (!token) {
        alert("Please log in");
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
        alert(data.message);
      } else {
        throw new Error('No portal URL received from server');
      }
    } catch (error) {
      console.error('[SubscriptionPage] Error creating portal session:', error);
      alert(`Failed to open billing portal: ${error.message}`);
    }
  };

  const handleCancelSubscription = async () => {
    if (window.confirm("Are you sure you want to cancel your Pro subscription? You'll lose access to Pro features at the end of your billing period.")) {
      // Redirect to billing portal where user can cancel
      await handleManageBilling();
    }
  };

  if (!isOpen) return null;

  const isPro = userTier === 'pro' || userTier === 'admin';
  const isFree = userTier === 'free';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-white rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 text-white p-6 rounded-t-xl" style={{ backgroundColor: '#2F7F7A' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CreditCard className="w-6 h-6" />
              <h2 className="text-2xl font-bold">Subscription Management</h2>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors p-1"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#2F7F7A' }}></div>
            </div>
          ) : (
            <>
              {/* Current Plan Section */}
              <div className="rounded-lg p-5 border border-gray-200" style={{ backgroundColor: '#F9FBFF' }}>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: '#1F2A44' }}>
                  <Zap className="w-5 h-5" style={{ color: '#2F7F7A' }} />
                  Current Plan
                </h3>
                
                <div className="p-4 rounded-lg border-2" style={{ backgroundColor: '#FFFFFF', borderColor: '#2F7F7A' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="text-xl font-bold" style={{ color: '#1F2A44' }}>
                        {isPro ? '✨ Pro Plan' : '🆓 Free Plan'}
                      </h4>
                      {subscriptionDetails?.subscriptionStartDate && (
                        <p className="text-sm mt-1" style={{ color: '#5F6F82' }}>
                          Active since {new Date(subscriptionDetails.subscriptionStartDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    {isPro && subscriptionDetails?.subscriptionEndDate && (
                      <div className="text-right">
                        <p className="text-xs" style={{ color: '#5F6F82' }}>Renews on</p>
                        <p className="text-sm font-semibold" style={{ color: '#2E2E2E' }}>
                          {new Date(subscriptionDetails.subscriptionEndDate).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Plan Features */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4" style={{ color: '#3E8E7E' }} />
                      <span className="text-sm" style={{ color: '#2E2E2E' }}>
                        {isPro ? 'Unlimited' : '10'} Chat Exchanges
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4" style={{ color: '#3E8E7E' }} />
                      <span className="text-sm" style={{ color: '#2E2E2E' }}>Conversation History</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4" style={{ color: '#3E8E7E' }} />
                      <span className="text-sm" style={{ color: '#2E2E2E' }}>File Uploads</span>
                    </div>
                    {isPro && (
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4" style={{ color: '#3E8E7E' }} />
                        <span className="text-sm" style={{ color: '#2E2E2E' }}>Bioinformatics Pipelines</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Upgrade Section (for Free users) */}
              {isFree && (
                <div className="rounded-lg p-5 border-2" style={{ backgroundColor: '#FFFFFF', borderColor: '#2F7F7A' }}>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2" style={{ color: '#1F2A44' }}>
                    <Zap className="w-5 h-5" style={{ color: '#2F7F7A' }} />
                    Upgrade to Pro
                  </h3>
                  <p className="text-sm mb-4" style={{ color: '#2E2E2E' }}>
                    Get unlimited chat exchanges, access to bioinformatics pipelines, and more.
                  </p>
                  <div className="bg-white rounded-lg p-4 mb-4 border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-semibold" style={{ color: '#1F2A44' }}>Pro Plan</span>
                      <span className="text-2xl font-bold" style={{ color: '#2F7F7A' }}>$27.99<span className="text-sm font-normal" style={{ color: '#5F6F82' }}>/month</span></span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs mb-2" style={{ color: '#5F6F82' }}>Payment Methods:</p>
                      <div className="flex flex-wrap gap-2">
                        <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: '#FFFFFF', color: '#2E2E2E', border: '1px solid #2F7F7A' }}>Credit/Debit Cards</span>
                        <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: '#FFFFFF', color: '#2E2E2E', border: '1px solid #2F7F7A' }}>UPI</span>
                        <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: '#FFFFFF', color: '#2E2E2E', border: '1px solid #2F7F7A' }}>QR Code</span>
                        <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: '#FFFFFF', color: '#2E2E2E', border: '1px solid #2F7F7A' }}>Net Banking</span>
                        <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: '#FFFFFF', color: '#2E2E2E', border: '1px solid #2F7F7A' }}>Wallets</span>
                      </div>
                      <p className="text-xs mt-2" style={{ color: '#5F6F82' }}>Auto-debit subscriptions. Cancel anytime.</p>
                    </div>
                    <ul className="text-sm space-y-1 mt-3" style={{ color: '#2E2E2E' }}>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4" style={{ color: '#3E8E7E' }} />
                        Unlimited chat exchanges
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4" style={{ color: '#3E8E7E' }} />
                        Bioinformatics pipelines access
                      </li>
                    </ul>
                  </div>

                  {/* Total Price */}
                  <div className="rounded-lg p-3 mb-4 border border-gray-200" style={{ backgroundColor: '#F9FBFF' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold" style={{ color: '#2E2E2E' }}>Total:</span>
                      <span className="text-xl font-bold" style={{ color: '#2F7F7A' }}>
                        $27.99
                      </span>
                    </div>
                    <div className="text-xs mt-1" style={{ color: '#5F6F82' }}>
                      $27.99/month
                    </div>
                  </div>

                  <button
                    onClick={handleUpgrade}
                    className="w-full px-4 py-3 text-white rounded-lg font-semibold transition-all shadow-lg"
                    style={{ backgroundColor: '#2F7F7A' }}
                    onMouseEnter={(e) => { e.target.style.backgroundColor = '#256B67'; }}
                    onMouseLeave={(e) => { e.target.style.backgroundColor = '#2F7F7A'; }}
                  >
                    Upgrade to Pro
                  </button>
                </div>
              )}

              {/* Pro User Actions */}
              {isPro && (
                <div className="rounded-lg p-5 border border-gray-200" style={{ backgroundColor: '#F9FBFF' }}>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: '#1F2A44' }}>
                    <CreditCard className="w-5 h-5" style={{ color: '#2F7F7A' }} />
                    Manage Subscription
                  </h3>
                  <div className="space-y-3">
                    <button
                      onClick={handleManageBilling}
                      className="w-full px-4 py-2 text-left bg-white border border-gray-300 rounded-lg transition-colors flex items-center justify-between"
                      style={{ backgroundColor: '#FFFFFF' }}
                      onMouseEnter={(e) => { e.target.style.backgroundColor = '#F9FBFF'; }}
                      onMouseLeave={(e) => { e.target.style.backgroundColor = '#FFFFFF'; }}
                    >
                      <div className="flex items-center gap-2">
                        <Receipt className="w-4 h-4 text-gray-600" />
                        <span className="text-sm font-medium" style={{ color: '#2E2E2E' }}>Manage Billing & Payment Methods</span>
                      </div>
                      <span className="text-xs" style={{ color: '#5F6F82' }}>→</span>
                    </button>
                    <button
                      onClick={handleCancelSubscription}
                      className="w-full px-4 py-2 text-left border rounded-lg transition-colors flex items-center justify-between"
                      style={{ backgroundColor: '#FFFFFF', borderColor: '#8B2F3C', color: '#8B2F3C' }}
                      onMouseEnter={(e) => { e.target.style.backgroundColor = '#F1F6F3'; }}
                      onMouseLeave={(e) => { e.target.style.backgroundColor = '#FFFFFF'; }}
                    >
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">Cancel Subscription</span>
                      </div>
                      <span className="text-xs">→</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Billing History Section */}
              <div className="rounded-lg p-5 border border-gray-200" style={{ backgroundColor: '#F9FBFF' }}>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: '#1F2A44' }}>
                  <Calendar className="w-5 h-5" style={{ color: '#2F7F7A' }} />
                  Billing History
                </h3>
                {billingHistory.length > 0 ? (
                  <div className="space-y-2">
                    {billingHistory.map((invoice, idx) => (
                      <div key={idx} className="bg-white rounded-lg p-3 border border-gray-200 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium" style={{ color: '#1F2A44' }}>{invoice.description || 'Pro Plan Subscription'}</p>
                          <p className="text-xs" style={{ color: '#5F6F82' }}>{new Date(invoice.date).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold" style={{ color: '#2E2E2E' }}>${invoice.amount}</p>
                          <p className="text-xs" style={{ color: invoice.status === 'paid' ? '#3E8E7E' : '#8B2F3C' }}>
                            {invoice.status || 'paid'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8" style={{ color: '#5F6F82' }}>
                    <Receipt className="w-12 h-12 mx-auto mb-2" style={{ color: '#5F6F82' }} />
                    <p className="text-sm">No billing history yet</p>
                    <p className="text-xs mt-1">Your invoices will appear here after your first payment</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SubscriptionPage;

