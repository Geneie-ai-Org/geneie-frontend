import { useEffect } from 'react';

/**
 * Prevents scroll on the page and nested scroll containers while a modal is open.
 * Scroll inside `contentRef` is still allowed.
 */
export function useModalScrollLock(isOpen, contentRef) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const preventBackgroundScroll = (event) => {
      const panel = contentRef?.current;
      if (panel && panel.contains(event.target)) {
        return;
      }
      event.preventDefault();
    };

    document.addEventListener('wheel', preventBackgroundScroll, { passive: false });
    document.addEventListener('touchmove', preventBackgroundScroll, { passive: false });

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('wheel', preventBackgroundScroll);
      document.removeEventListener('touchmove', preventBackgroundScroll);
    };
  }, [isOpen, contentRef]);
}
