import React from 'react';
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
      <DialogContent showCloseButton={false} className="gap-0 p-6 text-center sm:max-w-sm">
        <DialogTitle className="text-base">Checkout canceled</DialogTitle>
        <DialogDescription className="mt-1.5">
          No charges were made. You can upgrade any time from Settings.
        </DialogDescription>
        <Button size="lg" className="mt-6 h-10 w-full" onClick={handleClose}>
          Back to Geneie
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default SubscriptionCanceled;
