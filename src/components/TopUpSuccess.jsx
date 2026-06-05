import React, { useEffect, useState } from 'react';
import { CheckCircle, Loader2, Zap } from 'lucide-react';

const TopUpSuccess = ({ onClose }) => {
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
            <h2 className="text-2xl font-bold mb-2" style={{ color: '#1F2A44' }}>Processing Your Purchase</h2>
            <p style={{ color: '#5F6F82' }}>Please wait while we confirm your payment...</p>
          </>
        ) : (
          <>
            <CheckCircle className="w-16 h-16 mx-auto mb-4" style={{ color: '#3E8E7E' }} />
            <div className="flex items-center justify-center gap-2 mb-2">
              <Zap className="w-6 h-6" style={{ color: '#2F7F7A' }} />
              <h2 className="text-2xl font-bold" style={{ color: '#1F2A44' }}>Top-Up Successful! 🎉</h2>
            </div>
            <p className="mb-6" style={{ color: '#5F6F82' }}>
              Your additional database queries have been added to your account. You can now continue using database queries!
            </p>
            <div className="rounded-lg p-4 mb-6" style={{ backgroundColor: '#F1F6F3', border: '1px solid #3E8E7E' }}>
              <p className="text-sm font-semibold mb-2" style={{ color: '#1F3D2B' }}>What's Next?</p>
              <ul className="text-sm text-left space-y-1" style={{ color: '#1F3D2B' }}>
                <li>✓ Queries added to your account</li>
                <li>✓ No expiration date</li>
                <li>✓ Ready to use immediately</li>
                <li>✓ Check your profile to see updated balance</li>
              </ul>
            </div>
            <button
              onClick={() => {
                if (onClose) onClose();
                window.history.replaceState({}, document.title, window.location.pathname);
              }}
              className="w-full px-4 py-2 text-white rounded-lg font-semibold transition-colors"
              style={{ backgroundColor: '#2F7F7A' }}
              onMouseEnter={(e) => { e.target.style.backgroundColor = '#256B67'; }}
              onMouseLeave={(e) => { e.target.style.backgroundColor = '#2F7F7A'; }}
            >
              Continue to Dashboard
            </button>
            <p className="text-sm mt-4" style={{ color: '#5F6F82' }}>Redirecting you automatically...</p>
          </>
        )}
      </div>
    </div>
  );
};

export default TopUpSuccess;
