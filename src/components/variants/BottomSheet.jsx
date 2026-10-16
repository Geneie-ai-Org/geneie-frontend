import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/** The visible viewport: it shrinks when the on-screen keyboard opens (the layout viewport does not on iOS). */
function useVisibleViewport() {
  const read = () => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const h = vv ? vv.height : window.innerHeight;
    return { h, kb: vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0 };
  };
  const [v, setV] = useState(read);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const on = () => setV(read());
    vv.addEventListener('resize', on);
    vv.addEventListener('scroll', on);
    return () => { vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on); };
  }, []);
  return v;
}

/**
 * The phone treatment for floating popovers (Add filter, Choose columns): a bottom sheet that is as tall as the
 * visible viewport (dvh, so the on-screen keyboard does not hide the list), with the title and a 44px close
 * button on top and the home-indicator inset below. Built on the shared Sheet; nothing in ui/ changes.
 *
 * `children` lays out in a flex column: put the scrolling part in a `min-h-0 flex-1 overflow-y-auto` element.
 */
export default function BottomSheet({ open, onOpenChange, title, leading, trailing, children, className, initialFocus }) {
  const vv = useVisibleViewport();
  // Sit on top of the keyboard and never be taller than what is left of the screen.
  const h = Math.round(Math.min(window.innerHeight * 0.92, vv.h - 10));
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        initialFocus={initialFocus}
        style={{ height: h, maxHeight: h, bottom: vv.kb || undefined }}
        className={cn(
          'gap-0 overflow-hidden rounded-t-[22px] border-x-0 border-b-0 bg-[hsl(var(--wb-card))] p-0 text-foreground',
          className
        )}
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-[hsl(var(--wb-line-strong))]" />
        <div className="flex shrink-0 items-center gap-2 px-3 pb-1.5 pt-1">
          {leading}
          <SheetTitle className="min-w-0 flex-1 truncate px-1 text-[15px] font-medium">{title}</SheetTitle>
          {trailing}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="wb-iconbtn !size-11 shrink-0 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--ring))]"
          >
            <X aria-hidden className="size-[18px]" />
          </button>
        </div>
        {children}
      </SheetContent>
    </Sheet>
  );
}
