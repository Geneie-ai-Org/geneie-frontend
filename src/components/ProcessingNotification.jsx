import React from 'react';
import { Loader2 } from 'lucide-react';
import '../App.css';

const ProcessingNotification = ({ message, isVisible }) => {
  if (!isVisible || !message) return null;

  return (
    <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[100] animate-fade-in">
      <div className="border-2 border-gray-300 rounded-lg shadow-xl px-5 py-4 flex items-center gap-3 min-w-[320px] max-w-[500px]" style={{ backgroundColor: '#FFFFFF' }}>
        <Loader2 className="h-5 w-5 animate-spin flex-shrink-0" style={{ color: '#5F6F82' }} />
        <span className="text-sm font-semibold" style={{ color: '#2E2E2E' }}>{message}</span>
      </div>
    </div>
  );
};

export default ProcessingNotification;
