import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Upload } from 'lucide-react';
import { useModalScrollLock } from '@/hooks/useModalScrollLock';
import { getUploadDisplayMessage } from '@/lib/uploadProcessingPhases';

/** Blocks the chat UI while POST /api/upload-variant-file is in flight. */
export default function VariantUploadLoadingModal({
  isOpen,
  uploadProgress,
  fileName,
}) {
  const panelRef = useRef(null);
  useModalScrollLock(isOpen, panelRef);

  if (!isOpen) return null;

  const statusMessage =
    getUploadDisplayMessage({ uploadProgress }) ||
    'Uploading your variant file…';
  const bytesSending = uploadProgress != null && uploadProgress < 100;
  const progressPct = bytesSending ? Math.round(uploadProgress) : null;
  const displayFileName = fileName;

  return createPortal(
    <dialog
      open
      className="fixed inset-0 z-[85] flex items-center justify-center p-4 w-full h-full max-w-none max-h-none border-0"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      aria-modal="true"
      aria-labelledby="variant-upload-loading-title"
      aria-busy="true"
    >
      <div
        ref={panelRef}
        className="w-full max-w-sm rounded-2xl p-5 shadow-xl"
        style={{
          backgroundColor: 'var(--bg-surface-raised)',
          border: '1px solid var(--border-subtle)',
        }}
      >
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
              id="variant-upload-loading-title"
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
        <div
          className="h-1 w-full rounded-full overflow-hidden"
          style={{ backgroundColor: 'var(--bg-surface-hover)' }}
        >
          {bytesSending ? (
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.max(progressPct, 4)}%`,
                backgroundColor: 'var(--accent-teal)',
              }}
            />
          ) : (
            <div
              className="h-full w-1/3 rounded-full animate-pulse"
              style={{ backgroundColor: 'var(--accent-teal)' }}
            />
          )}
        </div>

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
      </div>
    </dialog>,
    document.body
  );
}
