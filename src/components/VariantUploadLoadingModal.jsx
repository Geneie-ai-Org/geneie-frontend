import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { CountUp, StageMark } from '@/components/motion';

/**
 * Blocks the chat UI while POST /api/upload-variant-file is in flight. It cannot be dismissed:
 * the transfer has no cancel, so Esc and outside clicks are deliberately ignored.
 *
 * Two stages, each with its own mark: sending the bytes (real percent, from the XHR progress) and
 * then the server reading the file (no percent exists, so the bar is indeterminate).
 */
export default function VariantUploadLoadingModal({
  isOpen,
  uploadProgress,
  fileName,
}) {
  const reduce = useReducedMotion();
  const bytesSending = uploadProgress != null && uploadProgress < 100;
  const title = bytesSending ? 'Uploading variant file' : 'Processing variant file';
  const progressPct = bytesSending ? Math.max(0, Math.min(100, Math.round(uploadProgress))) : null;

  return (
    <Dialog open={isOpen}>
      <DialogContent
        showCloseButton={false}
        aria-busy="true"
        className="max-w-sm gap-0 p-5 focus-visible:!outline-none"
      >
        <DialogTitle className="text-base font-semibold leading-snug text-foreground">{title}</DialogTitle>
        <DialogDescription className="mt-1.5 truncate font-mono text-xs text-muted-foreground" title={fileName || undefined}>
          {fileName || 'Your file'}
        </DialogDescription>

        <ol className="m-0 mt-4 list-none space-y-2.5 p-0" aria-label="Upload steps">
          <li className="flex items-center gap-2.5 text-[13px]">
            <StageMark state={bytesSending ? 'running' : 'done'} size={20} />
            <span className={bytesSending ? 'font-medium text-foreground' : 'text-muted-foreground'}>Send file to the server</span>
            {bytesSending ? (
              <span className="ml-auto text-xs tabular-nums text-foreground" aria-live="off">
                <CountUp value={progressPct} duration={0.3} />%
              </span>
            ) : null}
          </li>
          <li className="flex items-center gap-2.5 text-[13px]">
            <StageMark state={bytesSending ? 'pending' : 'running'} size={20} />
            <span className={bytesSending ? 'text-muted-foreground' : 'font-medium text-foreground'}>Read columns and count variants</span>
          </li>
        </ol>

        <div
          role="progressbar"
          aria-label={title}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPct ?? undefined}
          aria-valuetext={bytesSending ? `${progressPct}% sent` : 'Processing'}
          className="wb-track relative mt-4 w-full"
        >
          {bytesSending ? (
            <div className="wb-fill" style={{ width: `${Math.max(progressPct, 4)}%` }} />
          ) : (
            <motion.div
              className="wb-fill absolute inset-y-0 left-0 w-1/3"
              initial={false}
              animate={reduce ? { x: '100%' } : { x: ['-100%', '300%'] }}
              transition={reduce ? { duration: 0 } : { duration: 1.4, ease: [0.45, 0, 0.55, 1], repeat: Infinity }}
            />
          )}
        </div>

        <p className="mt-3 text-xs leading-snug text-muted-foreground" aria-live="polite">
          Large files can take a few minutes. Keep this tab open.
        </p>
      </DialogContent>
    </Dialog>
  );
}
