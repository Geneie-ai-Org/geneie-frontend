import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Maximize2, Minimize2, PanelRightClose, PanelsTopLeft, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { AnimatePresence, Reorder, motion, useReducedMotion } from 'motion/react';
import { useIsMobile } from '@/hooks/useIsMobile';
import useSwipeDismiss from '@/hooks/useSwipeDismiss';

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

function IconButton({ label, onClick, children, className }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClick}
            aria-label={label}
            className={cn('wb-iconbtn focus-visible:ring-[hsl(var(--ring))]', className)}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
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
  onReorderTabs,
  onClose,
  width,
  onWidthChange,
  expanded = false,
  onToggleExpand,
  persistKey,
  onRestore,
  landed,
  landing,
  onLandingView,
  onLandingDismiss,
  className,
}) {
  const uid = useId();
  const reduceMotion = useReducedMotion();
  // Phone: the panel is a bottom sheet. It gets its own header (back, title), no resize/expand, a tab strip
  // that scrolls under the finger (no drag-to-reorder), and a swipe-down on the header to close.
  const isPhone = useIsMobile();
  const hostRef = useRef(null);
  const sheetHeadRef = useRef(null);
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

  useEffect(() => { hostRef.current = rootRef.current?.parentElement || null; });
  useSwipeDismiss({ targetRef: hostRef, handleRef: sheetHeadRef, enabled: isPhone, axis: 'y', sign: 1, onDismiss: onClose });

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

  // Keep the active tab visible when the strip overflows: when it is clipped or under a fade, glide it to
  // the middle of the strip (instant under reduced motion). Vertical scroll is never touched.
  useEffect(() => {
    const list = listRef.current;
    const tab = tabRefs.current[current]?.closest('.wb-tab') || tabRefs.current[current];
    if (!list || !tab || list.scrollWidth <= list.clientWidth + 2) return;
    const l = list.getBoundingClientRect();
    const t = tab.getBoundingClientRect();
    const pad = 36; // clear of the edge fades and the scroll buttons
    if (t.left >= l.left + pad && t.right <= l.right - pad) return;
    const delta = t.left + t.width / 2 - (l.left + l.width / 2);
    list.scrollBy({ left: delta, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [current, shown.length, reduceMotion]);

  const onTabKey = (e, idx) => {
    const last = shown.length - 1;
    let to = null;
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && onReorderTabs && shown[idx].closable !== false) {
      const j = e.key === 'ArrowLeft' ? idx - 1 : idx + 1;
      if (j < 0 || j > last || shown[j].closable === false) return;
      e.preventDefault();
      const ids = shown.map((t) => t.id);
      [ids[idx], ids[j]] = [ids[j], ids[idx]];
      onReorderTabs(ids);
      return;
    }
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

  // A mouse wheel over the strip scrolls it sideways (trackpads that already send deltaX are left alone).
  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (el.scrollWidth <= el.clientWidth + 2 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const nudge = (dir) => {
    const el = listRef.current;
    if (el) el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.6), behavior: reduceMotion ? 'auto' : 'smooth' });
  };

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
      ? `linear-gradient(to right, ${edge.left ? 'transparent 0, #000 34px' : '#000 0'}, ${edge.right ? '#000 calc(100% - 34px), transparent 100%' : '#000 100%'})`
      : undefined;

  return (
    <TooltipProvider delay={500} closeDelay={0} timeout={600}>
    <div ref={rootRef} className={cn('ws-root relative flex h-full min-h-0 flex-col', className)}>
      <style>{MOTION_CSS}</style>
      {/* Phone sheet header: grabber, a clear way back to the chat, the title. Swipe it down to close. */}
      <div ref={sheetHeadRef} className="ws-sheet-head md:hidden">
        <span className="ws-sheet-grab" aria-hidden="true" />
        <div className="flex h-12 items-center gap-1 pl-1 pr-4">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to chat"
            className={cn('ws-sheet-back', FOCUS)}
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <h2 className="m-0 min-w-0 flex-1 truncate text-[16px] font-medium text-foreground">Workspace</h2>
        </div>
      </div>
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
            className="wb-grip absolute left-0 top-[44%] bottom-[44%] w-1 rounded-full bg-[hsl(var(--wb-line-strong))] group-hover/handle:top-[34%] group-hover/handle:bottom-[34%] group-hover/handle:bg-[hsl(var(--brand-500))] group-focus-visible/handle:top-[34%] group-focus-visible/handle:bottom-[34%] group-focus-visible/handle:bg-[hsl(var(--ring))] group-active/handle:top-[26%] group-active/handle:bottom-[26%] group-active/handle:bg-[hsl(var(--brand-500))]"
          />
        </div>
      )}

      {/* Tab strip */}
      <div className="ws-strip-row flex h-12 shrink-0 items-center gap-1.5 pl-3 pr-2.5 max-md:h-14 max-md:pr-3">
        <div className="relative min-w-0 flex-1">
        <motion.div
          ref={listRef}
          layoutScroll
          role="tablist"
          aria-label="Workspace tabs"
          onScroll={measureEdges}
          style={edgeMask ? { maskImage: edgeMask, WebkitMaskImage: edgeMask } : undefined}
          className="flex min-w-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <Reorder.Group
            as="div"
            axis="x"
            values={shown.map((t) => t.id)}
            onReorder={(ids) => {
              const pinned = ids.filter((id) => byId.get(id)?.closable === false);
              onReorderTabs?.([...pinned, ...ids.filter((id) => !pinned.includes(id))]);
            }}
            className="flex items-center gap-1.5"
          >
          <AnimatePresence initial={false} mode="popLayout">
          {shown.map((t, idx) => {
            const selected = t.id === current;
            return (
              <Reorder.Item
                as="div"
                key={t.id}
                value={t.id}
                drag={onReorderTabs && t.closable !== false && !reduceMotion && !isPhone ? 'x' : false}
                dragMomentum={false}
                whileDrag={{ scale: 1.05, zIndex: 20, boxShadow: '0 6px 18px -6px rgb(0 0 0 / 0.25)' }}
                initial={reduceMotion ? false : { opacity: 0, scale: 0.86 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.86 }}
                transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                role="presentation"
                data-selected={selected}
                className="wb-tab wb-tab--slide group/tab relative shrink-0 text-[13px] font-medium leading-tight"
              >
                {selected ? (
                  <motion.span
                    layoutId={`${uid}-tab-pill`}
                    className="wb-tab-pill"
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 40 }}
                  />
                ) : null}
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
                    'relative flex h-7 max-w-[168px] items-center gap-1.5 rounded-full pl-2.5',
                    t.closable ? 'pr-7' : 'pr-2.5',
                    FOCUS
                  )}
                >
                  {t.icon ? <t.icon data-tab-icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
                  <span data-tab-label className="truncate">{t.label}</span>
                  {t.badge ? (
                    <span className="wb-tab-badge">{t.badge}</span>
                  ) : null}
                  {landed?.[t.id] && !selected ? (
                    <>
                      <span className="wb-tab-dot" aria-hidden="true" />
                      <span className="sr-only"> (new)</span>
                    </>
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
              </Reorder.Item>
            );
          })}
          </AnimatePresence>
          </Reorder.Group>
        </motion.div>
        {/* Mouse-only helpers: keyboard users already move (and scroll) with the arrow keys on the tabs. */}
        {[['left', -1, ChevronLeft, 'Scroll tabs left'], ['right', 1, ChevronRight, 'Scroll tabs right']].map(([side, dir, Icon, label]) => (
          <button
            key={side}
            type="button"
            tabIndex={-1}
            aria-label={label}
            aria-hidden={!edge[side] || undefined}
            disabled={!edge[side]}
            onClick={() => nudge(dir)}
            className={cn(
              'ws-nudge max-md:hidden absolute top-1/2 z-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-card))] text-muted-foreground shadow-[var(--shadow-sm)] transition-[opacity,color,border-color] duration-150 hover:border-[hsl(var(--brand-300))] hover:text-[hsl(var(--brand-700))] motion-reduce:transition-none',
              side === 'left' ? 'left-0' : 'right-0',
              edge[side] ? 'opacity-100' : 'pointer-events-none opacity-0'
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
          </button>
        ))}
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
              <Plus className={cn('size-4 transition-transform duration-200 ease-out motion-reduce:transition-none', menuOpen && 'rotate-45')} aria-hidden="true" />
            </button>
            {menuOpen ? (
              <div
                ref={menuRef}
                role="menu"
                aria-label="Open a tab"
                onKeyDown={onMenuKey}
                className="absolute right-0 top-full z-30 mt-1 w-56 origin-top-right overflow-hidden rounded-2xl border border-[hsl(var(--wb-line))] bg-popover p-1.5 shadow-[var(--shadow-md)] ws-menu-in"
              >
                {openable.map((t, mi) => (
                  <button
                    key={t.id}
                    style={{ animationDelay: `${mi * 30}ms` }}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    onClick={() => pickTab(t.id)}
                    className="wb-fade flex h-9 max-md:h-11 w-full items-center gap-2.5 rounded-full px-3 text-left text-[13px] text-foreground outline-none transition-colors duration-150 hover:bg-[hsl(var(--brand-50))] hover:text-[hsl(var(--brand-700))] focus-visible:bg-[hsl(var(--brand-50))] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[hsl(var(--ring))] motion-reduce:transition-none"
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
          <IconButton label={expanded ? 'Shrink workspace' : 'Expand workspace'} onClick={onToggleExpand} className="max-md:!hidden">
            {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </IconButton>
        ) : null}
        <IconButton label="Close workspace" onClick={onClose} className="max-md:!hidden">
          <PanelRightClose className="size-4" />
        </IconButton>
      </div>

      {/* Landing note: work arrived. Quiet, self-dismissing; "View" only when the user was not moved. */}
      <AnimatePresence initial={false}>
        {landing ? (
          <motion.div
            key={landing.id}
            role="status"
            aria-live="polite"
            initial={reduceMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="wb-landing">
              <span className="wb-landing-check" aria-hidden="true"><Check className="size-3" /></span>
              <span className="min-w-0 flex-1 truncate">{landing.text}</span>
              {landing.actionable ? (
                <button
                  type="button"
                  onClick={() => onLandingView?.(landing.tabId)}
                  className={cn('wb-landing-open transition-colors duration-150 hover:!bg-[hsl(var(--brand-100))] motion-reduce:transition-none', FOCUS)}
                >
                  View
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onLandingDismiss?.()}
                aria-label="Dismiss"
                className={cn('flex size-6 shrink-0 items-center justify-center rounded-full text-[hsl(var(--brand-700))]/70 transition-colors duration-150 hover:bg-[hsl(var(--brand-100))] hover:text-[hsl(var(--brand-700))] motion-reduce:transition-none', FOCUS)}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Per-tab toolbar: quiet centred title, optional actions on the right. */}
      <div
        data-scrolled={scrolled || undefined}
        className="flex h-9 shrink-0 items-center gap-2 border-b border-transparent px-4 text-[13px] transition-colors duration-150 data-[scrolled]:border-[hsl(var(--wb-line))] motion-reduce:transition-none"
      >
        <span className="min-w-0 flex-1 truncate text-muted-foreground" title={currentTab?.subtitle || undefined}>{currentTab?.subtitle || ''}</span>
        {currentTab?.actions ? <div className="flex shrink-0 items-center gap-1">{currentTab.actions}</div> : null}
      </div>

      <div ref={bodyRef} className="relative min-h-0 flex-1">
        {shown.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <div className="wb-card wb-rise tx tx--lattice flex w-full max-w-sm flex-col items-center gap-2 overflow-hidden px-6 pb-6 pt-7 text-center" style={{ '--tx-at': '50% 0%', '--tx-fade': '85% 48%' }}>
              <span className="flex size-11 items-center justify-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-500))]" aria-hidden="true">
                <PanelsTopLeft className="size-5" />
              </span>
              <h2 className="font-display m-0 mt-1 text-[22px] text-foreground">Nothing open</h2>
              <p className="m-0 max-w-[26ch] text-[13px] leading-5 text-muted-foreground">
                {openable.length > 0 ? 'Open a tab to see the file, its filters, the results or the pipeline.' : 'Tabs appear here once you add a file or start a run.'}
              </p>
              {openable.length > 0 ? (
                <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                  {openable.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => pickTab(t.id)}
                      className={cn('wb-chip h-8 gap-1.5 px-3 text-[13px] font-medium transition-colors duration-150 hover:!border-[hsl(var(--brand-300))] hover:!bg-[hsl(var(--brand-50))] hover:text-[hsl(var(--brand-700))] motion-reduce:transition-none', FOCUS)}
                    >
                      {t.icon ? <t.icon className="size-3.5 text-muted-foreground" aria-hidden="true" /> : null}
                      {t.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
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
    </TooltipProvider>
  );
}
