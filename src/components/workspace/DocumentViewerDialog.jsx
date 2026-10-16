import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import DocumentViewer from '@/components/workspace/DocumentViewer';
import { cn } from '@/lib/utils';

/**
 * DocumentViewerDialog: the large view. About min(1100px, 94vw) by 92vh on desktop; on phones the
 * shared dialog styling turns it into a bottom sheet. Esc / the close button / the overlay close it
 * and focus returns to whatever opened it.
 *
 *   <DocumentViewerDialog open onOpenChange title="Clinical report" source={{ kind: 'html', html }} />
 *
 * Takes every DocumentViewer prop (title, source, sandbox, ...). `children` replaces the viewer, so a
 * caller can put its own surface (for example the report's Document | PDF switch) in the same frame.
 */
export default function DocumentViewerDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  contentClassName,
  ...viewerProps
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'flex h-[92vh] w-[min(1100px,94vw)] !max-w-[min(1100px,94vw)] flex-col gap-0 overflow-hidden p-0 ring-0 max-md:h-[92dvh]',
          contentClassName,
        )}
      >
        <div className="shrink-0 border-b border-[hsl(var(--wb-line))] px-4 py-3 pr-14">
          <DialogTitle className="text-[15px] leading-5">{title}</DialogTitle>
          {description ? <DialogDescription className="mt-1 text-xs leading-5">{description}</DialogDescription> : null}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          {children ?? <DocumentViewer title={title} className="min-h-0 flex-1" {...viewerProps} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
