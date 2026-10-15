/**
 * Searchable, vendor-grouped picker for the Module 1 capture-BED catalog.
 *
 * The catalog endpoint returns a flat list ({ id, label, genome, filename }) that can repeat a
 * panel under the same name. This keeps the first entry for each name, groups what is left by
 * vendor (Twist, Agilent SureSelect, ...) and lets the user type to filter. Selection still
 * reports the catalog item's own `id`, so the submit payload is unchanged.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const VENDORS = [
  ['Twist', /twist/i],
  ['Agilent SureSelect', /sure\s*-?select|agilent|\bsseq\b|\bss[_-]?(v\d|human|clinical)/i],
  ['IDT xGen', /\bidt\b|xgen/i],
  ['Illumina', /illumina|truseq|nextera|\btso\b|dna\s*prep/i],
  ['Roche', /roche|nimblegen|seqcap|kapa|hyperexome/i],
];
const OTHER = 'Other';

export function vendorForBed(item) {
  const haystack = `${item?.label || ''} ${item?.filename || ''}`;
  for (const [name, re] of VENDORS) if (re.test(haystack)) return name;
  return OTHER;
}

const normalize = (text) => String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Items -> { groups: [{ vendor, items }], hidden } with identical names collapsed to the first. */
export function groupBedCatalog(items) {
  const seen = new Set();
  const unique = [];
  for (const item of items || []) {
    if (!item?.id) continue;
    const key = normalize(item.label || item.filename || item.id);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...item, vendor: vendorForBed(item), name: item.label || item.filename || item.id });
  }
  const byVendor = new Map();
  for (const item of unique) {
    if (!byVendor.has(item.vendor)) byVendor.set(item.vendor, []);
    byVendor.get(item.vendor).push(item);
  }
  const order = [...VENDORS.map(([name]) => name), OTHER];
  const groups = order
    .filter((vendor) => byVendor.has(vendor))
    .map((vendor) => ({
      vendor,
      items: byVendor.get(vendor).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    }));
  return { groups, total: unique.length, hidden: (items || []).length - unique.length };
}

export default function Module1BedPicker({
  items,
  value,
  onChange,
  loading = false,
  ready = true,
  error = false,
  id,
  onTouched,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef(null);
  const { groups, total, hidden } = useMemo(() => groupBedCatalog(items), [items]);

  const q = normalize(query);
  const filteredGroups = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          items: q
            ? g.items.filter((i) => normalize(`${i.name} ${i.filename} ${g.vendor}`).includes(q))
            : g.items,
        }))
        .filter((g) => g.items.length > 0),
    [groups, q]
  );
  const flat = useMemo(() => filteredGroups.flatMap((g) => g.items), [filteredGroups]);
  const selected = useMemo(() => groups.flatMap((g) => g.items).find((i) => i.id === value) || null, [groups, value]);

  useEffect(() => {
    setActive(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (item) => {
    onChange(item.id);
    setOpen(false);
    setQuery('');
  };

  const placeholder = loading
    ? 'Loading panels…'
    : !ready
      ? 'No catalog available for this genome'
      : 'Choose a capture panel';
  const disabled = loading || !ready || total === 0;

  return (
    <Popover
      open={open && !disabled}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) onTouched?.();
      }}
    >
      <PopoverTrigger
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-invalid={error || undefined}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-[var(--bg-input)] px-3 text-left text-sm outline-none transition-colors hover:border-[var(--border-strong)] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60',
          error ? 'border-[var(--error)]' : 'border-border'
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate', selected ? 'text-foreground' : 'text-muted-foreground')}>
          {selected ? selected.name : placeholder}
        </span>
        {selected ? (
          <span className="hidden shrink-0 text-2xs text-muted-foreground sm:inline">{selected.vendor}</span>
        ) : null}
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--anchor-width)] min-w-64 gap-0 p-0">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(flat.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (flat[active]) choose(flat[active]);
              }
            }}
            placeholder="Search panels, e.g. Twist or v8"
            aria-label="Search capture panels"
            role="combobox"
            aria-expanded="true"
            aria-controls={`${id || 'bed'}-list`}
            className="h-10 w-full border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground focus:!border-0 focus:!shadow-none focus:!outline-none focus:!ring-0 focus-visible:!ring-0"
          />
        </div>
        <div
          ref={listRef}
          id={`${id || 'bed'}-list`}
          role="listbox"
          aria-label="Capture panels"
          className="max-h-64 overflow-y-auto overscroll-contain py-1"
        >
          {flat.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No panel matches &ldquo;{query}&rdquo;.
            </p>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.vendor} role="group" aria-label={group.vendor}>
                <p className="px-3 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.vendor}
                </p>
                {group.items.map((item) => {
                  const index = flat.indexOf(item);
                  const isActive = index === active;
                  const isSelected = item.id === value;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      data-active={isActive}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => choose(item)}
                      className={cn(
                        'flex min-h-9 w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground outline-none',
                        isActive && 'bg-muted'
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{item.name}</span>
                        {item.filename && item.filename !== item.name ? (
                          <span className="block truncate font-mono text-2xs text-muted-foreground">{item.filename}</span>
                        ) : null}
                      </span>
                      {isSelected ? <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden /> : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <p className="border-t border-border px-3 py-1.5 text-2xs text-muted-foreground tabular-nums">
          {flat.length} of {total} panels{hidden > 0 ? ` · ${hidden} duplicate${hidden === 1 ? '' : 's'} hidden` : ''}
        </p>
      </PopoverContent>
    </Popover>
  );
}
