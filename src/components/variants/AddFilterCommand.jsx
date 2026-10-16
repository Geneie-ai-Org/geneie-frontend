import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CornerDownLeft, Hash, ListChecks, Plus, Search, ToggleLeft } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HighlightPill } from '@/components/ui/highlight-pill';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePhone } from '@/hooks/useWorkbenchWidth';
import BottomSheet from './BottomSheet';

/** Glyph per column type: number, category, or yes/no. */
export const KIND_GLYPH = { number: Hash, category: ListChecks, boolean: ToggleLeft };
export function KindGlyph({ kind, className }) {
  const Icon = KIND_GLYPH[kind] || Hash;
  return <Icon aria-hidden className={cn('size-3.5 shrink-0', className)} />;
}

const OPS = { '>=': 'min', '>': 'min', '<=': 'max', '<': 'max' };

/**
 * "qual > 100", "max_freq<=0.01" or "moi = AD" typed into the box becomes one ready-to-run row. The column
 * must exist (exact, or the only prefix match), so a typo never silently filters the wrong thing.
 */
function parseQuick(query, columns) {
  const m = query.trim().match(/^([^\s<>=]+)\s*(>=|<=|>|<|=)\s*(.+)$/);
  if (!m) return null;
  const [, rawCol, op, rawVal] = m;
  const lc = rawCol.toLowerCase();
  const exact = columns.find((c) => c.name.toLowerCase() === lc);
  const pool = exact ? [exact] : columns.filter((c) => c.name.toLowerCase().startsWith(lc));
  if (pool.length !== 1) return null;
  const col = pool[0];
  if (col.kind === 'number') {
    const n = Number(rawVal.replace(/,/g, ''));
    if (!Number.isFinite(n) || op === '=') return null;
    return { col, spec: { [OPS[op]]: n }, label: `${col.name} ${op} ${rawVal.trim()}` };
  }
  if (op !== '=') return null;
  const hit = (col.values || []).find((v) => String(v).toLowerCase() === rawVal.trim().toLowerCase());
  if (hit === undefined) return null;
  return { col, spec: { values: [hit] }, label: `${col.name} = ${hit}` };
}

/**
 * The primary way into filtering: a pill that opens a command box. Type to find a column, Enter to pick it,
 * then set the value in the same popover (range with distribution, or a value list). Typing a condition
 * such as `qual > 100` offers to set it in one go. Everything stays a draft until Apply.
 */
/** Rank a column against what was typed: prefix beats word start beats substring beats scattered letters. 0 = no match. */
function score(name, group, kind, q) {
  if (!q) return 1;
  const n = name.toLowerCase();
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  if (n.split(/[_\-.\s]+/).some((w) => w.startsWith(q))) return 60;
  if (n.includes(q)) return 40;
  if ((group + ' ' + kind).toLowerCase().includes(q)) return 20;
  let i = 0;
  for (const ch of n) if (ch === q[i]) i += 1;
  return i === q.length && q.length > 2 ? 10 : 0;
}

/**
 * The primary way into filtering: a pill that opens a command box. Type to find a column, Enter to pick it,
 * then set the value in the same popover (range with distribution, or a value list). Typing a condition
 * such as `qual > 100` offers to set it in one go. Everything stays a draft until Apply.
 *
 * The list is hand-rolled (not cmdk) on purpose: it marks the active row with `data-highlighted`, so the shared
 * sliding highlight pill glides between rows for both the keyboard and the pointer.
 */
export default function AddFilterCommand({ open, onOpenChange, columns, renderEditor, onQuickSet, disabled }) {
  const [query, setQuery] = useState('');
  const [col, setCol] = useState(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const uid = useId();
  const phone = usePhone();

  useEffect(() => {
    if (!open) { setQuery(''); setCol(null); setActive(0); }
  }, [open]);

  const quick = useMemo(() => parseQuick(query, columns), [query, columns]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const scored = columns
      .map((c, i) => ({ c, i, sc: quick ? 0 : score(c.name, c.group, c.kind, q) }))
      .filter((x) => x.sc > 0);
    if (q) scored.sort((a, b) => b.sc - a.sc || a.i - b.i);
    const out = [];
    if (quick) out.push({ type: 'quick', id: 'quick', quick });
    if (q) {
      // A search is one ranked list, so the best match is on top whatever its group.
      for (const x of scored) out.push({ type: 'col', id: `col-${x.c.name}`, c: x.c, group: x.c.group });
    } else {
      const by = new Map();
      for (const x of scored) {
        if (!by.has(x.c.group)) by.set(x.c.group, []);
        by.get(x.c.group).push(x);
      }
      for (const [group, list] of by) {
        out.push({ type: 'head', id: `h-${group}`, label: group });
        for (const x of list) out.push({ type: 'col', id: `col-${x.c.name}`, c: x.c, group });
      }
    }
    return out;
  }, [columns, query, quick]);
  const options = useMemo(() => rows.filter((r) => r.type !== 'head'), [rows]);
  const at = Math.min(active, Math.max(0, options.length - 1));
  const activeId = options[at]?.id;
  const picked = col ? columns.find((c) => c.name === col) : null;

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    if (!activeId) return;
    listRef.current?.querySelector(`[data-opt="${CSS.escape(activeId)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const choose = (o) => {
    if (!o) return;
    if (o.type === 'quick') { onQuickSet(o.quick.col.name, o.quick.spec); onOpenChange(false); return; }
    setCol(o.c.name);
  };
  const onInputKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (options.length ? (Math.min(a, options.length - 1) + 1) % options.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (options.length ? (Math.min(a, options.length - 1) - 1 + options.length) % options.length : 0)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(Math.max(0, options.length - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(options[at]); }
  };

  const triggerClass =
    'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-[hsl(var(--brand-300))] bg-transparent pl-2 pr-1.5 text-[12.5px] font-medium text-[hsl(var(--brand-700))] outline-none transition-colors duration-150 hover:border-solid hover:bg-[hsl(var(--brand-50))] aria-expanded:border-solid aria-expanded:bg-[hsl(var(--brand-100))] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:pl-3 [@media(pointer:coarse)]:pr-3.5 [@media(pointer:coarse)]:text-[14px]';
  const triggerInner = (
    <>
      <Plus aria-hidden className="size-3.5" />
      Add filter
      <kbd aria-hidden className="ov-kbd !ml-0.5 max-md:hidden">/</kbd>
    </>
  );

  // The same two views serve the desktop popover and the phone sheet; `sheet` only changes sizes.
  const listView = (sheet) => (
    <div className={cn('flex flex-col', sheet && 'min-h-0 flex-1')}>
      <div className={cn('flex items-center gap-2 border-b border-[hsl(var(--wb-line))] px-3 transition-colors duration-150 focus-within:border-[hsl(var(--brand-500))]', sheet && 'border-t')}>
        <Search aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${uid}-list`}
          aria-activedescendant={activeId ? `${uid}-${activeId}` : undefined}
          aria-label="Find a column"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="Find a column, or type qual > 100"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="none"
          enterKeyHint="go"
          className={cn('min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-none', sheet ? 'h-12 text-[16px]' : 'h-11 text-[13px]')}
        />
      </div>
      <div
        id={`${uid}-list`}
        ref={listRef}
        role="listbox"
        aria-label="Columns"
        className={cn('relative overflow-y-auto overscroll-contain p-1.5', sheet ? 'min-h-0 flex-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]' : 'max-h-[min(22rem,52vh)]')}
      >
        <HighlightPill />
        {options.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">No column matches “{query.trim()}”.</p>
        ) : null}
        {rows.map((r) => {
          if (r.type === 'head') return <p key={r.id} role="presentation" className="ov-label !px-3 !pb-1 !pt-2">{r.label}</p>;
          const on = r.id === activeId;
          if (r.type === 'quick') {
            return (
              <div
                key={r.id}
                id={`${uid}-${r.id}`}
                data-opt={r.id}
                role="option"
                aria-selected={on}
                data-highlighted={on ? '' : undefined}
                onPointerMove={() => setActive(options.indexOf(r))}
                onClick={() => choose(r)}
                className={cn('ov-item', sheet && '!min-h-12')}
              >
                <CornerDownLeft aria-hidden />
                <span className="min-w-0 flex-1 truncate tabular-nums">Set <span className="font-medium">{r.quick.label}</span></span>
                <kbd className="ov-kbd max-md:hidden">Enter</kbd>
              </div>
            );
          }
          return (
            <div
              key={r.id}
              id={`${uid}-${r.id}`}
              data-opt={r.id}
              role="option"
              aria-selected={on}
              data-highlighted={on ? '' : undefined}
              onPointerMove={() => setActive(options.indexOf(r))}
              onClick={() => choose(r)}
              className={cn('ov-item', sheet && '!min-h-12 !text-[15px]')}
            >
              <KindGlyph kind={r.c.kind} />
              <span className={cn('min-w-0 flex-1 truncate', r.c.active && 'font-medium')}>
                {r.c.name}
                {query.trim() ? <span className="ml-2 text-[12px] font-normal text-muted-foreground">{r.group}</span> : null}
              </span>
              {r.c.active ? <span role="img" aria-label="Filter set" className="size-1.5 shrink-0 rounded-full bg-[hsl(var(--brand-500))]" /> : null}
              {r.c.hint ? <span className={cn('shrink-0 truncate text-[12px] tabular-nums text-muted-foreground', sheet ? 'max-w-[7rem]' : 'max-w-[9rem]')}>{r.c.hint}</span> : null}
            </div>
          );
        })}
      </div>
      {!sheet && (
        <div className="flex items-center gap-3 border-t border-[hsl(var(--wb-line))] px-3 py-2 text-[12px] text-muted-foreground max-md:hidden">
          <span className="inline-flex items-center gap-1"><kbd className="ov-kbd !ml-0">↑</kbd><kbd className="ov-kbd !ml-0">↓</kbd> move</span>
          <span className="inline-flex items-center gap-1"><kbd className="ov-kbd !ml-0">Enter</kbd> choose</span>
          <span className="inline-flex items-center gap-1"><kbd className="ov-kbd !ml-0">Esc</kbd> close</span>
        </div>
      )}
    </div>
  );

  const editorView = (sheet) => (
    <div className={cn(sheet && 'flex min-h-0 flex-1 flex-col')}>
      {!sheet && (
        <div className="flex items-center gap-2 border-b border-[hsl(var(--wb-line))] px-2.5 py-2">
          <button
            type="button"
            onClick={() => setCol(null)}
            aria-label="Back to all columns"
            title="Back to all columns"
            className="wb-iconbtn !size-7 outline-none [@media(pointer:coarse)]:!size-10"
          >
            <ArrowLeft aria-hidden className="size-3.5" />
          </button>
          <KindGlyph kind={picked.kind} className="text-[hsl(var(--brand-700))]" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{picked.name}</span>
          <span className="shrink-0 text-[12px] text-muted-foreground">{picked.group}</span>
        </div>
      )}
      <div className={cn('overflow-y-auto overflow-x-hidden overscroll-contain p-3', sheet ? 'min-h-0 flex-1 border-t border-[hsl(var(--wb-line))] px-4 py-4' : 'max-h-[min(26rem,60vh)]')}>{renderEditor(picked.name)}</div>
      <div className={cn('flex items-center justify-between gap-2 border-t border-[hsl(var(--wb-line))] px-3 py-2', sheet && 'px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3')}>
        <span className="text-[12px] text-muted-foreground">Changes stay drafts until you press Apply.</span>
        <Button type="button" size="sm" onClick={() => onOpenChange(false)} className={cn('[@media(pointer:coarse)]:!h-10 [@media(pointer:coarse)]:!px-5', sheet && '!h-11 shrink-0 !px-6 !text-[14px]')}>Done</Button>
      </div>
    </div>
  );

  if (phone) {
    return (
      <>
        <button type="button" disabled={disabled} onClick={() => onOpenChange(true)} aria-haspopup="dialog" aria-expanded={open} className={triggerClass}>
          {triggerInner}
        </button>
        <BottomSheet
          open={open}
          onOpenChange={onOpenChange}
          title={picked ? picked.name : 'Add filter'}
          initialFocus={false}
          leading={picked ? (
            <button type="button" onClick={() => setCol(null)} aria-label="Back to all columns" className="wb-iconbtn !size-11 shrink-0 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--ring))]">
              <ArrowLeft aria-hidden className="size-[18px]" />
            </button>
          ) : null}
          trailing={picked ? <span className="shrink-0 text-[12px] text-muted-foreground">{picked.group}</span> : null}
        >
          {picked ? editorView(true) : listView(true)}
        </BottomSheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger disabled={disabled} aria-keyshortcuts="/" render={<button type="button" className={triggerClass} />}>
        {triggerInner}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        initialFocus={picked ? undefined : inputRef}
        className="w-[min(25rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0"
      >
        {picked ? editorView(false) : listView(false)}
      </PopoverContent>
    </Popover>
  );
}
