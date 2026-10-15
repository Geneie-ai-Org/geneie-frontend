import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PanelRightClose } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Right-hand workspace: everything that is not the conversation lives here as tabs
 * (variants + filters, pipeline, ...). The panel supplies the header, tab strip, close button
 * and a drag handle on its left edge; each tab renders plain content that fills the panel
 * (see docs/DESIGN_V1.md, "Workspace contract").
 *
 * Tab content stays mounted while hidden so heavy tabs keep their state (filters, scroll).
 *
 * tabs: [{ id, label, icon?, badge?, content, hidden? }]
 */
export const WORKSPACE_WIDTH_KEY = 'geneie-workspace-width';
const MIN_W = 420;
const MAX_W = 720;
const DEFAULT_W = 520;

function clampWidth(w) {
  const max = Math.min(MAX_W, Math.max(MIN_W, Math.round(window.innerWidth * 0.55)));
  return Math.min(max, Math.max(MIN_W, Math.round(w)));
}

function readStoredWidth() {
  try {
    const v = Number(localStorage.getItem(WORKSPACE_WIDTH_KEY));
    return Number.isFinite(v) && v > 0 ? clampWidth(v) : DEFAULT_W;
  } catch {
    return DEFAULT_W;
  }
}

/** Keeps the shell grid column (`--sidebar-right-width`) in step with the panel width. */
export function useWorkspaceWidth() {
  const [width, setWidth] = useState(readStoredWidth);

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-right-width', `${width}px`);
    try {
      localStorage.setItem(WORKSPACE_WIDTH_KEY, String(width));
    } catch {
      /* storage blocked: width applies for this session */
    }
  }, [width]);

  useEffect(() => {
    const onResize = () => setWidth((w) => clampWidth(w));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return [width, (w) => setWidth(clampWidth(w))];
}

export default function WorkspacePanel({
  tabs,
  activeId,
  onActiveChange,
  onClose,
  width,
  onWidthChange,
  className,
}) {
  const visibleTabs = tabs.filter((t) => !t.hidden);
  const dragRef = useRef(null);

  const onPointerDown = useCallback(
    (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = width;
      const move = (ev) => onWidthChange(startW + (startX - ev.clientX));
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [width, onWidthChange]
  );

  const onHandleKey = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); onWidthChange(width + 24); }
    if (e.key === 'ArrowRight') { e.preventDefault(); onWidthChange(width - 24); }
  };

  const current = visibleTabs.some((t) => t.id === activeId) ? activeId : visibleTabs[0]?.id;

  return (
    <div className={cn('relative flex h-full min-h-0 flex-col bg-background', className)}>
      {/* Drag handle on the left edge (desktop only). */}
      <div
        ref={dragRef}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize workspace"
        aria-valuemin={MIN_W}
        aria-valuemax={MAX_W}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={onHandleKey}
        className="absolute inset-y-0 left-0 z-20 hidden w-1.5 -translate-x-1/2 cursor-col-resize outline-none transition-colors hover:bg-primary/30 focus-visible:bg-primary/40 md:block"
      />

      <Tabs value={current} onValueChange={onActiveChange} className="h-full">
        <div className="flex shrink-0 items-center bg-background pr-1.5">
          <TabsList className="min-w-0 flex-1">
            {visibleTabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>
                {t.icon ? <t.icon className="size-3.5" aria-hidden="true" /> : null}
                {t.label}
                {t.badge ? (
                  <span className="rounded-full bg-primary/10 px-1.5 text-[11px] font-medium leading-4 text-primary tabular-nums">
                    {t.badge}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={onClose}
                    aria-label="Close workspace"
                    className="text-muted-foreground"
                  >
                    <PanelRightClose className="size-4" />
                  </Button>
                }
              />
              <TooltipContent>Close workspace</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Context row: a quiet, centred title for whatever the active tab is showing. */}
        {visibleTabs.find((t) => t.id === current)?.subtitle ? (
          <div className="flex h-9 shrink-0 items-center justify-center border-y border-border px-3 text-[13px] text-muted-foreground">
            <span className="truncate">{visibleTabs.find((t) => t.id === current).subtitle}</span>
          </div>
        ) : (
          <div className="h-px shrink-0 bg-border" />
        )}

        {visibleTabs.map((t) => (
          <TabsContent key={t.id} value={t.id} className="overflow-hidden">
            <div className="h-full min-h-0">{t.content}</div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
