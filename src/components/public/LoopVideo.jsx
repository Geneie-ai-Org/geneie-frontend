import React, { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * Muted, looping decorative video that only downloads and plays while it is on screen (preload is off until
 * the first play). With reduced motion it never plays and shows its poster. Hidden from assistive tech.
 */
export default function LoopVideo({ src, poster, className = '' }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const video = ref.current;
    if (!video || reduce || typeof IntersectionObserver === 'undefined') return undefined;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) video.play().catch(() => {});
      else video.pause();
    }, { threshold: 0.25 });
    obs.observe(video);
    return () => obs.disconnect();
  }, [reduce]);

  return (
    <video
      ref={ref}
      muted
      loop
      playsInline
      preload="none"
      poster={poster}
      aria-hidden="true"
      tabIndex={-1}
      className={`pointer-events-none select-none ${className}`}
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
