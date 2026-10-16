import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { Dialog, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * The variant-file upload frame on the shared Dialog (Esc, focus trap, scrim, pill buttons).
 *
 * It is not a plain dialog: `DocumentUpload` owns the file transfer and the sample-details wizard,
 * so it has to stay mounted while the frame is out of sight (the wizard is its own dialog, and a
 * transfer keeps running after the frame is dismissed). The portal therefore uses `keepMounted`:
 * closed means `hidden`, never unmounted. `ui/dialog`'s DialogContent hard-wires a portal without
 * it, so the popup is composed here from the same exported parts with the same classes.
 *
 * `visible` is the only open state. The caller decides when it is false (modal dismissed, or the
 * sample wizard has taken over) and what a user dismissal (`onDismiss`: Esc or scrim) means.
 */
export default function UploadFrame({ visible, onDismiss, className, children }) {
  return (
    <Dialog
      open={visible}
      onOpenChange={(open) => {
        if (open) return;
        onDismiss?.();
      }}
    >
      <DialogPortal keepMounted>
        <DialogOverlay />
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          className={cn(
            'fixed top-1/2 left-1/2 z-50 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 sm:max-w-lg',
            'max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-popover p-4 text-sm text-popover-foreground md:p-5',
            'border border-[hsl(var(--wb-line))] shadow-[var(--shadow-xl)] outline-none',
            className
          )}
        >
          <DialogTitle className="sr-only">Add data</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a variants file to upload to this conversation.
          </DialogDescription>
          {children}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
