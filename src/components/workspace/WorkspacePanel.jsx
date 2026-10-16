import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
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
 *
 * Optional: `persistKey` (e.g. the conversation id) remembers the open tabs and the active tab per key
 * in localStorage. Restoring goes through `onRestore({ openIds, activeId })`, which the page maps to its
 * own state setters; without `onRestore` only the active tab is restored (`onOpenTab` would also pop
 * the panel open).
 *
 * Keyboard: the tab strip is one tab stop (roving tabindex). Left/Right/Home/End move and activate,
 * Delete closes a closable tab. "+" is a menu: focus moves in, Up/Down/Home/End move, Enter picks,
 * Escape returns focus to the button.
 */
export const WORKSPACE_WIDTH_KEY = 'geneie-workspace-width-v2';
const MIN_W = 440;
const MAX_W = 760;
const DEFAULT_W = 560;
const TABS_KEY = 'geneie-workspace-tabs:';

// Full-alpha 2px ring (the global one is 45% alpha, under 3:1 on white).
// Entrance motion for the tab panels and the "+" menu. opacity/transform only, 150ms, ease-out, and
// switched off for reduced motion. Panels toggle `hidden`, so the animation restarts on every switch.
const MOTION_CSS = `
@keyframes ws-tab-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes ws-menu-in { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: none; } }
.ws-tab-in { animation: ws-tab-in 150ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.ws-menu-in { animation: ws-menu-in 150ms cubic-bezier(0.22, 1, 0.36, 1) both; }
@media (prefers-reduced-motion: reduce) { .ws-tab-in, .ws-menu-in { animation: none; } }
`;
const FOCUS = 'focus-visible:outline-[hsl(var(--ring))] focus-visible:outline-offset-2';

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

function IconButton({ label, onClick, children }) {
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
              className="wb-iconbtn focus-visible:ring-[hsl(var(--ring))]"
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

function readStoredTabs(key) {
  try {
    const v = JSON.parse(localStorage.getItem(TABS_KEY + key));
    if (v && Array.isArray(v.openIds) && v.openIds.every((x) => typeof x === 'string')) {
      return { openIds: v.openIds, activeId: typeof v.activeId === 'string' ? v.activeId : null };
    }
  } catch {
    /* storage blocked or corrupt: fall back to the page's own state */
  }
  return null;
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
  persistKey,
  onRestore,
  className,
}) {
  const uid = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const menuWrapRef = useRef(null);
  const plusRef = useRef(null);
  const listRef = useRef(null);
  const bodyRef = useRef(null);
  const tabRefs = useRef({});
  const pendingFocusRef = useRef(false);
  const restoredKeyRef = useRef(null);
  const skipWriteRef = useRef(false);
  const [scrolledTabs, setScrolledTabs] = useState({});
  const [edge, setEdge] = useState({ left: false, right: false });

  const byId = new Map(tabs.map((t) => [t.id, t]));
  const shown = openIds.map((id) => byId.get(id)).filter((t) => t && !t.hidden);
  const current = shown.some((t) => t.id === activeId) ? activeId : shown[0]?.id;
  const currentTab = shown.find((t) => t.id === current);
  const openable = tabs.filter((t) => !t.hidden && !openIds.includes(t.id));
  const tabDomId = (id) => `${uid}-tab-${id}`;
  const panelDomId = (id) => `${uid}-panel-${id}`;

  // ---- Remember open tabs and the active tab per conversation -------------------------------
  useEffect(() => {
    if (!persistKey) { restoredKeyRef.current = null; return; }
    const stored = readStoredTabs(persistKey);
    restoredKeyRef.current = persistKey;
    skipWriteRef.current = false;
    if (!stored) return;
    const known = stored.openIds.filter((id) => byId.has(id));
    const pinned = tabs.filter((t) => t.closable === false).map((t) => t.id);
    const ids = [...pinned.filter((id) => !known.includes(id)), ...known];
    const active = stored.activeId && ids.includes(stored.activeId) ? stored.activeId : ids[0];
    if (onRestore) {
      skipWriteRef.current = true; // this commit still holds the previous conversation's tabs
      onRestore({ openIds: ids, activeId: active });
    } else if (active) {
      onActiveChange?.(active);
    }
    // Restores once per key; the registry is read as it is at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey]);

  useEffect(() => {
    if (!persistKey || restoredKeyRef.current !== persistKey) return;
    if (skipWriteRef.current) { skipWriteRef.current = false; return; }
    try {
      localStorage.setItem(TABS_KEY + persistKey, JSON.stringify({ openIds, activeId }));
    } catch {
      /* storage blocked: tabs apply for this session */
    }
  }, [persistKey, openIds, activeId]);

  // ---- Closed workspace must leave the tab order (the shell only sets aria-hidden) ----------
  useEffect(() => {
    const root = rootRef.current;
    const host = root?.parentElement;
    if (!root || !host) return undefined;
    const sync = () => { root.inert = host.getAttribute('aria-hidden') === 'true'; };
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(host, { attributes: true, attributeFilter: ['aria-hidden'] });
    return () => mo.disconnect();
  }, []);

  // ---- "+" menu -----------------------------------------------------------------------------
  const closeMenu = useCallback((returnFocus) => {
    setMenuOpen(false);
    if (returnFocus) plusRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    menuRef.current?.querySelector('[role=menuitem]')?.focus();
    const onDown = (e) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const onMenuKey = (e) => {
    const items = [...menuRef.current.querySelectorAll('[role=menuitem]')];
    const i = items.indexOf(document.activeElement);
    const go = (n) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
    else if (e.key === 'Tab') closeMenu(false);
    else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Type-ahead: jump to the next item whose label starts with the typed letter.
      const ch = e.key.toLowerCase();
      const order = [...items.slice(i + 1), ...items.slice(0, i + 1)];
      const hit = order.find((el) => el.textContent.trim().toLowerCase().startsWith(ch));
      if (hit) { e.preventDefault(); hit.focus(); }
    }
  };

  const onPlusKey = (e) => {
    if (e.key === 'ArrowDown' && !menuOpen) { e.preventDefault(); setMenuOpen(true); }
  };

  const pickTab = (id) => {
    armFocus(); // land on the tab that just opened
    setMenuOpen(false);
    onOpenTab(id);
  };

  // ---- Tabs: roving focus, activation, delete ---------------------------------------------------
  const focusTab = (id) => tabRefs.current[id]?.focus();
  // Ask the next render to move focus onto the active tab; lapses if nothing changes.
  const armFocus = () => {
    pendingFocusRef.current = true;
    setTimeout(() => { pendingFocusRef.current = false; }, 400);
  };

  useEffect(() => {
    if (!pendingFocusRef.current || !current) return;
    pendingFocusRef.current = false;
    focusTab(current);
  }, [current, shown.length]);

  // Keep the active tab visible when the strip scrolls.
  useEffect(() => {
    tabRefs.current[current]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [current]);

  const onTabKey = (e, idx) => {
    const last = shown.length - 1;
    let to = null;
    if (e.key === 'ArrowRight') to = idx === last ? 0 : idx + 1;
    else if (e.key === 'ArrowLeft') to = idx === 0 ? last : idx - 1;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = last;
    else if (e.key === 'Delete' && shown[idx].closable) {
      e.preventDefault();
      armFocus();
      onCloseTab(shown[idx].id);
      return;
    }
    if (to == null) return;
    e.preventDefault();
    const id = shown[to].id;
    onActiveChange(id);
    focusTab(id);
  };

  const titleIfTruncated = (e) => {
    const label = e.currentTarget.querySelector('[data-tab-label]');
    e.currentTarget.title = label && label.scrollWidth > label.clientWidth ? label.textContent : '';
  };

  // Edge cues when the strip overflows.
  const measureEdges = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdge((p) => (p.left === left && p.right === right ? p : { left, right }));
  }, []);
  useLayoutEffect(() => {
    measureEdges();
    const el = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measureEdges);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureEdges, shown.length]);

  // ---- Fade under the toolbar when content has scrolled beneath it -----------------------------
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return undefined;
    const onScroll = (e) => {
      const t = e.target;
      if (!(t instanceof Element) || t === body) return;
      // Only scrollers whose top edge is the panel's top edge slide under the toolbar.
      if (Math.abs(t.getBoundingClientRect().top - body.getBoundingClientRect().top) > 2) return;
      const id = t.closest('[role=tabpanel]')?.dataset.tabId;
      if (!id) return;
      const on = t.scrollTop > 2;
      setScrolledTabs((p) => (p[id] === on ? p : { ...p, [id]: on }));
    };
    body.addEventListener('scroll', onScroll, true);
    return () => body.removeEventListener('scroll', onScroll, true);
  }, []);
  const scrolled = Boolean(scrolledTabs[current]);

  // ---- Resize handle -----------------------------------------------------------------------------
  const onPointerDown = useCallback(
    (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = width;
      const move = (ev) => onWidthChange(startW + (startX - ev.clientX));
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
    [width, onWidthChange]
  );

  const onHandleKey = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); onWidthChange(width + 24); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); onWidthChange(width - 24); }
    else if (e.key === 'Home') { e.preventDefault(); onWidthChange(MAX_W); }
    else if (e.key === 'End') { e.preventDefault(); onWidthChange(MIN_W); }
  };

  const edgeMask =
    edge.left || edge.right
      ? `linear-gradient(to right, ${edge.left ? 'transparent 0, #000 16px' : '#000 0'}, ${edge.right ? '#000 calc(100% - 16px), transparent 100%' : '#000 100%'})`
      : undefined;

  return (
    <div ref={rootRef} className={cn('relative flex h-full min-h-0 flex-col', className)}>
      <style>{MOTION_CSS}</style>
      {!expanded && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize workspace"
          aria-valuemin={MIN_W}
          aria-valuemax={MAX_W}
          aria-valuenow={width}
          aria-valuetext={`${width} pixels wide`}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onKeyDown={onHandleKey}
          onDoubleClick={() => onWidthChange(DEFAULT_W)}
          title="Drag to resize. Double-click to reset."
          className={cn(
            'group/handle absolute inset-y-0 left-0 z-20 hidden w-2 cursor-col-resize md:block',
            'focus-visible:-outline-offset-2 focus-visible:outline-[hsl(var(--ring))]'
          )}
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-0.5 bg-transparent transition-colors duration-150 group-hover/handle:bg-foreground/25 group-focus-visible/handle:bg-[hsl(var(--ring))] motion-reduce:transition-none"
          />
        </div>
      )}

      {/* Tab strip */}
      <div className="flex h-12 shrink-0 items-center gap-1.5 pl-3 pr-2.5">
        <div
          ref={listRef}
          role="tablist"
          aria-label="Workspace tabs"
          onScroll={measureEdges}
          style={edgeMask ? { maskImage: edgeMask, WebkitMaskImage: edgeMask } : undefined}
          className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {shown.map((t, idx) => {
            const selected = t.id === current;
            return (
              <div
                key={t.id}
                role="presentation"
                data-selected={selected}
                className="wb-tab group/tab relative shrink-0 text-[13px] font-medium leading-tight"
              >
                <button
                  ref={(el) => { if (el) tabRefs.current[t.id] = el; else delete tabRefs.current[t.id]; }}
                  type="button"
                  role="tab"
                  id={tabDomId(t.id)}
                  aria-selected={selected}
                  aria-controls={panelDomId(t.id)}
                  aria-keyshortcuts={t.closable ? 'Delete' : undefined}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => onActiveChange(t.id)}
                  onKeyDown={(e) => onTabKey(e, idx)}
                  onMouseEnter={titleIfTruncated}
                  onFocus={titleIfTruncated}
                  className={cn(
                    'flex h-7 max-w-[168px] items-center gap-1.5 rounded-full pl-3',
                    t.closable ? 'pr-8' : 'pr-3',
                    FOCUS
                  )}
                >
                  {t.icon ? <t.icon data-tab-icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
                  <span data-tab-label className="truncate">{t.label}</span>
                  {t.badge ? (
                    <span className="wb-tab-badge">{t.badge}</span>
                  ) : null}
                </button>
                {t.closable ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => { armFocus(); onCloseTab(t.id); }}
                    aria-label={`Close ${t.label}`}
                    className={cn(
                      'wb-tab-close absolute right-1 top-[3px]',
                      FOCUS,
                      selected
                        ? ''
                        : '!opacity-0 group-hover/tab:!opacity-70 group-focus-within/tab:!opacity-70 focus-visible:!opacity-100 [@media(pointer:coarse)]:!opacity-70'
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
          <div ref={menuWrapRef} className="relative shrink-0">
            <button
              ref={plusRef}
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              onKeyDown={onPlusKey}
              aria-label="Open a tab"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className={cn(
                'wb-iconbtn',
                FOCUS
              )}
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
            {menuOpen ? (
              <div
                ref={menuRef}
                role="menu"
                aria-label="Open a tab"
                onKeyDown={onMenuKey}
                className="absolute right-0 top-full z-30 mt-1 w-56 origin-top-right overflow-hidden rounded-2xl border border-[hsl(var(--wb-line))] bg-popover p-1.5 shadow-[var(--shadow-md)] ws-menu-in"
              >
                {openable.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    onClick={() => pickTab(t.id)}
                    className="flex h-9 w-full items-center gap-2.5 rounded-full px-3 text-left text-[13px] text-foreground outline-none transition-colors duration-150 hover:bg-[hsl(var(--brand-50))] hover:text-[hsl(var(--brand-700))] focus-visible:bg-[hsl(var(--brand-50))] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[hsl(var(--ring))] motion-reduce:transition-none"
                  >
                    {t.icon ? <t.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : <span className="size-4 shrink-0" />}
                    <span className="flex-1 truncate">{t.label}</span>
                    {t.hint ? <span className="text-xs text-muted-foreground">{t.hint}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {onToggleExpand ? (
          <IconButton label={expanded ? 'Shrink workspace' : 'Expand workspace'} onClick={onToggleExpand}>
            {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </IconButton>
        ) : null}
        <IconButton label="Close workspace" onClick={onClose}>
          <PanelRightClose className="size-4" />
        </IconButton>
      </div>

      {/* Per-tab toolbar: quiet centred title, optional actions on the right. */}
      <div
        data-scrolled={scrolled || undefined}
        className="flex h-9 shrink-0 items-center gap-2 border-b border-transparent px-4 text-[13px] transition-colors duration-150 data-[scrolled]:border-[hsl(var(--wb-line))] motion-reduce:transition-none"
      >
        <span className="min-w-0 flex-1 truncate text-muted-foreground" title={currentTab?.subtitle || undefined}>{currentTab?.subtitle || ''}</span>
        {currentTab?.actions ? <div className="flex shrink-0 items-center gap-1">{currentTab.actions}</div> : null}
      </div>

      <div ref={bodyRef} className="relative min-h-0 flex-1">
        {shown.map((t) => (
          <div
            key={t.id}
            role="tabpanel"
            id={panelDomId(t.id)}
            aria-labelledby={tabDomId(t.id)}
            data-tab-id={t.id}
            hidden={t.id !== current}
            className="absolute inset-0 min-h-0 overflow-hidden ws-tab-in"
          >
            <div className="h-full min-h-0">{t.content}</div>
          </div>
        ))}
        {/* Soft edge so scrolled content reads as passing under the toolbar. */}
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 z-10 h-3 bg-gradient-to-b from-foreground/[0.06] to-transparent transition-opacity duration-150 motion-reduce:transition-none',
            scrolled ? 'opacity-100' : 'opacity-0'
          )}
        />
      </div>
    </div>
  );
}
