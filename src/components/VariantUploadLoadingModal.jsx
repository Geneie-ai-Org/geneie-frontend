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
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.72)' }}
      aria-modal="true"
      aria-labelledby="variant-upload-loading-title"
      aria-busy="true"
    >
      <div
        ref={panelRef}
        className="w-full max-w-md rounded-2xl p-6 shadow-xl"
        style={{
          backgroundColor: 'var(--bg-surface-raised)',
          border: '1px solid var(--accent-teal)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <div className="flex items-start gap-4">
          <div
            className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-teal-soft)' }}
          >
            <Loader2
              className="w-5 h-5 animate-spin"
              style={{ color: 'var(--accent-teal)' }}
              aria-hidden
            />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="variant-upload-loading-title"
              className="text-base font-semibold mb-1"
              style={{ color: 'var(--text-primary)' }}
            >
              Uploading variant file
            </h2>
            {displayFileName && (
              <p className="text-xs truncate mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                <Upload className="w-3.5 h-3.5 shrink-0" aria-hidden />
                <span className="truncate">{displayFileName}</span>
              </p>
            )}
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {statusMessage}
            </p>
            <p className="text-xs mt-3" style={{ color: 'var(--text-tertiary)' }}>
              Chat is paused until processing finishes. This may take a minute for large files.
            </p>
          </div>
        </div>

        {bytesSending && (
          <div className="mt-5">
            <div
              className="h-1.5 w-full rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--bg-surface-hover)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.max(progressPct, 4)}%`,
                  backgroundColor: 'var(--accent-teal)',
                }}
              />
            </div>
            <p className="text-xs mt-1.5 text-right tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
              {progressPct}%
            </p>
          </div>
        )}

        {!bytesSending && (
          <div className="mt-5 flex items-center gap-2">
            <div
              className="h-1.5 flex-1 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--bg-surface-hover)' }}
            >
              <div
                className="h-full w-1/3 rounded-full animate-pulse"
                style={{ backgroundColor: 'var(--accent-teal)' }}
              />
            </div>
            <span className="text-xs shrink-0" style={{ color: 'var(--text-tertiary)' }}>
              Processing…
            </span>
          </div>
        )}
      </div>
    </dialog>,
    document.body
  );
}
