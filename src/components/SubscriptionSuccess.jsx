import React, { useEffect, useState } from 'react';
import { CheckCircle, Loader2 } from 'lucide-react';

const SubscriptionSuccess = ({ onClose }) => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait a moment for webhook to process, then show success
    const timer = setTimeout(() => {
      setLoading(false);
      // Auto-close after 5 seconds
      if (onClose) {
        setTimeout(() => {
          onClose();
          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname);
        }, 5000);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#F9FBFF' }}>
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-8 text-center">
        {loading ? (
          <>
            <Loader2 className="w-16 h-16 animate-spin mx-auto mb-4" style={{ color: '#3E8E7E' }} />
            <h2 className="text-2xl font-bold mb-2" style={{ color: '#1F2A44' }}>Processing Your Subscription</h2>
            <p style={{ color: '#5F6F82' }}>Please wait while we confirm your payment...</p>
          </>
        ) : (
          <>
            <CheckCircle className="w-16 h-16 mx-auto mb-4" style={{ color: '#3E8E7E' }} />
            <h2 className="text-2xl font-bold mb-2" style={{ color: '#1F2A44' }}>Welcome to Pro! 🎉</h2>
            <p className="mb-6" style={{ color: '#5F6F82' }}>
              Your subscription has been activated. You now have access to all Pro features!
            </p>
            <div className="rounded-lg p-4 mb-6" style={{ backgroundColor: '#F1F6F3', border: '1px solid #3E8E7E' }}>
              <p className="text-sm font-semibold mb-2" style={{ color: '#1F3D2B' }}>What's Next?</p>
              <ul className="text-sm text-left space-y-1" style={{ color: '#1F3D2B' }}>
                <li>✓ Unlimited chat exchanges</li>
                <li>✓ Bioinformatics pipelines access</li>
              </ul>
            </div>
            <p className="text-sm" style={{ color: '#5F6F82' }}>Redirecting you to the app...</p>
          </>
        )}
      </div>
    </div>
  );
};

export default SubscriptionSuccess;

