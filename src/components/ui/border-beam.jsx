/**
 * Border beam — a short light that travels round its container's edge.
 *
 * Ported from Magic UI's BorderBeam (https://magicui.design/docs/components/border-beam).
 * The original uses Tailwind v4 utilities (mask-intersect, border-(length:…), bg-linear-to-l);
 * this repo is on Tailwind 3, so those are written as inline styles. The container needs
 * `position: relative` and a border-radius; the beam inherits the radius.
 */
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

export function BorderBeam({
  className,
  size = 50,
  delay = 0,
  duration = 6,
  colorFrom = '#ffaa40',
  colorTo = '#9c40ff',
  transition,
  style,
  reverse = false,
  initialOffset = 0,
  borderWidth = 1,
}) {
  const reduceMotion = useReducedMotion();
  // A light running round a box forever is decoration; drop it for reduced motion.
  if (reduceMotion) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-[inherit] border-solid border-transparent"
      style={{
        borderWidth,
        // Show only the border ring: the padding-box layer is cut out of the border-box one.
        WebkitMask: 'linear-gradient(transparent, transparent) padding-box, linear-gradient(#000, #000) border-box',
        WebkitMaskComposite: 'source-in',
        mask: 'linear-gradient(transparent, transparent) padding-box, linear-gradient(#000, #000) border-box',
        maskComposite: 'intersect',
      }}
    >
      <motion.div
        className={cn('absolute aspect-square', className)}
        style={{
          width: size,
          offsetPath: `rect(0 auto auto 0 round ${size}px)`,
          backgroundImage: `linear-gradient(to left, ${colorFrom}, ${colorTo}, transparent)`,
          ...style,
        }}
        initial={{ offsetDistance: `${initialOffset}%` }}
        animate={{
          offsetDistance: reverse
            ? [`${100 - initialOffset}%`, `${-initialOffset}%`]
            : [`${initialOffset}%`, `${100 + initialOffset}%`],
        }}
        transition={{
          repeat: Infinity,
          ease: 'linear',
          duration,
          delay: -delay,
          ...transition,
        }}
      />
    </div>
  );
}

export default BorderBeam;
