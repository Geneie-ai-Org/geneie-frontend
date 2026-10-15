import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, PanelRightClose, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Right-hand workbench. Everything that is not the conversation opens here as a tab: a Summary,
 * the filters, the results table, pipeline status, file checks. The panel supplies the tab strip,
 * a "+" menu to open more tabs, expand / close controls, a drag handle on its left edge and a
 * per-tab toolbar row. Each tab renders plain content that fills the panel
 * (docs/DESIGN_V1.md, "Workspace contract").
 *
 * Tab content stays mounted while hidden so heavy tabs keep their state (filters, scroll).
 *
 * tabs: registry of every tab the page can offer:
 *   { id, label, icon?, closable?, hidden?, subtitle?, actions?, hint?, badge?, content }
 * openIds: ids currently shown in the strip, in order (tabs with `closable: false` are pinned).
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
export function useWorkspaceWidth(expanded = false) {
  const [width, setWidth] = useState(readStoredWidth);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--sidebar-right-width',
      expanded ? 'min(980px, 64vw)' : `${width}px`
    );
    try {
      localStorage.setItem(WORKSPACE_WIDTH_KEY, String(width));
    } catch {
      /* storage blocked: width applies for this session */
    }
  }, [width, expanded]);

  useEffect(() => {
    const onResize = () => setWidth((w) => clampWidth(w));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return [width, (w) => setWidth(clampWidth(w))];
}

function IconButton({ label, onClick, children, pressed }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onClick}
              aria-label={label}
              aria-pressed={pressed}
              className="text-muted-foreground"
            >
              {children}
            </Button>
          }
        />
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function WorkspacePanel({
  tabs,
  openIds,
  activeId,
  onActiveChange,
  onOpenTab,
  onCloseTab,
  onClose,
  width,
  onWidthChange,
  expanded = false,
  onToggleExpand,
  className,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const byId = new Map(tabs.map((t) => [t.id, t]));
  const shown = openIds.map((id) => byId.get(id)).filter((t) => t && !t.hidden);
  const current = shown.some((t) => t.id === activeId) ? activeId : shown[0]?.id;
  const currentTab = shown.find((t) => t.id === current);
  const openable = tabs.filter((t) => !t.hidden && !openIds.includes(t.id));

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

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

  const onTabKey = (e, idx) => {
    if (e.key === 'ArrowRight' && shown[idx + 1]) { e.preventDefault(); onActiveChange(shown[idx + 1].id); }
    if (e.key === 'ArrowLeft' && shown[idx - 1]) { e.preventDefault(); onActiveChange(shown[idx - 1].id); }
  };

  return (
    <div className={cn('relative flex h-full min-h-0 flex-col bg-background', className)}>
      {!expanded && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize workspace"
          aria-valuemin={MIN_W}
          aria-valuemax={MAX_W}
          aria-valuenow={width}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onKeyDown={onHandleKey}
          className="absolute inset-y-0 left-0 z-20 hidden w-1.5 -translate-x-1/2 cursor-col-resize outline-none transition-colors hover:bg-primary/20 focus-visible:bg-primary/30 md:block"
        />
      )}

      {/* Tab strip */}
      <div className="flex h-10 shrink-0 items-center gap-0.5 pl-2 pr-1.5">
        <div role="tablist" aria-label="Workspace tabs" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {shown.map((t, idx) => {
            const selected = t.id === current;
            return (
              <div
                key={t.id}
                className={cn(
                  'group/tab flex h-7 shrink-0 items-center rounded-md text-[13px] font-medium transition-colors',
                  selected ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                )}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => onActiveChange(t.id)}
                  onKeyDown={(e) => onTabKey(e, idx)}
                  className={cn(
                    'flex h-7 max-w-[160px] items-center gap-1.5 rounded-md pl-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
                    t.closable ? 'pr-1' : 'pr-2.5'
                  )}
                >
                  {t.icon ? <t.icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
                  <span className="truncate">{t.label}</span>
                  {t.badge ? (
                    <span className="rounded-full bg-background px-1.5 text-[11px] leading-4 tabular-nums text-muted-foreground">{t.badge}</span>
                  ) : null}
                </button>
                {t.closable ? (
                  <button
                    type="button"
                    onClick={() => onCloseTab(t.id)}
                    aria-label={`Close ${t.label}`}
                    className={cn(
                      'mr-1 inline-flex size-5 items-center justify-center rounded text-muted-foreground outline-none transition-opacity hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30',
                      selected ? 'opacity-100' : 'opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100'
                    )}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            );
          })}

        </div>
        {openable.length > 0 ? (
          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Open a tab"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-[var(--shadow-md)]"
              >
                {openable.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); onOpenTab(t.id); }}
                    className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
                  >
                    {t.icon ? <t.icon className="size-4 text-muted-foreground" aria-hidden="true" /> : <span className="size-4" />}
                    <span className="flex-1 truncate">{t.label}</span>
                    {t.hint ? <span className="text-xs text-muted-foreground">{t.hint}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {onToggleExpand ? (
          <IconButton label={expanded ? 'Shrink workspace' : 'Expand workspace'} onClick={onToggleExpand} pressed={expanded}>
            {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </IconButton>
        ) : null}
        <IconButton label="Close workspace" onClick={onClose}>
          <PanelRightClose className="size-4" />
        </IconButton>
      </div>

      {/* Per-tab toolbar: quiet centred title, optional actions on the right. */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-y border-border px-3 text-[13px]">
        <span className="min-w-0 flex-1 truncate text-center text-muted-foreground">{currentTab?.subtitle || ''}</span>
        {currentTab?.actions ? <div className="flex shrink-0 items-center gap-1">{currentTab.actions}</div> : null}
      </div>

      <div className="relative min-h-0 flex-1">
        {shown.map((t) => (
          <div
            key={t.id}
            role="tabpanel"
            hidden={t.id !== current}
            className="absolute inset-0 min-h-0 overflow-hidden"
          >
            <div className="h-full min-h-0">{t.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
