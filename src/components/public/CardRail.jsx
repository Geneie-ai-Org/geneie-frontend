import React, { useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

const GAP = 12;

/**
 * Phones: a few short peer cards in a swipeable rail. Native scroll-snap does the work (no JS drives the scroll),
 * the next card peeks in so it reads as swipeable, and the dots show the position and jump to a card. No autoplay.
 * The scroller is focusable, so arrow keys scroll it. Each item is { id, title, body, icon? }.
 */
export default function CardRail({ label, items }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const [active, setActive] = useState(0);

  const width = () => (ref.current?.firstElementChild?.offsetWidth ?? 0) + GAP;
  const onScroll = () => {
    const w = width();
    if (!w) return;
    setActive(Math.max(0, Math.min(items.length - 1, Math.round(ref.current.scrollLeft / w))));
  };
  const jump = (i) => ref.current?.scrollTo({ left: i * width(), behavior: reduce ? 'auto' : 'smooth' });

  return (
    <div role="region" aria-roledescription="carousel" aria-label={label}>
      <ul
        ref={ref}
        onScroll={onScroll}
        tabIndex={0}
        className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 [scroll-padding-inline:1.25rem] [scrollbar-width:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500))] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <li
            key={item.id}
            className="wb-card pub-card w-[min(82%,17.5rem)] shrink-0 snap-start snap-always p-4"
            style={{ borderRadius: 20 }}
          >
            <h4 className="flex items-center gap-2 text-base font-medium leading-6">
              {item.icon}
              {item.title}
            </h4>
            <p className="mt-1.5 text-base leading-6 text-muted-foreground">{item.body}</p>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center justify-center">
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => jump(i)}
            aria-label={`Show ${item.title}`}
            aria-current={i === active}
            className="group flex h-11 w-6 items-center justify-center outline-none"
          >
            <span
              className="h-1.5 rounded-full transition-all duration-200 group-focus-visible:ring-2 group-focus-visible:ring-[hsl(var(--brand-500))]"
              style={{ width: i === active ? 18 : 6, background: i === active ? 'hsl(var(--brand-500))' : 'hsl(var(--wb-line-strong))' }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
