import React from 'react';
import { ArrowRight, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

const SubscriptionCanceled = ({ onClose }) => {
  const handleClose = () => {
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
    if (onClose) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent showCloseButton={false} className="gap-0 rounded-3xl p-8 text-center sm:max-w-sm">
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-pill))] text-muted-foreground" aria-hidden="true">
          <Undo2 className="size-6" strokeWidth={1.75} />
        </span>
        <span className="wb-chip mx-auto mb-3">No charge made</span>
        <DialogTitle className="text-[18px] font-medium">Checkout canceled</DialogTitle>
        <DialogDescription className="mt-1.5">
          No charges were made. You can upgrade any time from Settings.
        </DialogDescription>
        <Button size="lg" className="mt-6 h-10 w-full" onClick={handleClose}>
          Back to Geneie <ArrowRight aria-hidden="true" />
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default SubscriptionCanceled;
