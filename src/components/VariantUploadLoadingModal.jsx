import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

/** Blocks the chat UI while POST /api/upload-variant-file is in flight. */
export default function VariantUploadLoadingModal({
  isOpen,
  uploadProgress,
  fileName,
}) {
  const bytesSending = uploadProgress != null && uploadProgress < 100;
  const title = bytesSending ? 'Uploading variant file' : 'Processing variant file';
  const statusMessage = bytesSending ? 'Sending file to the server' : 'Reading columns and counting variants';
  const progressPct = bytesSending ? Math.round(uploadProgress) : null;

  return (
    <Dialog open={isOpen}>
      <DialogContent
        showCloseButton={false}
        aria-busy="true"
        className="max-w-sm gap-0 p-5"
      >
        <DialogTitle className="text-sm font-semibold leading-tight text-foreground">{title}</DialogTitle>
        <DialogDescription className="mt-1 truncate font-mono text-xs text-muted-foreground" title={fileName || undefined}>
          {fileName || 'Your file'}
        </DialogDescription>

        <Progress
          value={bytesSending ? Math.max(progressPct, 4) : null}
          aria-label={title}
          className={`mt-4 w-full gap-0 [&_[data-slot=progress-track]]:h-1 [&_[data-slot=progress-indicator]]:bg-primary [&_[data-slot=progress-track]]:bg-muted ${
            bytesSending ? '' : '[&_[data-slot=progress-indicator]]:w-1/3 [&_[data-slot=progress-indicator]]:animate-pulse motion-reduce:[&_[data-slot=progress-indicator]]:animate-none'
          }`}
        />

        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground" aria-live="polite">
          <p className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-[var(--info)] motion-reduce:animate-none" />
            {statusMessage}
          </p>
          {bytesSending && <span className="shrink-0 tabular-nums">{progressPct}%</span>}
        </div>
        <p className="mt-3 text-2xs leading-snug text-muted-foreground">
          Large files can take a few minutes. Keep this tab open.
        </p>
      </DialogContent>
    </Dialog>
  );
}
