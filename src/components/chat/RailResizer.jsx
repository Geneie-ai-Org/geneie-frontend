import { useCallback, useEffect, useState } from 'react';

export const RAIL_WIDTH_KEY = 'geneie-rail-width-v1';
const MIN_W = 220;
const MAX_W = 420;
const DEFAULT_W = 280;

const clampWidth = (w) => {
  const cap = Math.min(MAX_W, Math.round(window.innerWidth * 0.4));
  return Math.max(MIN_W, Math.min(cap, Math.round(w)));
};

function readStoredWidth() {
  try {
    const v = Number(localStorage.getItem(RAIL_WIDTH_KEY));
    return Number.isFinite(v) && v > 0 ? clampWidth(v) : DEFAULT_W;
  } catch {
    return DEFAULT_W;
  }
}

// Apply a remembered width before first paint so opening the rail does not jump.
if (typeof window !== 'undefined') {
  document.documentElement.style.setProperty('--sidebar-left-width', `${readStoredWidth()}px`);
}

/**
 * Drag handle on the right edge of the open conversation rail, the mirror of the workspace panel's
 * handle. Writes `--sidebar-left-width` (the shell grid column) and remembers the width.
 * Drag, arrow keys (24px), Home/End, double-click to reset.
 */
export default function RailResizer() {
  const [width, setWidth] = useState(readStoredWidth);

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-left-width', `${width}px`);
    try {
      localStorage.setItem(RAIL_WIDTH_KEY, String(width));
    } catch {
      /* storage blocked: width applies for this session */
    }
  }, [width]);

  useEffect(() => {
    const onResize = () => setWidth((w) => clampWidth(w));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const set = useCallback((w) => setWidth(clampWidth(w)), []);

  const onPointerDown = useCallback(
    (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = width;
      const move = (ev) => set(startW + (ev.clientX - startX));
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        delete document.documentElement.dataset.resizing;
      };
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      document.documentElement.dataset.resizing = 'true';
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
    [width, set]
  );

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); set(width + 24); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); set(width - 24); }
    else if (e.key === 'Home') { e.preventDefault(); set(MIN_W); }
    else if (e.key === 'End') { e.preventDefault(); set(MAX_W); }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={MIN_W}
      aria-valuemax={MAX_W}
      aria-valuenow={width}
      aria-valuetext={`${width} pixels wide`}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => set(DEFAULT_W)}
      title="Drag to resize. Double-click to reset."
      className="group/handle absolute inset-y-0 right-0 z-[60] hidden w-2 cursor-col-resize md:block focus-visible:-outline-offset-2 focus-visible:outline-[hsl(var(--ring))]"
    >
      <span
        aria-hidden="true"
        className="wb-grip absolute right-0 top-[44%] bottom-[44%] w-1 rounded-full bg-[hsl(var(--wb-line-strong))] group-hover/handle:top-[34%] group-hover/handle:bottom-[34%] group-hover/handle:bg-[hsl(var(--brand-500))] group-focus-visible/handle:top-[34%] group-focus-visible/handle:bottom-[34%] group-focus-visible/handle:bg-[hsl(var(--ring))] group-active/handle:top-[26%] group-active/handle:bottom-[26%] group-active/handle:bg-[hsl(var(--brand-500))]"
      />
    </div>
  );
}
