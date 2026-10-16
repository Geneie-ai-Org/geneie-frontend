import React from 'react';
import { Check, Minus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CountUp } from '@/components/motion';
import { cn } from '@/lib/utils';
import { ClassPill, StackedBar } from '@/components/tabs/ClassPill';
import { ModePill } from '@/components/tabs/ModeParts';

/**
 * ACMG mode of the Variants sidebar. Everything shown is what the filter really does:
 * a variant is kept when (ClinVar OR InterVar says Pathogenic / Likely pathogenic) AND
 * (gnomAD genome AF is below 1%, or the frequency is missing). The preview API only returns
 * a total match count, so the distribution bar is kept vs left out, never per class.
 */

function Group({ title, kept, children }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex w-[4.5rem] shrink-0 items-center gap-1 text-[12px] font-medium text-muted-foreground">
        {kept ? <Check aria-hidden className="size-3" /> : <Minus aria-hidden className="size-3" />}
        {title}
      </span>
      {children}
    </div>
  );
}

function FreqPill({ kept = true, children }) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium',
        kept
          ? 'border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-700))]'
          : 'border-dashed border-[hsl(var(--wb-line-strong))] text-muted-foreground'
      )}
    >
      {kept ? <Check aria-hidden className="size-3" /> : <Minus aria-hidden className="size-3" />}
      {children}
    </span>
  );
}

function Requirement({ ok, title, detail, action, chips }) {
  return (
    <li className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border',
          ok
            ? 'border-[hsl(var(--brand-500))] bg-[hsl(var(--brand-500))] text-[hsl(var(--wb-card))]'
            : 'border-dashed border-[hsl(var(--wb-line-strong))] text-muted-foreground'
        )}
      >
        {ok ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-[13px] leading-5 text-foreground">
          <span className="font-medium">{title}</span>
          <span className="sr-only">{ok ? ' (met)' : ' (not met)'}</span>
        </p>
        {detail ? <p className="text-[12px] leading-snug text-muted-foreground">{detail}</p> : null}
        {chips?.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Missing columns">
            {chips.map((c) => (
              <li key={c} className="inline-flex h-5 items-center rounded-full border border-[hsl(var(--wb-line-strong))] px-2 font-mono text-[11px] text-foreground">{c}</li>
            ))}
          </ul>
        ) : null}
        {action}
      </div>
    </li>
  );
}

export default function AcmgModePanel({
  status, // { tone, word, detail }
  active,
  canApply,
  manualBlocked,
  onResetManual,
  resetDisabled,
  quotaBlocked,
  quotaReason,
  meterLabel,
  annotationAction, // node: the "Run annotation" button, or null
  preview, // filter_1 from /preview-proprietary-filters
  total,
  kept, // the live in-scope count (used when the filter is active)
}) {
  const hasPreview = preview && preview.can_apply !== false && preview.preview_pending !== true && Number.isFinite(Number(preview.preview_count)) && Number(preview.total_count) > 0;
  // The API mixes real column names with a sentence ("annotated variants (run ANNOVAR first)").
  // Only real names become chips; the tool name never shows, the UI says "annotation".
  const missingAll = (Array.isArray(preview?.missing_columns) ? preview.missing_columns : []).map((m) => String(m || '').trim()).filter(Boolean);
  const missingCols = missingAll.filter((m) => !/[()]/.test(m));
  const missingNote = missingAll.some((m) => /[()]/.test(m));
  const yieldKept = active ? Number(kept) : hasPreview ? Number(preview.preview_count) : null;
  const yieldTotal = active ? Number(total) : hasPreview ? Number(preview.total_count) : Number(total);
  const showYield = yieldKept != null && Number.isFinite(yieldKept) && yieldTotal > 0;
  const out = showYield ? Math.max(0, yieldTotal - yieldKept) : 0;
  const pending = !active && preview?.preview_pending === true;

  return (
    <div className="space-y-3">
      <section className="wb-card p-4" aria-label="What the ACMG filter keeps">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="m-0 text-[14px] font-semibold text-foreground">What it keeps</h3>
            <p className="m-0 mt-0.5 text-[12px] leading-snug text-muted-foreground">A variant stays when both rows below hold.</p>
          </div>
          <ModePill tone={status.tone}>{status.word}</ModePill>
        </div>

        <div className="mt-3.5 space-y-3">
          <div className="space-y-2 rounded-2xl border border-[hsl(var(--wb-line))] p-3">
            <p className="m-0 flex items-baseline justify-between gap-2 text-[12px] text-muted-foreground">
              <span className="font-medium text-foreground">Clinical class</span>
              <span>ClinVar or InterVar</span>
            </p>
            <Group title="Kept" kept>
              <ClassPill k="pathogenic" size="sm" />
              <ClassPill k="likely_pathogenic" size="sm" />
            </Group>
            <Group title="Left out">
              <ClassPill k="vus" size="sm" kept={false} />
              <ClassPill k="likely_benign" size="sm" kept={false} />
              <ClassPill k="benign" size="sm" kept={false} />
            </Group>
          </div>

          <div className="flex items-center gap-2" aria-hidden>
            <span className="h-px flex-1 bg-[hsl(var(--wb-line))]" />
            <span className="rounded-full border border-[hsl(var(--wb-line))] px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">and</span>
            <span className="h-px flex-1 bg-[hsl(var(--wb-line))]" />
          </div>
          <p className="sr-only">and</p>

          <div className="space-y-2 rounded-2xl border border-[hsl(var(--wb-line))] p-3">
            <p className="m-0 flex items-baseline justify-between gap-2 text-[12px] text-muted-foreground">
              <span className="font-medium text-foreground">Frequency</span>
              <span>gnomAD genome AF</span>
            </p>
            <Group title="Kept" kept>
              <FreqPill>Below 1%</FreqPill>
              <FreqPill>Not reported</FreqPill>
            </Group>
            <Group title="Left out">
              <FreqPill kept={false}>1% or more</FreqPill>
            </Group>
          </div>
        </div>
      </section>

      {/* The yield: what the filter did, or what it would do. */}
      <section className="wb-card p-4" aria-label="ACMG filter result">
        {showYield ? (
          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="m-0 flex min-w-0 flex-wrap items-baseline gap-x-2 tabular-nums">
                <span className="text-[24px] font-semibold leading-none text-foreground"><CountUp value={yieldKept} /></span>
                <span className="text-[13px] text-muted-foreground">of {yieldTotal.toLocaleString()} {active ? 'kept' : 'would be kept'}</span>
              </p>
              {!active ? <span className="wb-chip shrink-0">Preview</span> : null}
            </div>
            <StackedBar
              height={10}
              segments={[
                { key: 'kept', label: 'Kept', value: yieldKept, fill: 'hsl(var(--brand-500))' },
                { key: 'out', label: 'Left out', value: out, fill: 'hsl(var(--wb-line-strong))', hatch: true },
              ]}
              summary={`${yieldKept.toLocaleString()} kept, ${out.toLocaleString()} left out, of ${yieldTotal.toLocaleString()} variants`}
            />
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] tabular-nums text-muted-foreground">
              <li className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2 rounded-full bg-[hsl(var(--brand-500))]" />
                <span className="font-medium text-foreground">{yieldKept.toLocaleString()}</span> kept
              </li>
              <li className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2 rounded-full border border-[hsl(var(--wb-line-strong))]" style={{ background: 'repeating-linear-gradient(135deg, hsl(var(--wb-line-strong)) 0 2px, transparent 2px 4px)' }} />
                <span className="font-medium text-foreground">{out.toLocaleString()}</span> left out
              </li>
            </ul>
          </div>
        ) : pending ? (
          <div className="space-y-2" role="status" aria-busy="true" aria-label="Counting matches">
            <Skeleton className="h-6 w-40 rounded-full" />
            <Skeleton className="h-2.5 w-full rounded-full" />
            <p className="m-0 text-[12px] text-muted-foreground">The match count appears after you apply.</p>
          </div>
        ) : (
          <p className="m-0 text-[13px] leading-5 text-muted-foreground">
            The match count appears here once the file is annotated.
          </p>
        )}
      </section>

      {!active ? (
        <section className="wb-card p-4" aria-label="ACMG requirements">
          <h3 className="m-0 mb-2.5 text-[13px] font-semibold text-foreground">Before you apply</h3>
          <ul className="m-0 list-none divide-y divide-[hsl(var(--wb-line))] p-0">
            <Requirement
              ok={canApply}
              title="Annotated with ClinVar or InterVar and gnomAD"
              detail={canApply ? null : missingNote && missingCols.length === 0 ? 'There are no annotated variants yet. Run annotation first, then come back to apply the filter.' : 'Run annotation first, then come back to apply the filter.'}
              chips={canApply ? null : missingCols}
              action={canApply ? null : annotationAction}
            />
            <Requirement
              ok={!manualBlocked}
              title="No manual filters active"
              detail={manualBlocked ? 'The ACMG filter and manual filters cannot run together.' : null}
              action={manualBlocked ? (
                <Button type="button" variant="outline" size="sm" onClick={onResetManual} disabled={resetDisabled} className="h-8 max-md:h-11 text-[13px]">
                  <RotateCcw aria-hidden />
                  Reset manual filters
                </Button>
              ) : null}
            />
            <Requirement
              ok={!quotaBlocked}
              title="A filter run is available"
              detail={quotaBlocked ? quotaReason : meterLabel}
              action={null}
            />
          </ul>
        </section>
      ) : (
        <p className="m-0 px-1 text-[12px] leading-snug text-muted-foreground">{status.detail}</p>
      )}
    </div>
  );
}
