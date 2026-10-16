import { useEffect, useRef } from 'react';

/**
 * Touch swipe to dismiss a drawer or sheet.
 *
 * `targetRef` is the element that moves (it follows the finger, then the CSS transition on it takes
 * over); `handleRef` is where the gesture may start (defaults to the target). `axis` 'x' with
 * `sign` -1 dismisses leftward (the rail drawer), 'y' with `sign` 1 dismisses downward (the
 * workspace sheet). The handle needs `touch-action: pan-y` (x) or `none` (y) in CSS so the browser
 * does not claim the gesture. Mouse input is ignored: on a desktop the close button is the way out.
 */
export default function useSwipeDismiss({ targetRef, handleRef, enabled, axis = 'x', sign = -1, onDismiss, threshold = 72 }) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const target = targetRef.current;
    const handle = (handleRef || targetRef).current;
    if (!enabled || !target || !handle) return undefined;

    let st = null;
    const along = (e, o = st) => (axis === 'x' ? e.clientX - o.x : e.clientY - o.y) * sign;
    const across = (e, o = st) => Math.abs(axis === 'x' ? e.clientY - o.y : e.clientX - o.x);
    const offset = (px) => (axis === 'x' ? `translateX(${px * sign}px)` : `translateY(${px * sign}px)`);

    const down = (e) => {
      if (e.pointerType === 'mouse' || !e.isPrimary) return;
      st = { x: e.clientX, y: e.clientY, t: performance.now(), locked: false, id: e.pointerId };
    };
    const move = (e) => {
      if (!st || e.pointerId !== st.id) return;
      const a = along(e);
      if (!st.locked) {
        if (across(e) > 10 && across(e) > Math.abs(a)) { st = null; return; }
        if (a < 10) return;
        st.locked = true;
        try { handle.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
        target.style.transition = 'none';
      }
      target.style.transform = offset(Math.max(0, a));
    };
    const end = (e) => {
      if (!st || e.pointerId !== st.id) return;
      const s = st;
      st = null;
      if (!s.locked) return;
      const a = along(e, s);
      const v = a / Math.max(1, performance.now() - s.t);
      target.style.transition = '';
      if (e.type === 'pointerup' && (a > threshold || v > 0.5)) {
        // Park it where the closed state will be, so the state change and the CSS agree.
        target.style.transform = axis === 'x' ? `translateX(${sign * 100}%)` : `translateY(${sign * 100}%)`;
        dismissRef.current?.();
        setTimeout(() => { target.style.transform = ''; }, 320);
      } else {
        target.style.transform = '';
      }
    };

    handle.addEventListener('pointerdown', down);
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    return () => {
      handle.removeEventListener('pointerdown', down);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      target.style.transition = '';
      target.style.transform = '';
    };
  }, [targetRef, handleRef, enabled, axis, sign, threshold]);
}
