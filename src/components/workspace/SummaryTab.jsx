import React from 'react';
import { ArrowRight, ChevronRight, FileText, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePanelWidth } from '@/hooks/useWorkbenchWidth';
import { CountUp, StageMark, StateButton } from '@/components/motion';
import { PIPELINE_STEP_DEFS, computePipelineSteps, getPipelineBackgroundActive, resolveDisplayStatuses } from '@/lib/variantPipelineSteps';
import { formatIstWhen, formatJobDuration, jobDurationMs } from '@/lib/istTime';

// Full-alpha 2px ring (the global one is 45% alpha, under 3:1 on white).
const FOCUS = 'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]';

/**
 * Summary: the first tab of the workbench, laid out as a small case dashboard.
 *
 *   case header (file, one status sentence, in-scope count, the next action)
 *   -> stage rail (Upload, Interpret, Annotate, Reduce, Chat ready; the same five steps as the Pipeline tab)
 *   -> chromosomes with variants (only when the file's metadata carries a chromosome column)
 *   -> jump cards (Variants, Results, Pipeline), each with a tiny mini-visual
 *
 * State words are fixed so nothing contradicts itself: done | running | pending | failed, and the rail is
 * built from `computePipelineSteps`, the same function the Pipeline tab uses, so the two cannot disagree.
 * Honest data only: a time is shown only when the server recorded it, and a missing one is simply absent.
 * Pure presentation; `deriveSummary` turns the page's existing state into props.
 */

// One vocabulary for every stage: nothing is ever shown by colour or icon alone.
export const STATE_WORD = { done: 'Done', running: 'Running', failed: 'Failed', pending: 'Not started' };

function nf(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString() : null;
}

/* ------------------------------------------------------------------------------------------------
 * Stages
 * ---------------------------------------------------------------------------------------------- */

// Rail labels, the full name (screen readers), and the sentence names used in the status line.
const STAGE_COPY = {
  upload: { short: 'Upload', name: 'Upload', noun: 'Upload', running: 'Uploading and checking the file.' },
  interpret: { short: 'Interpret', name: 'Interpretation', noun: 'Interpretation', running: 'Checking the columns in this file.' },
  annovar: { short: 'Annotate', name: 'Annotation', noun: 'Annotation', running: 'Annotating variants.' },
  reduce: { short: 'Reduce', name: 'Reduce variants', noun: 'Prioritization', running: 'Applying the filter.' },
  chat: { short: 'Chat ready', name: 'Chat ready', noun: 'Chat', running: 'Getting chat ready.' },
};

const stateOf = (status) => (status === 'skipped' ? 'done' : status === 'waiting' ? 'pending' : status || 'pending');

/** The reduce step is owned by whichever of the two jobs is live, else the one that finished last. */
function pickReduceJob(filterJob, exomiserStatus) {
  const t = (j) => Date.parse(j?.completed_at || '') || 0;
  return t(exomiserStatus) >= t(filterJob) ? exomiserStatus || filterJob : filterJob || exomiserStatus;
}

/** Chromosome order for the ruler and GRCh38 lengths in Mb (used for proportions only). */
const CHROMS = [
  ['1', 248.96], ['2', 242.19], ['3', 198.3], ['4', 190.21], ['5', 181.54], ['6', 170.81], ['7', 159.35], ['8', 145.14],
  ['9', 138.39], ['10', 133.8], ['11', 135.09], ['12', 133.28], ['13', 114.36], ['14', 107.04], ['15', 101.99], ['16', 90.34],
  ['17', 83.26], ['18', 80.37], ['19', 58.62], ['20', 64.44], ['21', 46.71], ['22', 50.82], ['X', 156.04], ['Y', 57.23],
];
const CONTIG_COLUMN = /^#?(chrom|chromosome|chr|contig|seqname|seqid)$/i;

function normContig(v) {
  const s = String(v ?? '').trim().replace(/^chr/i, '').toUpperCase();
  return s === 'M' ? 'MT' : s;
}

/**
 * Which chromosomes carry variants, from the file's own metadata (`categorical_columns`, already fetched
 * for the filter sidebar). This says which chromosomes are present, not how many variants each has, and a
 * file whose chromosome column is all numbers is not listed there at all, so then there is no ruler.
 */
export function deriveContigs(categoricalColumns, sampleOnly = false) {
  if (!categoricalColumns || typeof categoricalColumns !== 'object') return null;
  const key = Object.keys(categoricalColumns).find((k) => CONTIG_COLUMN.test(k));
  if (!key) return null;
  const raw = categoricalColumns[key];
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.values) ? raw.values : null;
  if (!list || !list.length) return null;
  const present = new Set(list.map(normContig));
  const known = new Set([...CHROMS.map(([c]) => c), 'MT']);
  const recognised = [...present].filter((c) => known.has(c));
  if (!recognised.length) return null;
  return { present, mt: present.has('MT'), sampleOnly: Boolean(sampleOnly) };
}

/** Turn the page state into summary props. Defensive: every input may be missing. */
export function deriveSummary({
  fileName,
  genome,
  analysisType,
  sequencingType,
  totalVariants,
  filteredVariantCount,
  hasAnnotatedFile,
  requiresAnnovar,
  isRunningAnnovar,
  isFiltering,
  filterActive,
  filterLabel,
  chatAllowed,
  nextAction,
  // The Pipeline tab's own inputs, so both tabs are built from the same function.
  annovarJob,
  filterJob,
  exomiserStatus,
  isRunningExomiser,
  isApplyingProprietaryFilter,
  columnInterpretationResult,
  chatEligibility,
  activeProprietaryFilter,
  activeVariantFilters,
  s3LineCountStatus,
  uploadInProgress,
  uploadProgress,
  categoricalColumns,
  sampleOnly,
  now,
}) {
  const total = Number(totalVariants);
  const filtered = Number(filteredVariantCount);
  const inScope = Number.isFinite(filtered) ? filtered : Number.isFinite(total) ? total : null;

  const statuses = computePipelineSteps({
    hasUploadedFile: true,
    columnInterpretationResult,
    hasAnnotatedFile: Boolean(hasAnnotatedFile),
    requiresAnnovar,
    isRunningAnnovar: Boolean(isRunningAnnovar),
    isApplyingProprietaryFilter: Boolean(isApplyingProprietaryFilter ?? isFiltering),
    annovarJob,
    filterJob,
    chatEligibility: chatEligibility ?? (chatAllowed != null ? { allowed: Boolean(chatAllowed) } : null),
    activeProprietaryFilter: activeProprietaryFilter ?? (filterActive ? 'filter_1' : null),
    activeVariantFilters,
    filteredVariantCount: Number.isFinite(filtered) ? filtered : null,
    s3LineCountStatus,
    uploadInProgress: Boolean(uploadInProgress),
    uploadProgress,
    isRunningExomiser: Boolean(isRunningExomiser),
    exomiserStatus,
  });

  const busy = getPipelineBackgroundActive({
    uploadInProgress,
    isRunningAnnovar,
    isApplyingProprietaryFilter: Boolean(isApplyingProprietaryFilter ?? isFiltering),
    annovarJob,
    filterJob,
    s3LineCountStatus,
    columnInterpretationResult,
    isRunningExomiser,
    exomiserStatus,
  });
  const display = resolveDisplayStatuses(statuses, { busy, uploadInProgress: Boolean(uploadInProgress) });
  const reduceJob = pickReduceJob(filterJob, exomiserStatus);
  const stages = PIPELINE_STEP_DEFS.map((def) => {
    const raw = statuses[def.id];
    const state = stateOf(display[def.id]);
    const copy = STAGE_COPY[def.id];
    let elapsed = null;
    let when = null;
    if (def.id === 'annovar' && (state === 'done' || state === 'failed')) {
      elapsed = formatJobDuration(jobDurationMs(annovarJob));
      when = formatIstWhen(annovarJob?.completed_at, now);
    } else if (def.id === 'reduce' && (state === 'done' || state === 'failed')) {
      elapsed = formatJobDuration(jobDurationMs(reduceJob));
      when = formatIstWhen(reduceJob?.completed_at, now);
    }
    return {
      id: def.id,
      label: copy.short,
      name: copy.name,
      noun: copy.noun,
      state,
      skipped: raw === 'skipped',
      elapsed,
      when,
    };
  });

  // One sentence for where the case stands. Times only when the server recorded them.
  const failed = stages.find((s) => s.state === 'failed');
  const running = stages.find((s) => s.state === 'running');
  const firstPending = stages.find((s) => s.state === 'pending');
  const annovarStage = stages.find((s) => s.id === 'annovar');
  const annotationNeeded = annovarStage.state === 'pending' && (requiresAnnovar !== false) && !hasAnnotatedFile;
  let headline;
  if (failed) {
    headline = {
      tone: 'failed',
      state: 'failed',
      text: `${failed.noun} failed${failed.when ? ` at ${failed.when}` : ''}.${failed.id === 'annovar' ? ' ACMG and phenotype filters stay locked until annotation finishes.' : ' Open the pipeline for details.'}`,
    };
  } else if (running) {
    const startedAt = running.id === 'annovar' ? formatIstWhen(annovarJob?.started_at, now) : null;
    headline = { tone: 'running', state: 'running', text: `${STAGE_COPY[running.id].running}${startedAt ? ` Started ${startedAt}.` : ''}` };
  } else if (stages.find((s) => s.id === 'chat').state === 'done') {
    headline = {
      tone: 'ready',
      state: 'done',
      text: inScope != null ? `Ready to chat about ${nf(inScope)} variants.` : 'Ready to chat.',
    };
  } else if (annotationNeeded) {
    headline = { tone: 'todo', state: 'pending', text: 'Annotation has not run yet. It unlocks the ACMG and phenotype filters.' };
  } else if (firstPending?.id === 'reduce' || firstPending?.id === 'chat') {
    headline = { tone: 'todo', state: 'pending', text: 'Annotated. Apply a filter to enable chat.' };
  } else {
    headline = { tone: 'todo', state: 'pending', text: 'Waiting for the next step.' };
  }

  return {
    fileName,
    meta: [genome, sequencingType, analysisType].filter(Boolean).join(' · '),
    inScope,
    total: Number.isFinite(total) ? total : null,
    filterLabel: filterLabel || null,
    stages,
    headline,
    contigs: deriveContigs(categoricalColumns, sampleOnly),
    nextAction: nextAction || null,
    annotationFailed: failed?.id === 'annovar',
  };
}

/* ------------------------------------------------------------------------------------------------
 * Pieces
 * ---------------------------------------------------------------------------------------------- */

const TONE = {
  failed: 'border-[color-mix(in_srgb,var(--error)_22%,transparent)] bg-[var(--error-soft)]',
  running: 'border-[color-mix(in_srgb,var(--info)_22%,transparent)] bg-[var(--info-soft)]',
  ready: 'border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))]',
  todo: 'border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-card)/0.7)]',
};

/** The disc behind a rail node; it settles with the state. */
const NODE_SURFACE = {
  done: 'bg-[hsl(var(--brand-100))]',
  running: 'bg-[var(--info-soft)]',
  failed: 'bg-[var(--error-soft)]',
  pending: 'bg-[hsl(var(--wb-card))]',
};

/** Compact horizontal rail. Each column: node, label, state word, and the server-recorded time when there is one. */
function StageRail({ stages }) {
  return (
    <ol className="m-0 grid list-none grid-cols-5 p-0" aria-label="Pipeline stages">
      {stages.map((s, i) => {
        const prev = stages[i - 1];
        const lit = prev && prev.state === 'done';
        return (
          <li key={s.id} className="relative flex min-w-0 flex-col items-center px-1 text-center">
            {i > 0 ? (
              <span aria-hidden="true" className="absolute right-1/2 top-[13px] h-0.5 w-full overflow-hidden rounded-full bg-[hsl(var(--wb-line-strong))]">
                <span
                  className="block h-full w-full origin-left bg-[hsl(var(--brand-500))] transition-transform duration-500 ease-out motion-reduce:transition-none"
                  style={{ transform: `scaleX(${lit ? 1 : 0})`, transitionDelay: lit ? '280ms' : '0ms' }}
                />
              </span>
            ) : null}
            <span
              aria-hidden="true"
              className={cn('relative z-10 flex size-7 items-center justify-center rounded-full transition-colors duration-300 motion-reduce:transition-none', NODE_SURFACE[s.state])}
            >
              <StageMark state={s.state} size={26} />
            </span>
            <span className={cn('mt-2 block max-w-full text-[12.5px] leading-4 [overflow-wrap:anywhere]', s.state === 'pending' ? 'text-muted-foreground' : 'font-medium text-foreground')}>
              {s.label}
            </span>
            <span
              className={cn(
                'mt-0.5 block text-[11.5px] leading-4',
                s.state === 'failed' ? 'font-medium text-[var(--error)]' : s.state === 'running' ? 'text-[var(--info)]' : 'text-muted-foreground'
              )}
            >
              <span className="sr-only">{`${s.name}: `}</span>
              {s.skipped ? 'Not needed' : STATE_WORD[s.state]}
            </span>
            {s.elapsed ? <span className="mt-0.5 block text-[11.5px] leading-4 tabular-nums text-muted-foreground">{s.elapsed}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** One ruler for the genome: a rounded segment per chromosome, lit when the file has variants on it. */
function GenomeRuler({ contigs }) {
  const chroms = contigs.mt ? [...CHROMS, ['MT', 0.0165]] : CHROMS;
  const W = 520;
  const GAP = 3;
  const sum = chroms.reduce((a, [, l]) => a + l, 0);
  const avail = W - GAP * (chroms.length - 1);
  let x = 0;
  const segs = chroms.map(([c, l]) => {
    const w = Math.max(5, (avail * l) / sum);
    const seg = { c, x, w, on: contigs.present.has(c) };
    x += w + GAP;
    return seg;
  });
  const total = segs[segs.length - 1].x + segs[segs.length - 1].w;
  const labelled = new Set(['1', '5', '10', '15', '20', 'X']);
  const onList = segs.filter((s) => s.on).map((s) => s.c);
  const offList = segs.filter((s) => !s.on).map((s) => s.c);
  const label = `Chromosomes with variants: ${onList.join(', ') || 'none'}.${offList.length ? ` None recorded on ${offList.join(', ')}.` : ''}`;
  return (
    <svg viewBox={`0 0 ${total} 40`} className="block h-auto w-full" role="img" aria-label={label}>
      {segs.map((s) => (
        <g key={s.c}>
          <rect
            x={s.x}
            y="4"
            width={s.w}
            height="16"
            rx="4"
            fill={s.on ? 'hsl(var(--brand-500))' : 'hsl(var(--brand-100))'}
            stroke={s.on ? 'none' : 'hsl(var(--wb-line-strong))'}
            strokeWidth="1"
            strokeDasharray={s.on ? undefined : '2.5 2.5'}
            opacity={s.on ? 0.95 : 0.9}
          />
          {labelled.has(s.c) ? (
            <text x={s.x + s.w / 2} y="36" textAnchor="middle" fontSize="11.5" fill="hsl(var(--muted-foreground))" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {s.c}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

/* Mini visuals for the jump cards. Decorative except where they draw real state (in scope, stage states). */
function GlyphScope({ inScope, total }) {
  const frac = inScope != null && total ? Math.max(0.04, Math.min(1, inScope / total)) : null;
  return (
    <svg viewBox="0 0 120 34" className="h-8 w-[104px]" aria-hidden="true">
      <rect x="0" y="4" width="120" height="8" rx="4" fill="hsl(var(--brand-200))" />
      <rect x="0" y="22" width="120" height="8" rx="4" fill="hsl(var(--brand-100))" stroke="hsl(var(--brand-200))" strokeWidth="1" />
      <rect x="0" y="22" width={frac != null ? 120 * frac : 0} height="8" rx="4" fill="hsl(var(--brand-500))" />
    </svg>
  );
}

function GlyphTable() {
  return (
    <svg viewBox="0 0 120 34" className="h-8 w-[104px]" aria-hidden="true" fill="none" stroke="hsl(var(--brand-300))" strokeWidth="1.4" strokeLinecap="round">
      <rect x="1" y="2" width="118" height="30" rx="6" fill="hsl(var(--wb-card))" stroke="hsl(var(--brand-200))" />
      <path d="M1 12h118M40 2v30M82 2v30" stroke="hsl(var(--brand-200))" />
      <path d="M8 7h20M48 7h24M90 7h18" stroke="hsl(var(--brand-500))" />
      <path d="M8 17.5h14M48 17.5h30M90 17.5h10M8 25h18M48 25h18M90 25h20" />
    </svg>
  );
}

function GlyphStages({ stages }) {
  const color = { done: 'hsl(var(--brand-500))', running: 'var(--info)', failed: 'var(--error)', pending: 'hsl(var(--brand-200))' };
  return (
    <svg viewBox="0 0 120 34" className="h-8 w-[104px]" aria-hidden="true">
      <path d="M12 17H108" stroke="hsl(var(--brand-200))" strokeWidth="2" strokeLinecap="round" />
      {stages.map((s, i) => (
        <circle key={s.id} cx={12 + i * 24} cy="17" r="6" fill={s.state === 'pending' ? 'hsl(var(--wb-card))' : color[s.state]} stroke={color[s.state]} strokeWidth="1.8" strokeDasharray={s.state === 'pending' ? '2 2.4' : undefined} />
      ))}
    </svg>
  );
}

function JumpCard({ title, meta, onClick, glyph }) {
  return (
    <button type="button" onClick={onClick} className={cn('group wb-card flex h-full w-full min-w-0 flex-col overflow-hidden text-left group-data-[w=narrow]/tab:flex-row transition-[border-color,background-color,transform] duration-150 hover:border-[hsl(var(--brand-300))] active:scale-[0.995] motion-reduce:transition-none', FOCUS)}>
      <span aria-hidden="true" className="flex h-[54px] items-center group-data-[w=narrow]/tab:h-auto group-data-[w=narrow]/tab:w-24 group-data-[w=narrow]/tab:shrink-0 group-data-[w=narrow]/tab:border-b-0 group-data-[w=narrow]/tab:border-r border-b border-[hsl(var(--wb-line))] bg-[hsl(var(--brand-50))] px-3.5 transition-colors duration-150 group-hover:bg-[hsl(var(--brand-100))]">{glyph}</span>
      <span className="flex flex-1 items-center gap-2 px-3.5 py-2.5">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium leading-[18px] text-foreground">{title}</span>
          {meta ? <span className="block text-xs leading-[18px] tabular-nums text-muted-foreground">{meta}</span> : null}
        </span>
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--wb-pill))] text-muted-foreground" aria-hidden="true">
          <ChevronRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[hsl(var(--brand-700))] motion-reduce:transition-none" />
        </span>
      </span>
    </button>
  );
}

function SectionTitle({ children, trailing }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <h3 className="wb-card-title m-0">{children}</h3>
      {trailing}
    </div>
  );
}

function Shell({ children, className }) {
  const [ref] = usePanelWidth();
  return <div ref={ref} className={cn('group/tab h-full min-h-0 space-y-3 overflow-y-auto overscroll-contain px-4 pb-6 pt-1 group-data-[w=narrow]/tab:px-3 group-data-[w=narrow]/tab:pb-[max(1.5rem,var(--mtabs-safe-b,env(safe-area-inset-bottom)))]', className)}>{children}</div>;
}

export default function SummaryTab({ summary, jumps = [], emptyAction, loading = false, error = null, className }) {
  if (loading) {
    return (
      <Shell className={className}>
        <div className="wb-card p-4" role="status" aria-label="Loading the case summary" aria-busy="true">
          <div className="wb-shimmer h-3 w-20 rounded-full" />
          <div className="wb-shimmer mt-3 h-7 w-3/4 rounded-full" />
          <div className="wb-shimmer mt-3 h-12 rounded-2xl" />
          <div className="wb-shimmer mt-4 h-10 rounded-full" />
        </div>
        <div className="wb-card p-4" aria-hidden="true">
          <div className="grid grid-cols-5 gap-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="wb-shimmer h-14 rounded-xl" />)}</div>
        </div>
      </Shell>
    );
  }
  if (error) {
    return (
      <div className={cn('flex h-full flex-col items-center justify-center gap-2 px-8 text-center', className)}>
        <div role="alert" className="wb-card wb-rise flex w-full max-w-sm flex-col items-center gap-2 px-6 py-7">
          <StageMark state="failed" size={32} />
          <p className="m-0 mt-1 text-[15px] font-medium text-foreground">{error.title || 'The summary could not load'}</p>
          <p className="m-0 max-w-xs text-[13px] leading-5 text-muted-foreground">{error.message || 'Something went wrong reading this case. Your file is untouched.'}</p>
          {error.onRetry ? (
            <Button variant="outline" size="sm" onClick={error.onRetry} className="mt-2">
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    );
  }
  if (!summary) {
    return (
      <div className={cn('flex h-full flex-col items-center justify-center px-6', className)}>
        <div className="wb-card wb-rise tx tx--lattice flex w-full max-w-sm flex-col items-center gap-2 overflow-hidden px-6 pb-7 pt-8 text-center" style={{ '--tx-at': '50% 0%', '--tx-fade': '85% 48%' }}>
          <span className="flex size-11 items-center justify-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-500))]" aria-hidden="true">
            <FileText className="size-5" />
          </span>
          <h2 className="font-display m-0 mt-1 text-[26px] text-foreground">No file yet</h2>
          <p className="m-0 max-w-[30ch] text-[13px] leading-5 text-muted-foreground">Add a variants file or raw sequencing data from the composer. This tab then follows the case from upload to chat.</p>
          {emptyAction ? (
            <Button variant="outline" size="sm" onClick={emptyAction.onClick} className="mt-3">{emptyAction.label}</Button>
          ) : null}
        </div>
      </div>
    );
  }

  const { fileName, meta, inScope, total, stages, headline, contigs, nextAction, annotationFailed, filterLabel } = summary;
  const pct = inScope != null && total ? Math.max(2, Math.min(100, (inScope / total) * 100)) : null;
  const chips = meta ? meta.split(' · ') : [];
  // Interpretation is a quick check that should never lock the action, so only the long stages put the button into its running state.
  const anyRunning = stages.some((s) => s.state === 'running' && s.id !== 'interpret');
  const doneCount = stages.filter((s) => s.state === 'done').length;
  const readyAction = !nextAction ? jumps.find((j) => j.id === 'results') : null;
  // The primary action changes with the state: retry after a failure, run when waiting, review when ready.
  const action = nextAction
    ? {
        label: annotationFailed && /annotation/i.test(nextAction.label) && !/again/i.test(nextAction.label) ? 'Run annotation again' : nextAction.label,
        onClick: nextAction.onClick,
        icon: annotationFailed ? RotateCcw : ArrowRight,
      }
    : readyAction && headline.tone === 'ready'
      ? { label: 'Review the results', onClick: readyAction.onClick, icon: ArrowRight }
      : null;
  const pipelineMeta = `${doneCount} of ${stages.length} stages done${annotationFailed ? ' · annotation failed' : ''}`;

  const glyphFor = (id) => (id === 'variants' ? <GlyphScope inScope={inScope} total={total} /> : id === 'results' ? <GlyphTable /> : id === 'pipeline' ? <GlyphStages stages={stages} /> : null);

  return (
    <Shell className={className}>
      <section className="wb-card wb-rise overflow-hidden" aria-label="Case">
        <div className="tx tx--lattice bg-gradient-to-b from-[hsl(var(--brand-50))] to-transparent px-4 pb-4 pt-4" style={{ '--tx-at': '88% 0%', '--tx-fade': '75% 130%' }}>
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <FileText className="size-3.5 text-[hsl(var(--brand-500))]" aria-hidden="true" />
              Variant file
            </span>
            {chips.length ? (
              <div className="flex flex-wrap justify-end gap-1.5">
                {chips.map((c) => <span key={c} className="wb-chip">{c}</span>)}
              </div>
            ) : null}
          </div>
          <h2 className="font-display m-0 mt-2 line-clamp-2 break-words text-[28px] text-foreground" title={fileName}>{fileName || 'Untitled file'}</h2>

          <p
            key={`${headline.tone}|${headline.text}`}
            className={cn('wb-fade m-0 mt-3 flex items-start gap-2.5 rounded-2xl border px-3.5 py-2.5 text-[13px] leading-5 text-foreground', TONE[headline.tone])}
            role="status"
          >
            <span aria-hidden="true" className="mt-px flex size-5 shrink-0 items-center justify-center"><StageMark state={headline.state} size={20} /></span>
            <span className="min-w-0 flex-1">{headline.text}</span>
          </p>
        </div>

        {inScope != null ? (
          <div className="border-t border-[hsl(var(--wb-line))] px-4 py-3.5">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-[40px] tabular-nums text-[hsl(var(--brand-700))]"><CountUp value={inScope} /></span>
                  <span className="text-[13px] text-muted-foreground">{total != null ? `of ${nf(total)} variants in scope` : 'variants in scope'}</span>
                </div>
                {filterLabel ? <p className="m-0 mt-0.5 text-xs text-muted-foreground">{filterLabel}</p> : null}
              </div>
              {pct != null && pct < 100 ? <span className="shrink-0 pb-1.5 text-xs tabular-nums text-muted-foreground">{Math.round(pct)}%</span> : null}
            </div>
            {pct != null && pct < 100 ? (
              <div className="wb-track mt-2.5" role="progressbar" aria-label="Variants in scope" aria-valuemin={0} aria-valuemax={total} aria-valuenow={inScope}>
                <div className="wb-fill" style={{ width: `${pct}%` }} />
              </div>
            ) : null}
          </div>
        ) : null}

        {action ? (
          <div className="px-4 pb-4 pt-0.5">
            <StateButton
              state={anyRunning ? 'running' : 'idle'}
              labels={{ idle: action.label, running: action.label }}
              icon={action.icon}
              onClick={action.onClick}
              className="w-full"
              size="lg"
            />
          </div>
        ) : null}
      </section>

      <section className="wb-card wb-rise px-3 pb-4 pt-3.5" style={{ animationDelay: '60ms' }} aria-label="Stages">
        <SectionTitle trailing={<span className="wb-chip tabular-nums">{doneCount} of {stages.length} done</span>}>Stages</SectionTitle>
        <StageRail stages={stages} />
      </section>

      {contigs ? (
        <section className="wb-card wb-rise px-4 pb-3.5 pt-3.5" style={{ animationDelay: '100ms' }} aria-label="Chromosomes with variants">
          <SectionTitle trailing={<span className="wb-chip tabular-nums">{[...contigs.present].filter((c) => c === 'MT' || CHROMS.some(([k]) => k === c)).length} of {CHROMS.length + (contigs.mt ? 1 : 0)}</span>}>
            Chromosomes with variants
          </SectionTitle>
          <GenomeRuler contigs={contigs} />
          <p className="m-0 mt-1.5 text-[11.5px] leading-4 text-muted-foreground">
            Lit where the file has at least one variant, drawn to GRCh38 chromosome lengths.
            {contigs.sampleOnly ? ' Read from a sample of the file.' : ''}
          </p>
        </section>
      ) : null}

      {jumps.length > 0 ? (
        <section className="wb-rise" style={{ animationDelay: '140ms' }} aria-label="Open">
          <h3 className="wb-card-title mb-2 px-1">Open</h3>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(168px,1fr))] gap-2 p-0 group-data-[w=narrow]/tab:grid-cols-1">
            {jumps.map((j) => (
              <li key={j.id} className="flex min-w-0">
                <JumpCard title={j.title} meta={j.id === 'pipeline' ? pipelineMeta : j.meta} onClick={j.onClick} glyph={glyphFor(j.id)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Shell>
  );
}
