import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Result card for a finished unit of work ("3 variants in scope", "1 file changed"): a light
 * gray rounded card. Title row with an optional right-hand node (e.g. an Undo button), then one
 * row per item: label, muted meta, and +/- counts. The chevron opens `children` below the rows
 * when there are any; `onToggle(open)` fires either way.
 *
 * rows: [{ label, meta?, add?, del? }]. Counts of `null`/`undefined` are omitted; `0` is shown.
 */
export default function ResultCard({ title, right = null, rows = [], onToggle, children, defaultOpen = false, className }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const expandable = Boolean(children) || typeof onToggle === 'function';

  const toggle = () => {
    const next = !open;
    setOpen(next);
    onToggle?.(next);
  };

  const hasCount = (n) => n !== null && n !== undefined;
  const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : n);

  return (
    <div
      className={cn('w-full overflow-hidden text-[13px] leading-5 tabular-nums', className)}
      style={{ borderRadius: 12, backgroundColor: 'var(--bg-surface-raised)', color: 'var(--text-primary)' }}
    >
      <div className="flex h-10 items-center justify-between gap-3 px-3.5">
        <span className="min-w-0 truncate" title={typeof title === 'string' ? title : undefined}>{title}</span>
        {right ? <span className="flex shrink-0 items-center gap-1 text-[var(--text-secondary)]">{right}</span> : null}
      </div>

      {rows.map((row, i) => {
        const content = (
          <>
            <span className="min-w-0 truncate" title={typeof row.label === 'string' ? row.label : undefined}>{row.label}</span>
            {row.meta ? <span className="shrink-0 text-muted-foreground">{row.meta}</span> : null}
            {/* Counts carry their sign, so colour is never the only signal. Mixed toward the text
             * colour to hold 4.5:1 on the card's gray. */}
            {hasCount(row.add) && (
              <span className="shrink-0 tabular-nums" style={{ color: 'color-mix(in srgb, var(--diff-add) 75%, var(--text-primary))' }}>+{fmt(row.add)}</span>
            )}
            {hasCount(row.del) && (
              <span className="shrink-0 tabular-nums" style={{ color: 'color-mix(in srgb, var(--diff-del) 75%, var(--text-primary))' }}>{'−'}{fmt(row.del)}</span>
            )}
            <span className="flex-1" />
            {/* The chevron is only drawn where a click does something. */}
            {expandable ? (
              <ChevronDown
                className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180')}
                aria-hidden
              />
            ) : null}
          </>
        );
        const rowClass = 'flex h-10 w-full items-center gap-2 border-t border-[var(--border-default)] px-3.5 text-left';
        return expandable ? (
          <button
            key={i}
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={children ? bodyId : undefined}
            className={cn(rowClass, 'chat-focus-inset transition-colors duration-150 hover:bg-[var(--bg-surface-hover)]')}
          >
            {content}
          </button>
        ) : (
          <div key={i} className={rowClass}>{content}</div>
        );
      })}

      {children && open ? (
        <div id={bodyId} className="border-t border-[var(--border-default)] px-3.5 py-2.5 text-[var(--text-secondary)]">
          {children}
        </div>
      ) : null}
    </div>
  );
}
