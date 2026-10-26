import React from 'react';

const TOP = 72; // px: the 56px site header plus a gap
const STEP = 14; // px each later card rests below the one before it

/**
 * Phones: cards that pile up as the page scrolls. Each card is sticky, so the next one slides over the last and
 * leaves its top edge showing. Plain CSS: it reads in order without JS, and with reduced motion the cards are an
 * ordinary list. Cards share a minimum height so the pile lines up. Each item is { id, eyebrow?, title, body }.
 */
export default function StackCards({ items }) {
  return (
    <ol className="flex flex-col gap-6">
      {items.map((item, i) => (
        <li
          key={item.id}
          className="sticky motion-reduce:static"
          style={{ top: TOP + i * STEP }}
        >
          <div
            className="wb-card pub-card flex min-h-[13.5rem] flex-col p-5 !bg-[hsl(var(--wb-card))]"
            style={{ borderRadius: 20 }}
          >
            {item.eyebrow ? (
              <p aria-hidden="true" className="text-xl font-medium leading-7 text-[var(--text-tertiary)] line-through decoration-[hsl(var(--brand-500))] decoration-2">
                {item.eyebrow}
              </p>
            ) : null}
            <h3 className="mt-3 text-xl font-medium leading-6">{item.title}</h3>
            <p className="mt-2 text-base leading-6 text-muted-foreground">{item.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
