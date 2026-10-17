import React, { useId, useRef, useState } from 'react';

/**
 * Landing "How it works": four steps on the left, a window on the right that shows that step as the
 * product looks (HTML and SVG, so it follows light/dark and stays crisp). Everything inside the window
 * is synthetic and labelled as such. Arrow keys move between steps; the window keeps one height so the
 * page does not jump when the step changes.
 */

const STEPS = [
  {
    id: 'check',
    title: 'Check the file or the reads',
    body: 'Start from a VCF or a variant table, or from FASTQ reads. Geneie checks what each step needs and says what is missing; for reads it reports quality as part of the run.',
  },
  {
    id: 'narrow',
    title: 'Annotate and narrow',
    body: 'Unannotated files are annotated with ANNOVAR. Then narrow the set with ACMG classification and gnomAD frequency, or with phenotype-driven ranking.',
  },
  {
    id: 'rank',
    title: 'See the ranked candidates',
    body: 'Candidates come with the reasons they ranked, scores from the established tools, and a next step for the analyst. Nothing is hidden behind a single number.',
  },
  {
    id: 'ask',
    title: 'Ask, then write it up',
    body: 'Ask questions about the filtered rows in plain language, then export a table or a draft case report for an analyst to review.',
  },
];

const LINE = 'hsl(var(--wb-line))';

/* ------------------------------------------------------------ fragments */

function Stat({ label, value, note }) {
  return (
    <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: LINE, background: 'hsl(var(--wb-card))' }}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums leading-6">{value}</div>
      <div className="text-xs text-muted-foreground">{note}</div>
    </div>
  );
}

/** Smooth-ish per-cycle quality curve: starts high, drifts down; read 2 sits a little lower. */
function curve(x0, x1, y, drop, wobble) {
  const pts = [];
  for (let i = 0; i <= 40; i += 1) {
    const t = i / 40;
    const q = y + drop * t * t + wobble * Math.sin(i * 1.7) * (0.3 + t);
    pts.push(`${(x0 + (x1 - x0) * t).toFixed(1)},${q.toFixed(1)}`);
  }
  return `M${pts.join(' L')}`;
}

function ReadsFragment() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Reads" value="48.2 M" note="paired-end" />
        <Stat label="Q30 bases" value="94.1%" note="after filtering" />
        <Stat label="Kept" value="97.6%" note="of all reads" />
        <Stat label="Duplication" value="6.8%" note="estimated" />
      </div>
      <figure className="rounded-xl border p-3" style={{ borderColor: LINE, background: 'hsl(var(--wb-card))' }}>
        <figcaption className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Quality along the read</span>
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 rounded" style={{ background: 'hsl(var(--brand-500))' }} />Read 1</span>
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 rounded" style={{ background: 'hsl(var(--brand-300))' }} />Read 2</span>
          </span>
        </figcaption>
        <svg viewBox="0 0 400 124" role="img" aria-label="Illustrative per-base quality curves for read 1 and read 2, read 2 drifting lower than read 1 toward the end" className="h-auto w-full">
          {[[16, 'Q40'], [56, 'Q30'], [96, 'Q20']].map(([y, l]) => (
            <g key={l}>
              <line x1="30" x2="396" y1={y} y2={y} stroke={LINE} strokeDasharray={l === 'Q30' ? '4 4' : undefined} />
              <text x="0" y={y + 4} fontSize="10" fill="currentColor" opacity="0.55">{l}</text>
            </g>
          ))}
          <path d={curve(30, 396, 30, 36, 1.2)} fill="none" stroke="hsl(var(--brand-300))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d={curve(30, 396, 26, 22, 1)} fill="none" stroke="hsl(var(--brand-500))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <text x="30" y="118" fontSize="10" fill="currentColor" opacity="0.55">1</text>
          <text x="396" y="118" fontSize="10" textAnchor="end" fill="currentColor" opacity="0.55">150 bp</text>
        </svg>
      </figure>
      <p className="text-xs text-muted-foreground">Quality is reported per cycle for each read, next to the share of reads kept.</p>
    </div>
  );
}

function NarrowFragment() {
  const stages = [
    { label: 'Annotated variants', note: 'ANNOVAR', n: 1284, w: 100 },
    { label: 'ClinVar pathogenic or likely pathogenic', note: 'ACMG filter', n: 41, w: 62 },
    { label: 'gnomAD allele frequency below 0.01', note: 'population', n: 12, w: 38 },
    { label: 'Ranked against the phenotype', note: 'HPO + Exomiser', n: 3, w: 18 },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" aria-label="Applied filters">
        <span className="wb-chip" data-tone="brand">ACMG: P / LP</span>
        <span className="wb-chip" data-tone="brand">gnomAD AF &lt; 0.01</span>
        <span className="wb-chip" data-tone="brand">Phenotype: infantile seizures</span>
      </div>
      <ol className="space-y-3">
        {stages.map((s) => (
          <li key={s.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0">
                {s.label} <span className="text-xs text-muted-foreground">· {s.note}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{s.n.toLocaleString('en-US')}</span>
            </div>
            <div className="h-2.5 rounded-full" style={{ background: 'hsl(var(--wb-pill))' }}>
              <div className="h-full rounded-full" style={{ width: `${s.w}%`, background: 'hsl(var(--brand-500))', opacity: 0.35 + (s.w / 100) * 0.1 }} />
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">Each stage is a saved filter you can reopen, change or undo.</p>
    </div>
  );
}

function RankFragment() {
  const rows = [
    { gene: 'SCN1A', v: 'c.664C>T', label: 'Primary candidate', tone: 'brand', why: 'Exomiser combined score 0.97 · ACMG pathogenic · seizures match the phenotype' },
    { gene: 'KCNQ2', v: 'c.1342G>A', label: 'Strong candidate', tone: 'brand', why: 'Combined score 0.91 · ACMG likely pathogenic · partial phenotype overlap' },
    { gene: 'STXBP1', v: 'c.902+1G>A', label: 'Follow-up', tone: undefined, why: 'Combined score 0.84 · ACMG pathogenic · review against the source evidence' },
  ];
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.gene} className="rounded-xl border p-3" style={{ borderColor: LINE, background: 'hsl(var(--wb-card))' }}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="font-semibold">{r.gene}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">{r.v}</span>
              </div>
              <span className="wb-chip shrink-0" data-tone={r.tone}>{r.label}</span>
            </div>
            <p className="mt-1.5 text-[0.8125rem] leading-5 text-muted-foreground">{r.why}</p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Labels are decision support. An analyst confirms every candidate against the source evidence.</p>
    </div>
  );
}

function AskFragment() {
  return (
    <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-2.5 text-sm leading-6">
        <p className="ml-auto w-fit max-w-[92%] rounded-2xl rounded-br-md px-3 py-2" style={{ background: 'hsl(var(--brand-100))', color: 'hsl(var(--brand-700))' }}>
          Is SCN1A reported as de novo in the file?
        </p>
        <p className="text-muted-foreground">
          The file has no inheritance column for SCN1A, so I cannot say. It does list the variant as <span className="font-medium text-foreground">heterozygous</span>, ClinVar{' '}
          <span className="font-medium text-foreground">pathogenic</span>.
        </p>
      </div>
      <div className="rounded-xl border p-3 text-[0.8125rem]" style={{ borderColor: LINE, background: 'hsl(var(--wb-card))' }}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">Case report</span>
          <span className="wb-chip">Draft</span>
        </div>
        <div className="mt-2 space-y-1 text-muted-foreground">
          <div className="flex justify-between"><span>Sample</span><span>DEMO-SAMPLE</span></div>
          <div className="flex justify-between"><span>Candidates</span><span>3 of 12</span></div>
          <div className="flex justify-between"><span>Genome</span><span>hg38 · WES</span></div>
        </div>
        <div className="mt-3 rounded-lg px-2.5 py-2" style={{ background: 'hsl(var(--wb-pill))' }}>
          <span className="font-medium">SCN1A</span> <span className="font-mono text-xs text-muted-foreground">c.664C&gt;T</span>
          <div className="text-xs text-muted-foreground">Pathogenic · analyst to confirm</div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Decision-support output. Not a diagnosis.</p>
      </div>
    </div>
      <div className="flex flex-wrap gap-1.5" aria-label="Export options">
        <span className="wb-chip">Export table (Excel)</span>
        <span className="wb-chip">Copy insight</span>
        <span className="wb-chip">Download report (PDF)</span>
      </div>
    </div>
  );
}

const FRAGMENTS = { check: ReadsFragment, narrow: NarrowFragment, rank: RankFragment, ask: AskFragment };

/* ----------------------------------------------------------------- tour */

export default function ProductTour() {
  const base = useId();
  const [active, setActive] = useState(0);
  const refs = useRef([]);
  const Fragment = FRAGMENTS[STEPS[active].id];

  const onKeyDown = (e) => {
    const k = e.key;
    let next = null;
    if (k === 'ArrowDown' || k === 'ArrowRight') next = (active + 1) % STEPS.length;
    else if (k === 'ArrowUp' || k === 'ArrowLeft') next = (active - 1 + STEPS.length) % STEPS.length;
    else if (k === 'Home') next = 0;
    else if (k === 'End') next = STEPS.length - 1;
    if (next == null) return;
    e.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  };

  return (
    <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
      <div role="tablist" aria-label="Steps" aria-orientation="vertical" onKeyDown={onKeyDown} className="grid grid-cols-2 gap-2 lg:flex lg:flex-col">
        {STEPS.map((s, i) => {
          const selected = i === active;
          return (
            <button
              key={s.id}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="tab"
              id={`${base}-t${i}`}
              aria-selected={selected}
              aria-controls={`${base}-p`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              className={
                'group rounded-2xl border px-3 py-2.5 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500))] lg:px-4 lg:py-3 ' +
                (selected ? 'border-[hsl(var(--brand-300))] bg-[hsl(var(--brand-50))]' : 'border-transparent hover:bg-[hsl(var(--wb-card))]')
              }
            >
              <span className="flex items-start gap-2.5 text-sm font-semibold leading-5 lg:items-center lg:text-[0.9375rem]">
                <span
                  aria-hidden="true"
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-medium tabular-nums"
                  style={{
                    background: selected ? 'hsl(var(--brand-solid, var(--brand-500)))' : 'hsl(var(--brand-100))',
                    color: selected ? 'hsl(var(--wb-card))' : 'hsl(var(--brand-700))',
                  }}
                >
                  {i + 1}
                </span>
                {s.title}
              </span>
              <span className={'mt-1.5 hidden pl-[2.125rem] text-sm leading-6 text-muted-foreground lg:block ' + (selected ? '' : 'lg:hidden')}>{s.body}</span>
            </button>
          );
        })}
      </div>

      <div className="min-w-0">
        <p className="mb-3 text-sm leading-6 text-muted-foreground lg:hidden">{STEPS[active].body}</p>
        <div
          role="tabpanel"
          id={`${base}-p`}
          aria-labelledby={`${base}-t${active}`}
          className="wb-card pub-card overflow-hidden"
          style={{ borderRadius: 20 }}
        >
          <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: LINE }}>
            <span className="text-xs font-medium text-muted-foreground">{STEPS[active].title}</span>
            <span className="wb-chip">Synthetic data</span>
          </div>
          <div key={STEPS[active].id} className="wb-rise min-h-[22rem] p-4 sm:p-5" style={{ animationDuration: '220ms' }}>
            <Fragment />
          </div>
        </div>
        <p className="mt-2 px-1 text-xs text-[var(--text-tertiary)]">Illustration only. Not a real case.</p>
      </div>
    </div>
  );
}
