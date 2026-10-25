// beui.dev/components/motion/marquee

import { Children } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

/**
 * Infinite horizontal loop of its children, paused on hover. With reduced motion it is a plain wrapped row instead,
 * which the beUI original does not handle.
 */
export function Marquee({ children, direction = 'left', speed = 30, pauseOnHover = true, gap = '1rem', fade = true, className }) {
  const reduce = useReducedMotion();
  const items = Children.toArray(children);

  if (reduce) {
    return (
      <div className={cn('flex flex-wrap items-center', className)} style={{ gap }}>
        {items.map((child, i) => <div key={i} className="shrink-0">{child}</div>)}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group relative flex overflow-hidden',
        fade && '[mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]',
        className,
      )}
      // The gap on the wrapper too, so the seam between the two tracks matches the spacing between items.
      style={{ '--gap': gap, gap }}
    >
      {[0, 1].map((copy) => (
        <div
          key={copy}
          aria-hidden={copy === 1}
          inert={copy === 1}
          style={{ animationDuration: `${speed}s`, animationDirection: direction === 'right' ? 'reverse' : 'normal', gap }}
          className={cn('flex shrink-0 flex-row items-center animate-marquee', pauseOnHover && 'group-hover:[animation-play-state:paused]')}
        >
          {items.map((child, i) => <div key={i} className="shrink-0">{child}</div>)}
        </div>
      ))}
    </div>
  );
}
