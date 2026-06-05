import React from 'react';
import { XCircle, ArrowLeft } from 'lucide-react';

const SubscriptionCanceled = ({ onClose }) => {
  const handleClose = () => {
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
    if (onClose) onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={handleClose}>
      <div 
        className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-8 text-center" 
        onClick={(e) => e.stopPropagation()}
      >
        <XCircle className="w-16 h-16 mx-auto mb-4" style={{ color: '#5F6F82' }} />
        <h2 className="text-2xl font-bold mb-2" style={{ color: '#1F2A44' }}>Subscription Canceled</h2>
        <p className="mb-6" style={{ color: '#5F6F82' }}>
          You canceled the subscription process. No charges were made.
        </p>
        <button
          onClick={handleClose}
          className="w-full px-4 py-2 text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
          style={{ backgroundColor: '#2F7F7A' }}
          onMouseEnter={(e) => { e.target.style.backgroundColor = '#256B67'; }}
          onMouseLeave={(e) => { e.target.style.backgroundColor = '#2F7F7A'; }}
        >
          <ArrowLeft className="w-4 h-4" />
          Return to App
        </button>
      </div>
    </div>
  );
};

export default SubscriptionCanceled;

