import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const VARIANTS = {
  success: { Icon: CheckCircle2, color: 'var(--success)' },
  error: { Icon: AlertCircle, color: 'var(--error)' },
  info: { Icon: Info, color: 'var(--info)' },
};

/**
 * Short confirm/notice dialog: a status icon, the title, one paragraph, and at most two actions
 * (a quiet dismiss and one primary call to action).
 */
const AnnovarMessageModal = ({ modal, onClose }) => {
  const variant = modal ? VARIANTS[modal.variant] : null;
  const Icon = variant?.Icon;

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
          <div className="p-5">
            <DialogHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div className="flex min-w-0 items-start gap-3">
                {Icon && <Icon className="mt-0.5 size-5 shrink-0" style={{ color: variant.color }} aria-hidden />}
                <div className="min-w-0">
                  <DialogTitle className="text-base font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
                    {modal.title}
                  </DialogTitle>
                  <DialogDescription className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {modal.message}
                  </DialogDescription>
                </div>
              </div>
              <DialogClose
                render={
                  <button
                    type="button"
                    className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] [@media(pointer:coarse)]:size-11"
                    aria-label="Close"
                    style={{ color: 'var(--text-secondary)' }}
                  />
                }
              >
                <X className="size-4" />
              </DialogClose>
            </DialogHeader>

            <div className="mt-5 flex justify-end gap-2">
              <DialogClose
                render={
                  <button
                    type="button"
                    className="inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium transition-colors hover:bg-[var(--bg-surface-hover)] [@media(pointer:coarse)]:h-11"
                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                  />
                }
              >
                {modal.ctaLabel ? 'Dismiss' : 'OK'}
              </DialogClose>
              {modal.ctaLabel && (
                <button
                  type="button"
                  onClick={() => modal.onCta?.()}
                  className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors hover:bg-[var(--accent-teal-hover)] [@media(pointer:coarse)]:h-11"
                  style={{ backgroundColor: 'var(--accent-teal)', color: 'var(--accent-teal-contrast)' }}
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
