import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Panels narrower than this get the phone treatment (container based, so a 440px desktop panel gets it too). */
export const NARROW_PANEL = 520;

/**
 * Measures the element it is attached to and reports whether it is narrow. It also writes data-w="narrow"
 * on the element, so descendants can style themselves with `group-data-[w=narrow]/tab:` (put `group/tab` on
 * the same element). A viewport media query is the wrong signal here: the workbench is a full-width sheet
 * below 768px, but a side panel of 300-760px above it.
 */
export function usePanelWidth(max = NARROW_PANEL, external = null) {
  const own = useRef(null);
  const ref = external || own;
  const [narrow, setNarrow] = useState(false);
  const watch = useRef({ el: null, ro: null });
  // Runs after every render, because the element may mount late (loading states render something else first);
  // it only does work when the element changes.
  useLayoutEffect(() => {
    const el = ref.current;
    const w = watch.current;
    if (el === w.el) return;
    w.ro?.disconnect();
    w.el = el;
    w.ro = null;
    if (!el) return;
    const apply = (width) => {
      const n = width > 0 && width < max;
      el.dataset.w = n ? 'narrow' : 'wide';
      setNarrow((prev) => (prev === n ? prev : n));
    };
    apply(el.getBoundingClientRect().width);
    if (typeof ResizeObserver !== 'undefined') {
      w.ro = new ResizeObserver(([e]) => apply(e.contentRect.width));
      w.ro.observe(el);
    }
  });
  useEffect(() => () => { watch.current.ro?.disconnect(); watch.current = { el: null, ro: null }; }, []);
  return [ref, narrow];
}

/** True while a media query matches (updates live). Server render and the first paint use `initial`. */
export function useMediaQuery(query, initial = false) {
  const [match, setMatch] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : initial));
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

/** Phones: the workbench is a full-height sheet below 768px (shell.css), so floating popovers become bottom sheets. */
export const usePhone = () => useMediaQuery('(max-width: 767px)');
/** A finger, not a mouse: larger hit areas, 16px inputs (iOS zooms the page on focus below 16px). */
export const useCoarse = () => useMediaQuery('(pointer: coarse)');
