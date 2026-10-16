import { useEffect } from 'react';

/**
 * On-screen keyboard on touch browsers that shrink only the *visual* viewport (iOS Safari, Android
 * with the default resize mode). While the keyboard is up, `html[data-kb]` is set and `--app-vh` /
 * `--app-vt` carry the visible height and its offset, so the shell can fit exactly what the user
 * can see and keep the composer on screen. Browsers that resize the layout viewport themselves
 * (`interactive-widget=resizes-content`) never trip the threshold and need nothing.
 */
export default function useKeyboardViewport(enabled) {
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!enabled || !vv) return undefined;
    const root = document.documentElement;
    const clear = () => {
      root.removeAttribute('data-kb');
      root.style.removeProperty('--app-vh');
      root.style.removeProperty('--app-vt');
    };
    const sync = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      const lifted = window.innerHeight - vv.height > 120;
      if (lifted && covered >= -2) {
        root.setAttribute('data-kb', '');
        root.style.setProperty('--app-vh', `${Math.round(vv.height)}px`);
        root.style.setProperty('--app-vt', `${Math.round(vv.offsetTop)}px`);
      } else {
        clear();
      }
    };
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    sync();
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      clear();
    };
  }, [enabled]);
}
