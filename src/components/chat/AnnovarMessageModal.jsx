import { X, CheckCircle2, AlertCircle } from 'lucide-react';

const AnnovarMessageModal = ({ modal, onClose }) => {
  if (!modal) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60]"
      style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
      onClick={onClose}
    >
      <div
        className="rounded-xl max-w-md w-full mx-4 overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface-raised)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 flex items-center justify-between border-b" style={{ backgroundColor: 'var(--accent-teal-soft)', borderColor: 'var(--border-subtle)' }}>
          <span className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{modal.title}</span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            aria-label="Close"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
          <div className="flex items-start gap-3 mb-5">
            {modal.variant === 'success' && (
              <CheckCircle2 className="w-8 h-8 flex-shrink-0" style={{ color: 'var(--success)' }} />
            )}
            {modal.variant === 'error' && (
              <AlertCircle className="w-8 h-8 flex-shrink-0" style={{ color: 'var(--error)' }} />
            )}
            {modal.variant === 'info' && (
              <AlertCircle className="w-8 h-8 flex-shrink-0" style={{ color: 'var(--accent-blue)' }} />
            )}
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
              {modal.message}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg font-medium transition-colors text-sm"
              style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
            >
              {modal.ctaLabel ? 'Dismiss' : 'OK'}
            </button>
            {modal.ctaLabel && (
              <button
                type="button"
                onClick={() => modal.onCta?.()}
                className="px-4 py-2 rounded-lg font-medium transition-colors hover:opacity-90 text-sm"
                style={{ backgroundColor: 'var(--accent-teal)', color: '#0F0F0F' }}
              >
                {modal.ctaLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnnovarMessageModal;
