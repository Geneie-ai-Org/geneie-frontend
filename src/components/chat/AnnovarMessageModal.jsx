import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const VARIANTS = {
  success: { Icon: CheckCircle2, tone: 'text-[var(--success)] bg-[var(--success-soft)]' },
  error: { Icon: AlertCircle, tone: 'text-[var(--error)] bg-[var(--error-soft)]' },
  info: { Icon: Info, tone: 'text-[var(--info)] bg-[var(--info-soft)]' },
};

/**
 * Short confirm/notice dialog: a status icon, the title, one paragraph, and at most two actions
 * (a quiet dismiss and one primary call to action). The dismiss is "Close"; with a call to action
 * it is "Not now", so neither button is an OK/Cancel pair.
 */
const AnnovarMessageModal = ({ modal, onClose }) => {
  const variant = modal ? VARIANTS[modal.variant] : null;
  const Icon = variant?.Icon;

  return (
    <Dialog open={!!modal} onOpenChange={(open) => { if (!open) onClose(); }}>
      {modal && (
        <DialogContent
          showCloseButton={false}
          className="max-w-md w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 ring-0"
        >
          <div className="p-5">
            <DialogHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div className="flex min-w-0 items-start gap-3">
                {Icon && (
                  <span
                    className={`wb-pop mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${variant.tone}`}
                    aria-hidden
                  >
                    <Icon className="size-4" />
                  </span>
                )}
                <div className="min-w-0 pt-0.5">
                  <DialogTitle className="text-base font-semibold leading-snug text-foreground">
                    {modal.title}
                  </DialogTitle>
                  <DialogDescription className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                    {modal.message}
                  </DialogDescription>
                </div>
              </div>
              <DialogClose render={<button type="button" className="wb-iconbtn -mr-1" aria-label="Close" />}>
                <X className="size-4" />
              </DialogClose>
            </DialogHeader>

            <div className="mt-5 flex justify-end gap-2">
              <DialogClose render={<Button type="button" variant="outline" size="lg" />}>
                {modal.ctaLabel ? 'Not now' : 'Close'}
              </DialogClose>
              {modal.ctaLabel && (
                <Button type="button" size="lg" onClick={() => modal.onCta?.()}>
                  {modal.ctaLabel}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
};

export default AnnovarMessageModal;
