import { X, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const AnnovarMessageModal = ({ modal, onClose }) => {
  return (
    <Dialog open={!!modal} onOpenChange={(open) => { if (!open) onClose(); }}>
      {modal && (
        <DialogContent
          showCloseButton={false}
          className="max-w-md w-[calc(100%-2rem)] p-0 gap-0 overflow-hidden rounded-xl ring-0 border"
          style={{
            backgroundColor: 'var(--bg-surface-raised)',
            borderColor: 'var(--border-default)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <DialogHeader
            className="px-6 py-4 flex-row items-center justify-between gap-0 space-y-0 border-b"
            style={{ backgroundColor: 'var(--accent-teal-soft)', borderColor: 'var(--border-subtle)' }}
          >
            <DialogTitle className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              {modal.title}
            </DialogTitle>
            <DialogClose
              render={
                <button
                  type="button"
                  className="p-1 rounded hover:bg-white/10 transition-colors"
                  aria-label="Close"
                  style={{ color: 'var(--text-secondary)' }}
                />
              }
            >
              <X className="w-5 h-5" />
            </DialogClose>
          </DialogHeader>

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
              <DialogDescription className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                {modal.message}
              </DialogDescription>
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose
                render={
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                    style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
                  />
                }
              >
                {modal.ctaLabel ? 'Dismiss' : 'OK'}
              </DialogClose>
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
        </DialogContent>
      )}
    </Dialog>
  );
};

export default AnnovarMessageModal;
