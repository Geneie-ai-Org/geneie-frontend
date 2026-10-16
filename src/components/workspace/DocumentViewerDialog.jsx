import React, { useCallback, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import DocumentViewer from '@/components/workspace/DocumentViewer';
import { cn } from '@/lib/utils';

const FULL_KEY = 'geneie-viewer-full-v1';
const readFull = () => { try { return localStorage.getItem(FULL_KEY) !== '0'; } catch { return true; } };

/**
 * DocumentViewerDialog: the large view. Fills the screen on desktop by default (reports, QC pages and
 * charts are documents, they want the room); a pill in the header steps it back to a 1100px window and
 * the choice is remembered. On phones the shared dialog styling turns it into a bottom sheet. Esc / the close button / the overlay close it
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
  const [full, setFull] = useState(readFull);
  const toggle = useCallback(() => {
    setFull((v) => {
      try { localStorage.setItem(FULL_KEY, v ? '0' : '1'); } catch { /* storage blocked */ }
      return !v;
    });
  }, []);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-fullscreen={full ? '' : undefined}
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0 ring-0 max-md:h-[92dvh]',
          full
            ? 'h-[100dvh] w-screen !max-w-none md:!rounded-none'
            : 'h-[92vh] w-[min(1100px,94vw)] !max-w-[min(1100px,94vw)]',
          contentClassName,
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={toggle}
          aria-pressed={full}
          aria-label={full ? 'Exit full screen' : 'Full screen'}
          title={full ? 'Exit full screen' : 'Full screen'}
          className="absolute right-12 top-3 z-10 rounded-full max-md:hidden"
        >
          {full ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
        </Button>
        <div className="shrink-0 border-b border-[hsl(var(--wb-line))] px-4 py-3 pr-24 max-md:pr-14">
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
