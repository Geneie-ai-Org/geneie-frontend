import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

let lenis = null;
let users = 0;
let resist = null;

/** Lets one section change each wheel movement before Lenis reads it (e.g. friction). Pass null to clear. */
export function setScrollResistance(fn) {
  resist = fn;
}

/**
 * One Lenis for the whole page, shared by whoever asks and destroyed with the last release. Returns null
 * with reduced motion (the page then scrolls natively); only call releaseLenis() after a non-null acquire.
 * `anchors` keeps the header's #section links scrolling smoothly, which Lenis would otherwise make instant.
 */
export function acquireLenis() {
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  if (!lenis) lenis = new Lenis({
      autoRaf: true,
      anchors: true,
      // Lenis reads deltaX/deltaY from this same object after the hook, so scaling it here scales the scroll.
      virtualScroll: (data) => {
        if (resist) resist(data);
        return true;
      },
    });
  users += 1;
  return lenis;
}

export function releaseLenis() {
  users -= 1;
  if (users <= 0 && lenis) {
    lenis.destroy();
    lenis = null;
    users = 0;
  }
}
