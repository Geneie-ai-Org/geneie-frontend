import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import DocumentViewerDialog from '@/components/workspace/DocumentViewerDialog';
import { fetchModule1QcSummary } from '@/services/backendApi';
import { CountUp, StageMark } from '@/components/motion';
import { QcErrorNotice, QcHeading, QcSkeleton, QcStatusPill, qcSurfaceClass } from '@/components/Module1QcPanel';
import { Histogram, LineChart } from '@/components/qc/QcCharts';
import {
  GUIDE, OVERALL_LABEL, filterSegments, fmtCompact, fmtInt, fmtPct,
  frameRange, gradeDup, gradeKept, gradeQ30, overallGrade,
} from '@/lib/qcSummary';

/**
 * Native read-quality view for a Module 1 run, drawn from the numbers fastp already computed
 * (fastp JSON, served by /api/module1/qc-summary; live files, or the copy kept after the purge).
 * The raw fastp / MultiQC reports stay one click away in the Reports block below.
 */

const SEGMENT_TONE = {
  passed: 'hsl(var(--brand-500))',
  low_quality: 'var(--warning)',
  too_many_n: 'var(--error)',
  too_short: 'hsl(var(--brand-300))',
  too_long: 'hsl(var(--muted-foreground))',
};

const BASE_STYLE = {
  A: { color: 'hsl(var(--brand-700))', dash: null },
  T: { color: 'hsl(var(--brand-500))', dash: '6 3' },
  C: { color: 'hsl(var(--foreground) / 0.7)', dash: '1.5 3' },
  G: { color: 'hsl(var(--muted-foreground))', dash: '8 3 2 3' },
};

function Stat({ label, children, sub, grade, title }) {
  return (
    <div className="wb-rise min-w-0 rounded-2xl border border-[hsl(var(--wb-line))] bg-[hsl(var(--brand-50)/0.55)] p-3" title={title}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p className="m-0 text-[11.5px] font-medium text-muted-foreground">{label}</p>
        {grade ? <QcStatusPill status={grade} /> : null}
      </div>
      <p className="m-0 mt-1 text-[22px] font-semibold leading-none tracking-tight text-foreground tabular-nums">{children}</p>
      {sub ? <p className="m-0 mt-1.5 truncate text-[11.5px] text-muted-foreground tabular-nums">{sub}</p> : null}
    </div>
  );
}

function FilterBar({ filtering }) {
  const { total, segments } = useMemo(() => filterSegments(filtering), [filtering]);
  if (!total) return null;
  const shown = segments.filter((s) => s.value > 0);
  return (
    <div className="min-w-0">
      <p className="m-0 mb-1.5 text-[12px] font-medium text-foreground">What happened to each read pair</p>
      <div
        role="img"
        aria-label={shown.map((s) => `${s.label} ${fmtInt(s.value)} (${fmtPct(s.share)})`).join(', ')}
        className="flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-[hsl(var(--wb-line))]"
      >
        {shown.map((s) => (
          <span key={s.key} style={{ flex: `${Math.max(s.share, 0.004)} 1 0`, background: SEGMENT_TONE[s.key] }} />
        ))}
      </div>
      <ul className="m-0 mt-2 grid list-none grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-x-4 gap-y-1 p-0 text-[12px]">
        {segments.map((s) => (
          <li key={s.key} className={`flex items-center gap-1.5 ${s.value ? 'text-foreground' : 'text-muted-foreground/70'}`}>
            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: SEGMENT_TONE[s.key], opacity: s.value ? 1 : 0.35 }} />
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            <span className="tabular-nums">{fmtInt(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReadToggle({ value, onChange, paired }) {
  if (!paired) return null;
  return (
    <div role="group" aria-label="Read" className="flex shrink-0 gap-1">
      {['r1', 'r2'].map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className="wb-chip cursor-pointer outline-none transition-colors hover:!border-[hsl(var(--brand-300))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] aria-pressed:!border-[hsl(var(--brand-200))] aria-pressed:!bg-[hsl(var(--brand-100))] aria-pressed:text-[hsl(var(--brand-700))] [@media(pointer:coarse)]:!h-9"
        >
          {k === 'r1' ? 'Read 1' : 'Read 2'}
        </button>
      ))}
    </div>
  );
}

function ChartBlock({ title, hint, trailing, children, className = '' }) {
  return (
    <div className={`min-w-0 rounded-2xl border border-[hsl(var(--wb-line))] p-3 ${className}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="m-0 text-[12.5px] font-semibold text-foreground">{title}</p>
          {hint ? <p className="m-0 mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{hint}</p> : null}
        </div>
        {trailing}
      </div>
      {children}
    </div>
  );
}

function SummaryBody({ data, wide = false }) {
  const s = data.summary;
  const [read, setRead] = useState('r1');
  const rs = s.reads?.[read] || s.reads?.r1 || {};
  const kept = s.pass_rate;
  const q30 = s.after?.q30_rate ?? s.before?.q30_rate;
  const grades = [gradeQ30(q30), gradeKept(kept), gradeDup(s.duplication_rate)];
  const overall = overallGrade(grades);

  const qualitySeries = [
    rs.before?.quality && { key: 'b', label: 'Before filtering', values: rs.before.quality, color: 'hsl(var(--muted-foreground))', dash: '5 3', width: 1.6 },
    rs.after?.quality && { key: 'a', label: 'After filtering', values: rs.after.quality, color: 'hsl(var(--brand-500))', width: 2.2 },
  ].filter(Boolean);
  const contentStage = rs.after?.content && Object.keys(rs.after.content).length ? rs.after : rs.before;
  const contentSeries = ['A', 'T', 'C', 'G'].map((b) => contentStage?.content?.[b] && {
    key: b, label: b, values: contentStage.content[b].map((v) => v * 100), color: BASE_STYLE[b].color, dash: BASE_STYLE[b].dash,
  }).filter(Boolean);
  const contentRange = frameRange(contentSeries.map((c) => c.values), { lo: 0, hi: 100, pad: 3, minSpan: 12 });
  const over = [...(s.reads?.r1?.before?.overrepresented || []), ...(s.reads?.r2?.before?.overrepresented || [])];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
        {overall && (
          <QcStatusPill status={overall} label={OVERALL_LABEL[overall]} />
        )}
        <span className="min-w-0 truncate">
          {[s.sequencing, s.fastp_version ? `fastp ${s.fastp_version}` : null].filter(Boolean).join(' · ')}
        </span>
        {data.source === 'report' && <span className="wb-chip" data-tone="brand">Saved summary</span>}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2">
        <Stat label="Reads kept" grade={grades[1]} sub={s.before?.reads != null ? `${fmtCompact(s.after?.reads)} of ${fmtCompact(s.before.reads)}` : null}
          title={`Guide: ${fmtPct(GUIDE.kept.pass, 0)} or more kept is good`}>
          {fmtPct(kept)}
        </Stat>
        <Stat label="Q30 bases" grade={grades[0]} sub={s.after && s.before ? `${fmtPct(s.before.q30_rate)} before filtering` : null}
          title={`Guide: ${fmtPct(GUIDE.q30.pass, 0)} or more is strong, ${fmtPct(GUIDE.q30.warn, 0)} or more acceptable`}>
          {fmtPct(q30)}
        </Stat>
        <Stat label="Duplication" grade={grades[2]} sub="estimated from reads"
          title={`Guide: up to ${fmtPct(GUIDE.dup.pass, 0)} is good`}>
          {fmtPct(s.duplication_rate)}
        </Stat>
        <Stat label="GC content" sub={s.before?.gc_content != null && s.after ? `${fmtPct(s.before.gc_content)} before` : null}>
          {fmtPct(s.after?.gc_content ?? s.before?.gc_content)}
        </Stat>
        <Stat label="Reads in" sub={s.before?.bases != null ? `${fmtCompact(s.before.bases)} bases` : null}>
          {s.before?.reads != null ? <CountUp value={s.before.reads} startAt={0} duration={0.8} /> : '–'}
        </Stat>
        {s.adapter?.trimmed_reads != null && (
          <Stat label="Adapter trimmed" sub={s.adapter.trimmed_bases != null ? `${fmtCompact(s.adapter.trimmed_bases)} bases cut` : null}>
            {fmtInt(s.adapter.trimmed_reads)}
          </Stat>
        )}
      </div>

      <FilterBar filtering={s.filtering} />

      <div className={wide ? 'grid gap-3 lg:grid-cols-2' : 'space-y-3'}>
      {qualitySeries.length > 0 && (
        <ChartBlock
          title="Base quality along the read"
          hint="Mean Phred score per position. Above 30 is excellent; quality usually falls toward the 3' end. Drag to zoom, drag the strip to slide."
          trailing={<ReadToggle value={read} onChange={setRead} paired={s.paired && Boolean(s.reads?.r2)} />}
        >
          <LineChart
            series={qualitySeries}
            yMin={0}
            yMax={42}
            refs={[{ y: 30, label: 'Q30' }, { y: 20, label: 'Q20' }]}
            yFormat={(v) => v.toFixed(1)}
            ariaLabel={`Mean base quality by position, ${read === 'r2' ? 'read 2' : 'read 1'}, before and after filtering`}
          />
        </ChartBlock>
      )}

      {contentSeries.length > 0 && (
        <ChartBlock
          title="Base composition"
          hint="Share of A, T, C and G at each position. The lines should run flat and roughly parallel; a swing at the start often points to adapter or library-prep bias."
          trailing={<ReadToggle value={read} onChange={setRead} paired={s.paired && Boolean(s.reads?.r2)} />}
        >
          <LineChart
            series={contentSeries}
            yMin={contentRange.min}
            yMax={contentRange.max}
            yFormat={(v) => `${v.toFixed(1)}%`}
            ariaLabel={`Base composition by position, ${read === 'r2' ? 'read 2' : 'read 1'}, after filtering`}
          />
        </ChartBlock>
      )}

      {s.insert_size?.histogram?.length > 1 && (
        <ChartBlock className={wide ? 'lg:col-span-2' : ''} title="Insert size" hint="How long the original DNA fragments were. One clear peak is what you want.">
          <Histogram
            values={s.insert_size.histogram}
            peak={s.insert_size.peak}
            ariaLabel={`Insert size histogram${s.insert_size.peak != null ? `, peak at ${s.insert_size.peak} base pairs` : ''}`}
          />
        </ChartBlock>
      )}
      </div>

      {over.length > 0 && (
        <div className="min-w-0">
          <p className="m-0 mb-1.5 text-[12px] font-medium text-foreground">Over-represented sequences</p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {over.slice(0, 5).map((o) => (
              <li key={o.sequence} className="flex items-center gap-2 text-[12px]">
                <span className="min-w-0 flex-1 truncate font-mono text-foreground" title={o.sequence}>{o.sequence}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{fmtInt(o.count)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="m-0 text-[11px] leading-snug text-muted-foreground">
        Grades are a rule of thumb, not a pass/fail verdict: your own thresholds and the assay decide what is acceptable.
      </p>
    </div>
  );
}

/** Read-quality summary. Renders nothing when this run has no fastp numbers (the Reports block still shows). */
export default function Module1QcSummary({ conversationId, enabled = true, surface = false, onResolved }) {
  const [state, setState] = useState({ status: 'idle', data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!conversationId || !enabled) return undefined;
    let cancelled = false;
    setState((p) => ({ status: 'loading', data: p.data, error: null }));
    fetchModule1QcSummary(conversationId)
      .then((data) => { if (!cancelled) setState({ status: 'done', data, error: null }); })
      .catch((err) => { if (!cancelled) setState((p) => ({ status: 'error', data: p.data, error: err?.message || 'Could not load the QC summary.' })); });
    return () => { cancelled = true; };
  }, [conversationId, enabled, attempt]);

  const { status, data, error } = state;
  const has = Boolean(data?.has_summary && data.summary);
  useEffect(() => { onResolved?.(has); }, [has, onResolved]);
  if (!enabled || !conversationId) return null;
  if (status === 'done' && !has) return null;

  return (
    <section className={`space-y-2.5 ${qcSurfaceClass(surface)}`} aria-label="Read quality summary" aria-busy={status === 'loading' || undefined}>
      <QcHeading
        title="Read quality"
        hint="Computed by fastp before alignment."
        trailing={status === 'loading' ? <StageMark state="running" size={16} className="shrink-0" /> : has ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Open read quality full screen"
            className="wb-chip shrink-0 cursor-pointer gap-1.5 outline-none transition-colors hover:!border-[hsl(var(--brand-300))] hover:!bg-[hsl(var(--brand-50))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] [@media(pointer:coarse)]:!h-9"
          >
            <Maximize2 className="size-3" aria-hidden />
            Full screen
          </button>
        ) : null}
      />
      {status === 'loading' && !has && <QcSkeleton rows={3} />}
      {status === 'error' && !has && <QcErrorNotice message={error} onRetry={retry} />}
      {has && <SummaryBody data={data} />}
      {has && (
        <DocumentViewerDialog
          open={expanded}
          onOpenChange={setExpanded}
          title="Read quality"
          description={[data.sample_name, data.summary.sequencing].filter(Boolean).join(' · ') || 'Computed by fastp before alignment'}
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[hsl(var(--wb-bg))] p-4 md:p-6">
            <div className="mx-auto w-full max-w-[1280px]"><SummaryBody data={data} wide /></div>
          </div>
        </DocumentViewerDialog>
      )}
    </section>
  );
}
