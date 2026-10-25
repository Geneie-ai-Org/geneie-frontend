import React, { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import { ArrowUp } from 'lucide-react';
import { Collapse, CountUp } from '@/components/motion';

/**
 * Landing "How it works": an icon rail of four steps on the left; picking one rebuilds the right side as a
 * bento of tiles (a main view, two small ones and one brand-coloured number), drawn as the product looks
 * (HTML and SVG, so it follows light/dark and stays crisp). Everything shown is synthetic and labelled so.
 * Arrow keys move between steps; the grid keeps one height so the page does not jump when the step changes.
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
// Same curve as Collapse, so the rail rows and the panel tiles move as one.
const TOUR_EASE = [0.22, 1, 0.36, 1];
const SLOT_DELAY = { main: 0, a: 0.04, brand: 0.04, wide: 0.08 };

/* --------------------------------------------------------------- tiles */

const AREA = {
  main: 'col-span-2 lg:col-span-1 lg:row-span-2',
  a: 'col-span-1',
  brand: 'col-span-1',
  wide: 'col-span-2',
};

/**
 * Desktop track weights per step. The four frames never unmount; the grid tracks animate between these
 * (CSS transition on grid-template-*), so a frame grows or shrinks to make room for the next step's emphasis.
 */
const LAYOUT = {
  check: { cols: '4fr 2fr', rows: '1fr 1fr 0.7fr' },
  narrow: { cols: '3.4fr 2fr', rows: '1.1fr 0.9fr 0.8fr' },
  rank: { cols: '3fr 2fr', rows: '0.9fr 1.1fr 0.8fr' },
  ask: { cols: '4.4fr 2fr', rows: '1.2fr 0.8fr 0.7fr' },
};

/**
 * One slot of the bento. The frames stay mounted when the step changes; only their content crossfades,
 * so the grid holds still and the eye follows the content. `brand` is the single filled tile.
 */
function Tile({ area, brand = false, stepId, children }) {
  const reduce = useReducedMotion();
  return (
    <div
      className={`relative min-w-0 rounded-2xl border p-3.5 sm:p-4 ${AREA[area]}`}
      style={{
        borderColor: brand ? 'transparent' : LINE,
        background: brand ? 'hsl(var(--brand-solid))' : 'hsl(var(--wb-card))',
        color: brand ? 'hsl(var(--primary-foreground))' : undefined,
      }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={stepId}
          className="h-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.15, ease: TOUR_EASE } }}
          transition={{ duration: reduce ? 0 : 0.25, ease: TOUR_EASE, delay: reduce ? 0 : SLOT_DELAY[area] }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** True once the element has been on screen (and `delay` ms have passed), so figures start from zero when seen. */
function usePlayed(ref, delay = 0) {
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const [played, setPlayed] = useState(false);
  useEffect(() => {
    if (!inView) return undefined;
    const t = setTimeout(() => setPlayed(true), delay);
    return () => clearTimeout(t);
  }, [inView, delay]);
  return played;
}

/** A figure that counts up from 0 when it appears. */
function Tick({ value, decimals = 0, suffix = '', delay = 0, className }) {
  const ref = useRef(null);
  const played = usePlayed(ref, delay);
  return (
    <span ref={ref} className={className}>
      <CountUp value={played ? value : 0} startAt={0} decimals={decimals} duration={0.9} />
      {suffix}
    </span>
  );
}

/** A chart line that draws itself left to right when it appears. */
export function DrawPath({ delay = 0, ...props }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const played = usePlayed(ref, delay);
  return (
    <motion.path
      ref={ref}
      {...props}
      initial={false}
      animate={{ pathLength: played || reduce ? 1 : 0 }}
      transition={{ duration: reduce ? 0 : 1.1, ease: TOUR_EASE }}
    />
  );
}

/** A bar that fills from 0 to `pct` when it appears. */
function Meter({ pct, delay = 0, style }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const played = usePlayed(ref, delay);
  return (
    <div ref={ref} className="h-2.5 rounded-full" style={{ background: 'hsl(var(--wb-pill))' }}>
      <motion.div
        className="h-full rounded-full"
        style={style}
        initial={false}
        animate={{ width: played || reduce ? `${pct}%` : '0%' }}
        transition={{ duration: reduce ? 0 : 0.9, ease: TOUR_EASE }}
      />
    </div>
  );
}

const Caption = ({ children }) => <p className="text-xs leading-5 text-muted-foreground">{children}</p>;

function BigNumber({ value, label, tick, num }) {
  const cls = 'text-4xl font-semibold leading-none tracking-tight tabular-nums sm:text-5xl';
  return (
    <div className="flex h-full flex-col justify-between gap-6">
      <span className="text-[0.8125rem] font-medium opacity-90">{label}</span>
      {num ? <Tick {...num} delay={650} className={cls} /> : tick ? <Tick value={Number(value)} delay={650} className={cls} /> : <span className={cls}>{value}</span>}
    </div>
  );
}

function Stat({ label, value, note, num, delay = 450 }) {
  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div>
        <div className="text-2xl font-semibold leading-7 tabular-nums">{num ? <Tick {...num} delay={delay} /> : value}</div>
        <div className="text-xs text-muted-foreground">{note}</div>
      </div>
    </div>
  );
}

/** Smooth-ish per-cycle quality curve: starts high, drifts down; read 2 sits a little lower. */
export function curve(x0, x1, y, drop, wobble) {
  const pts = [];
  for (let i = 0; i <= 40; i += 1) {
    const t = i / 40;
    const q = y + drop * t * t + wobble * Math.sin(i * 1.7) * (0.3 + t);
    pts.push(`${(x0 + (x1 - x0) * t).toFixed(1)},${q.toFixed(1)}`);
  }
  return `M${pts.join(' L')}`;
}

/* ---------------------------------------------------------- step tiles */

const checkContent = () => {
  const cards = [
    { label: 'Reads', value: '48.2 M', num: { value: 48.2, decimals: 1, suffix: ' M' }, note: 'paired-end' },
    { label: 'Q30 bases', value: '94.1%', num: { value: 94.1, decimals: 1, suffix: '%' }, note: 'after filtering' },
    { label: 'Kept', value: '97.6%', num: { value: 97.6, decimals: 1, suffix: '%' }, note: 'of all reads' },
    { label: 'Duplication', value: '6.8%', num: { value: 6.8, decimals: 1, suffix: '%' }, note: 'estimated' },
  ];
  // All four numbers sit in a row of square cards above the chart, so this step skips the bento slots.
  return {
    full: (
      <div className="flex h-full flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map((c, i) => (
            <div key={c.label} className="rounded-2xl border px-3.5 py-3" style={{ borderColor: LINE, background: 'hsl(var(--wb-card))' }}>
              <Stat label={c.label} value={c.value} num={c.num} delay={450 + i * 100} note={c.note} />
            </div>
          ))}
        </div>
        <figure className="flex min-h-0 flex-1 flex-col rounded-2xl border p-3.5 sm:p-4" style={{ borderColor: LINE, background: 'hsl(var(--wb-card))' }}>
          <figcaption className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Quality along the read</span>
            <span className="inline-flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 rounded" style={{ background: 'hsl(var(--brand-500))' }} />Read 1</span>
              <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 rounded" style={{ background: 'hsl(var(--brand-300))' }} />Read 2</span>
            </span>
          </figcaption>
          <svg viewBox="0 0 400 124" role="img" aria-label="Illustrative per-base quality curves for read 1 and read 2, read 2 drifting lower than read 1 toward the end" className="my-auto h-auto max-h-full w-full text-foreground">
            {[[16, 'Q40'], [56, 'Q30'], [96, 'Q20']].map(([y, l]) => (
              <g key={l}>
                <line x1="30" x2="396" y1={y} y2={y} stroke={LINE} strokeDasharray={l === 'Q30' ? '4 4' : undefined} />
                <text x="0" y={y + 4} fontSize="10" fill="currentColor" opacity="0.55">{l}</text>
              </g>
            ))}
            <DrawPath delay={350} d={curve(30, 396, 30, 36, 1.2)} fill="none" stroke="hsl(var(--brand-300))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <DrawPath delay={250} d={curve(30, 396, 26, 22, 1)} fill="none" stroke="hsl(var(--brand-500))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <text x="30" y="118" fontSize="10" fill="currentColor" opacity="0.55">1</text>
            <text x="396" y="118" fontSize="10" textAnchor="end" fill="currentColor" opacity="0.55">150 bp</text>
          </svg>
          <Caption>Quality is reported per cycle for each read, next to the share of reads kept.</Caption>
        </figure>
      </div>
    ),
  };
};

const narrowContent = () => {
  const stages = [
    { label: 'Annotated variants', note: 'ANNOVAR', n: 1284, w: 100 },
    { label: 'ClinVar P / LP', note: 'ACMG', n: 41, w: 62 },
    { label: 'gnomAD allele frequency below 0.01', note: 'population', n: 12, w: 38 },
    { label: 'Ranked against the phenotype', note: 'HPO + Exomiser', n: 3, w: 18 },
  ];
  return {
    main: (
      <>
        <ol className="flex h-full flex-col justify-between gap-3">
          {stages.map((st, i) => (
            <li key={st.label}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0">
                  {st.label} <span className="text-xs text-muted-foreground">· {st.note}</span>
                </span>
                <Tick value={st.n} delay={250 + i * 120} className="shrink-0 font-semibold tabular-nums" />
              </div>
              <Meter pct={st.w} delay={250 + i * 120} style={{ background: 'hsl(var(--brand-500))', opacity: 0.35 + (st.w / 100) * 0.1 }} />
            </li>
          ))}
        </ol>
      </>
    ),
    a: (
      <>
        <div className="flex h-full flex-col justify-between gap-3">
          <span className="text-xs text-muted-foreground">Applied filters</span>
          <div className="flex flex-wrap gap-1.5" aria-label="Applied filters">
            <span className="wb-chip" data-tone="brand">ACMG: P / LP</span>
            <span className="wb-chip" data-tone="brand">gnomAD AF &lt; 0.01</span>
          </div>
        </div>
      </>
    ),
    brand: (
      <><BigNumber value="3" tick label="candidates left of 1,284" /></>
    ),
    wide: (
      <div className="flex h-full items-center"><Caption>Each stage is a saved filter you can reopen, change or undo. Or rank by phenotype instead: describe it in plain words and Geneie derives the HPO terms.</Caption></div>
    ),
  };
};

const rankContent = () => {
  const rows = [
    { gene: 'SCN1A', v: 'c.664C>T', label: 'Primary candidate', tone: 'brand', why: 'ACMG pathogenic · seizures match the phenotype' },
    { gene: 'KCNQ2', v: 'c.1342G>A', label: 'Strong candidate', tone: 'brand', why: 'ACMG likely pathogenic · partial phenotype overlap' },
    { gene: 'STXBP1', v: 'c.902+1G>A', label: 'Follow-up', tone: undefined, why: 'ACMG pathogenic · review against the source evidence' },
  ];
  return {
    main: (
      <>
        <div className="flex h-full flex-col gap-5">
          <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Ranked candidates</span>
            <span>by Exomiser score</span>
          </div>
          <ol className="flex min-h-0 flex-1 flex-col justify-between gap-2.5">
            {rows.map((r, i) => (
              <li key={r.gene}>
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
                    style={i === 0 ? { background: 'hsl(var(--brand-solid))', color: 'hsl(var(--primary-foreground))' } : { border: `1px solid ${LINE}`, color: 'hsl(var(--muted-foreground))' }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="font-semibold">{r.gene}</span>
                      <span className="truncate font-mono text-xs text-muted-foreground">{r.v}</span>
                    </div>
                    <span className="wb-chip shrink-0" data-tone={r.tone}>{r.label}</span>
                  </div>
                </div>
                <p className="mt-1.5 text-[0.8125rem] leading-5 text-muted-foreground">{r.why}</p>
              </li>
            ))}
          </ol>
        </div>
      </>
    ),
    a: (
      <><Stat label="Exomiser combined score" value="0.97" num={{ value: 0.97, decimals: 2 }} note="SCN1A" /></>
    ),
    brand: (
      <><BigNumber value="SCN1A" label="primary candidate" /></>
    ),
    wide: (
      <div className="flex h-full items-center"><Caption>Ranked by combined score, with the reasons shown; the order is a starting point. Labels are decision support: an analyst confirms every candidate against the source evidence.</Caption></div>
    ),
  };
};

const askContent = () => {
  return {
    main: (
      <>
        {/* Drawn with the app's own chat classes (bubble, composer, pills), so it reads as the real window. */}
        <div className="flex h-full flex-col gap-4">
          <div className="flex min-h-0 flex-1 flex-col justify-end gap-4">
            <div className="flex w-full justify-end">
              <div className="chat-user-bubble">Is SCN1A reported as de novo in the file?</div>
            </div>
            <div>
              <p className="text-[0.9375rem] leading-[1.65]" style={{ color: 'var(--text-primary)' }}>
                The file has no inheritance column for SCN1A, so I cannot say. It does list the variant as{' '}
                <strong className="font-semibold">heterozygous</strong>, ClinVar <strong className="font-semibold">pathogenic</strong>.
              </p>
            </div>
          </div>
          <div className="pipeline-composer [&&&]:!shadow-none flex items-center gap-2 py-2 pl-4 pr-2" aria-hidden="true" inert>
            <span className="min-w-0 flex-1 truncate text-[15px] leading-6 text-muted-foreground">Ask about your variants</span>
            <span className="chat-tool chat-tool-send"><ArrowUp className="chat-send-arrow" /></span>
          </div>
        </div>
      </>
    ),
    a: (
      <>
        <div className="text-[0.8125rem]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">Case report</span>
            <span className="wb-chip">Draft</span>
          </div>
          <div className="mt-2 space-y-1 text-muted-foreground">
            <div className="flex justify-between"><span>Candidates</span><span>3 of 12</span></div>
            <div className="flex justify-between"><span>Genome</span><span>hg38 · WES</span></div>
          </div>
        </div>
      </>
    ),
    brand: (
      <><BigNumber value="Draft" label="case report, ready for review" /></>
    ),
    wide: (
      <>
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Export options">
          <span className="wb-chip">Export table (Excel)</span>
          <span className="wb-chip">Copy insight</span>
          <span className="wb-chip">Download report (PDF)</span>
          <span className="ml-auto text-xs text-muted-foreground">Decision-support output. Not a diagnosis.</span>
        </div>
      </>
    ),
  };
};

const CONTENT = { check: checkContent(), narrow: narrowContent(), rank: rankContent(), ask: askContent() };
const SLOTS = ['main', 'a', 'brand', 'wide'];
const STEP_MS = 6000;

/* ----------------------------------------------------------------- tour */

export default function ProductTour() {
  const base = useId();
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true); // steps advance on their own until the visitor takes over
  const [inView, setInView] = useState(false);
  const [held, setHeld] = useState(false); // hover or focus on the step list (not the panel on the right) pauses the timer
  const refs = useRef([]);
  const root = useRef(null);
  const running = auto && inView && !held && !reduce;

  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const obs = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.4 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const choose = (next) => {
    setAuto(false);
    setActive(next);
  };

  const onKeyDown = (e) => {
    const k = e.key;
    let next = null;
    if (k === 'ArrowDown' || k === 'ArrowRight') next = (active + 1) % STEPS.length;
    else if (k === 'ArrowUp' || k === 'ArrowLeft') next = (active - 1 + STEPS.length) % STEPS.length;
    else if (k === 'Home') next = 0;
    else if (k === 'End') next = STEPS.length - 1;
    if (next == null) return;
    e.preventDefault();
    choose(next);
    refs.current[next]?.focus();
  };

  const step = STEPS[active];
  const content = CONTENT[step.id];

  return (
    <div className="mt-8">
    <div
      ref={root}
      className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8"
    >
      <div
        role="tablist"
        aria-label="Steps"
        aria-orientation="vertical"
        onKeyDown={onKeyDown}
        onMouseEnter={() => setHeld(true)}
        onMouseLeave={() => setHeld(false)}
        onFocusCapture={() => setHeld(true)}
        onBlurCapture={() => setHeld(false)}
        className="grid grid-cols-2 gap-2 lg:flex lg:flex-col lg:gap-0 lg:divide-y lg:overflow-hidden lg:rounded-2xl lg:border lg:divide-[hsl(var(--wb-line))] lg:border-[hsl(var(--wb-line))] lg:bg-[hsl(var(--wb-card))]"
      >
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
              onClick={() => choose(i)}
              className={
                'group relative min-h-11 overflow-hidden rounded-2xl border px-3 py-2.5 text-left outline-none transition-colors duration-[240ms] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--brand-500))] lg:flex lg:flex-auto lg:flex-col lg:justify-center lg:rounded-none lg:border-0 lg:px-5 lg:py-4 ' +
                (selected
                  ? 'border-[hsl(var(--brand-300))] bg-[hsl(var(--brand-50))]'
                  : 'border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-card))] hover:bg-[hsl(var(--wb-pill))] lg:bg-transparent')
              }
            >
              <span className="flex items-center gap-3 text-base font-medium leading-6 text-foreground lg:text-2xl lg:leading-8">
                {s.title}
              </span>
              <span className="hidden lg:block">
                <Collapse open={selected}>
                  <span className="block pt-2 text-base font-normal leading-6 text-muted-foreground">{s.body}</span>
                </Collapse>
              </span>
              {/* Auto-advance timer: a hairline that fills along the foot of the active row, then moves on. */}
              {selected && auto && !reduce ? (
                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: 'hsl(var(--wb-line))' }}>
                  <span
                    key={active}
                    className="tour-fill block h-full origin-left"
                    style={{
                      background: 'hsl(var(--brand-500))',
                      animationDuration: `${STEP_MS}ms`,
                      animationPlayState: running ? 'running' : 'paused',
                    }}
                    onAnimationEnd={() => setActive((a) => (a + 1) % STEPS.length)}
                  />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="min-w-0">
        <div className="lg:hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={step.id}
              className="mb-3 text-base leading-6 text-muted-foreground"
              initial={reduce ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.18, ease: TOUR_EASE }}
            >
              {step.body}
            </motion.p>
          </AnimatePresence>
        </div>
        <div
          role="tabpanel"
          id={`${base}-p`}
          aria-labelledby={`${base}-t${active}`}
          style={{ '--tour-cols': LAYOUT[step.id].cols, '--tour-rows': LAYOUT[step.id].rows }}
          className="grid grid-cols-2 gap-3 lg:h-[27rem] lg:[grid-template-columns:var(--tour-cols)] lg:[grid-template-rows:var(--tour-rows)] lg:transition-[grid-template-columns,grid-template-rows] lg:duration-500 lg:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        >
          {content.full ? (
            <motion.div key={step.id} className="col-span-2 min-h-0 lg:row-span-3" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.24, ease: TOUR_EASE }}>
              {content.full}
            </motion.div>
          ) : (
            <>
              {SLOTS.map((slot) => (
                <Tile key={slot} area={slot} brand={slot === 'brand'} stepId={step.id}>
                  {content[slot]}
                </Tile>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
    <p className="mt-3 px-1 text-xs text-[var(--text-tertiary)]">Synthetic data. Illustration only, not a real case.</p>
    </div>
  );
}
