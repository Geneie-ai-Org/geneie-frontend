import React from 'react';
import { Loader2 } from 'lucide-react';
import { getUploadDisplayMessage } from '@/lib/uploadProcessingPhases';
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
  const statusMessage =
    getUploadDisplayMessage({ uploadProgress }) ||
    'Uploading your variant file…';
  const bytesSending = uploadProgress != null && uploadProgress < 100;
  const progressPct = bytesSending ? Math.round(uploadProgress) : null;
  const displayFileName = fileName;

  return (
    <Dialog open={isOpen}>
      <DialogContent
        showCloseButton={false}
        aria-busy="true"
        className="max-w-sm p-5 gap-0 ring-0 border rounded-2xl"
        style={{
          backgroundColor: 'var(--bg-surface-raised)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <DialogTitle className="sr-only">
          {bytesSending ? 'Uploading' : 'Processing'} variant file
        </DialogTitle>
        <DialogDescription className="sr-only">{statusMessage}</DialogDescription>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-teal-soft)' }}
          >
            <Loader2
              className="w-4 h-4 animate-spin"
              style={{ color: 'var(--accent-teal)' }}
              aria-hidden
            />
          </div>
          <div className="min-w-0">
            <h2
              className="text-sm font-semibold leading-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              {bytesSending ? 'Uploading' : 'Processing'} variant file
            </h2>
            {displayFileName && (
              <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                {displayFileName}
              </p>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <Progress
          value={bytesSending ? Math.max(progressPct, 4) : null}
          className={`w-full [&_[data-slot=progress-track]]:h-1 [&_[data-slot=progress-track]]:bg-[var(--bg-surface-hover)] [&_[data-slot=progress-indicator]]:bg-[var(--accent-teal)] ${
            bytesSending
              ? '[&_[data-slot=progress-indicator]]:transition-all [&_[data-slot=progress-indicator]]:duration-300'
              : '[&_[data-slot=progress-indicator]]:w-1/3 [&_[data-slot=progress-indicator]]:animate-pulse'
          }`}
        />

        {/* Status line */}
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {statusMessage}
          </p>
          {bytesSending && (
            <span className="text-xs tabular-nums shrink-0 ml-2" style={{ color: 'var(--text-tertiary)' }}>
              {progressPct}%
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
