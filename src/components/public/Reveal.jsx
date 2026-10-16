import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * Lets a block rise into place once, the first time it scrolls into view. Opacity and
 * translateY only; with reduced motion (or no IntersectionObserver) it simply renders.
 */
export default function Reveal({ as: Tag = 'div', delay = 0, className = '', style, children, ...rest }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return undefined;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          obs.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -6% 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [reduce]);

  const hidden = !shown && !reduce;
  return (
    <Tag
      ref={ref}
      className={className}
      style={{
        ...style,
        opacity: hidden ? 0 : 1,
        transform: hidden ? 'translateY(12px)' : 'none',
        transition: reduce ? 'none' : `opacity 260ms cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 260ms cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
