import React from 'react';
import { Bookmark, Check, RotateCcw, X } from 'lucide-react';
import { ChipList, CountUp, PopIn } from '@/components/motion';
import { KindGlyph } from './AddFilterCommand';
import { cn } from '@/lib/utils';

const FOCUS = 'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[hsl(var(--ring))]';

/** A removable filter pill. The body edits the filter, the X removes it; both are real buttons. */
function FilterPill({ chip, onEdit, onRemove, disabled }) {
  return (
    <PopIn
      className={cn(
        'inline-flex h-7 max-w-full items-center rounded-full border pr-1 text-[12.5px] transition-colors duration-200 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:text-[13.5px]',
        chip.pending
          ? 'border-dashed border-[var(--warning)] bg-[hsl(var(--wb-card))] text-foreground'
          : 'border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-700))]'
      )}
      title={chip.pending ? `${chip.col}: ${chip.label} (not applied yet)` : `${chip.col}: ${chip.label}`}
    >
      <button
        type="button"
        onClick={() => onEdit(chip.col)}
        className={cn('inline-flex h-full min-w-0 items-center gap-1.5 rounded-full pl-2 pr-1.5 text-left [@media(pointer:coarse)]:pl-3', FOCUS)}
        aria-label={`Edit ${chip.col} filter`}
      >
        <KindGlyph kind={chip.kind} className="opacity-70" />
        <span className="truncate">
          <span className="font-medium">{chip.col}</span>
          <span className="tabular-nums"> {chip.label}</span>
          {chip.pending && <span className="sr-only"> (not applied yet)</span>}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onRemove(chip.col)}
        disabled={disabled}
        aria-label={`Remove ${chip.col} filter`}
        className={cn('inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[hsl(var(--brand-200))] hover:text-[hsl(var(--brand-700))] disabled:opacity-50 [@media(pointer:coarse)]:size-9', FOCUS)}
      >
        <X className="size-3" aria-hidden />
      </button>
    </PopIn>
  );
}

/**
 * The pinned filter bar: how many variants are in scope (rolling count), the active filters as pills, the
 * Add-filter command, and saved filters as one-click pills. Sits above the scrolling body so the count and
 * the pills are always visible while you work.
 */
export default function FilterBar({
  scopeCount,
  totalCount,
  filteredOut,
  scopePct,
  chips,
  proprietaryLabel,
  onEditChip,
  onRemoveChip,
  onRemoveProprietary,
  removeDisabled,
  proprietaryDisabled,
  onResetAll,
  resetDisabled,
  addFilter,
  saved,
  info,
  warning,
  notice,
}) {
  const hasAny = chips.length > 0 || !!proprietaryLabel;
  return (
    <section aria-label="Filter summary" className="wb-card tx tx--lattice p-3.5" style={{ '--tx-opacity': 0.4, '--tx-opacity-dark': 0.18, '--tx-at': '100% 0%', '--tx-fade': '55% 85%', '--tx-size': '16px 16px' }}>
      <div className="flex items-start justify-between gap-2">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 tabular-nums">
          <span className="text-[28px] font-semibold leading-none text-foreground"><CountUp value={scopeCount} /></span>
          <span className="text-[13px] text-muted-foreground">of {totalCount.toLocaleString()} variants in scope</span>
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          {filteredOut > 0 && <span className="wb-chip tabular-nums">{filteredOut.toLocaleString()} filtered out</span>}
          {hasAny && (
            <button
              type="button"
              onClick={onResetAll}
              disabled={resetDisabled}
              aria-label="Reset all filters"
              title="Reset all filters"
              className={cn('wb-iconbtn !size-7 disabled:opacity-50 [@media(pointer:coarse)]:!size-9', FOCUS)}
            >
              <RotateCcw aria-hidden className="size-3.5" />
            </button>
          )}
          {info}
        </div>
      </div>
      {totalCount > 0 && (
        <div
          role="progressbar"
          aria-label="Variants in scope after filters"
          aria-valuemin={0}
          aria-valuemax={totalCount}
          aria-valuenow={Math.max(0, Math.min(totalCount, scopeCount))}
          aria-valuetext={`${scopeCount.toLocaleString()} of ${totalCount.toLocaleString()} variants in scope`}
          className="wb-track mt-2.5"
        >
          <div className="wb-fill transition-[width] duration-300 ease-out motion-reduce:transition-none" style={{ width: `${scopePct}%` }} />
        </div>
      )}

      {warning}

      {/* Filter bar: pills, then the Add-filter command. The row stays mounted so the last pill can shrink out. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Active filters">
        {/* The command pill leads the row so it keeps its place as pills come and go. */}
        {addFilter}
        <ChipList>
          {proprietaryLabel && (
            <PopIn
              key="__proprietary"
              className="inline-flex h-7 max-w-full items-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] pl-3 pr-1 text-[12.5px] font-medium text-[hsl(var(--brand-700))] [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:text-[13.5px]"
            >
              <span className="truncate">{proprietaryLabel}</span>
              <button
                type="button"
                onClick={onRemoveProprietary}
                disabled={proprietaryDisabled}
                aria-label={`Remove ${proprietaryLabel}`}
                className={cn('ml-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[hsl(var(--brand-200))] hover:text-[hsl(var(--brand-700))] disabled:opacity-50 [@media(pointer:coarse)]:size-9', FOCUS)}
              >
                <X className="size-3" aria-hidden />
              </button>
            </PopIn>
          )}
          {chips.map((chip) => (
            <FilterPill key={chip.col} chip={chip} onEdit={onEditChip} onRemove={onRemoveChip} disabled={removeDisabled} />
          ))}
        </ChipList>
        {!hasAny && !addFilter && <span className="text-[12px] text-muted-foreground">No filters yet</span>}
      </div>

      {saved && saved.presets.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5" role="group" aria-label="Saved filters">
          <span className="mr-0.5 text-[12px] font-medium text-muted-foreground">Saved</span>
          {saved.presets.map((p) => {
            const on = saved.appliedId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                disabled={saved.disabled}
                onClick={() => (on ? saved.onDeactivate() : saved.onApply(p.id))}
                title={on ? `${p.name} is applied. Click to deactivate.` : `Apply ${p.name}`}
                className={cn(
                  'inline-flex h-7 max-w-[12rem] items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] [@media(pointer:coarse)]:px-3.5 [@media(pointer:coarse)]:text-[13.5px] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none [@media(pointer:coarse)]:h-9',
                  on
                    ? 'border-[hsl(var(--brand-300))] bg-[hsl(var(--brand-100))] font-medium text-[hsl(var(--brand-700))]'
                    : 'border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] text-foreground hover:border-[hsl(var(--brand-300))] hover:bg-[hsl(var(--brand-50))]',
                  FOCUS
                )}
              >
                {on || saved.busyId === p.id ? <Check aria-hidden className="size-3 shrink-0" /> : <Bookmark aria-hidden className="size-3 shrink-0 opacity-60" />}
                <span className="truncate">{saved.busyId === p.id ? 'Applying…' : p.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {notice}
    </section>
  );
}
